//! Anthropic Messages adapter — Rust port of `workers/ai-gateway/src/anthropic.ts`.
//!
//! Streams the Messages API via SSE, accumulates text + usage, and returns a
//! single non-streaming JSON payload to match the existing gateway contract.

use bytes::Bytes;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};

const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";

/// Request body the desktop client sends to /v1/complete.
#[derive(Debug, Deserialize)]
pub struct CompleteRequest {
    pub model: String,
    pub prompt: String,
    pub max_tokens: u32,
    #[serde(default)]
    pub system: Option<String>,
    #[serde(default)]
    pub temperature: Option<f32>,
    #[serde(default)]
    pub enable_web_search: Option<bool>,
    #[serde(default)]
    pub assistant_prefill: Option<String>,
    /**
     * Optional image content (Claude vision). When present, the first
     * user message becomes a [{type:'image'}, {type:'text'}] array
     * instead of a bare string — the prompt still supplies the text
     * part. Bytes are base64-encoded.
     */
    #[serde(default)]
    #[serde(rename = "image_base64")]
    pub image_base64: Option<String>,
    #[serde(default)]
    #[serde(rename = "image_mime")]
    pub image_mime: Option<String>,
}

/// Response shape the desktop client expects from /v1/complete.
#[derive(Debug, Serialize)]
pub struct CompleteResponse {
    pub text: String,
    #[serde(rename = "stopReason")]
    pub stop_reason: Option<String>,
    pub usage: Usage,
    pub model: String,
}

#[derive(Debug, Serialize, Default)]
pub struct Usage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

#[derive(Debug)]
pub struct AnthropicError {
    pub status: u16,
    pub message: String,
    /// Raw upstream body, kept for future error reporting / diagnostics.
    /// Not read anywhere yet — silence the dead-code lint.
    #[allow(dead_code)]
    pub upstream_body: String,
}

impl std::fmt::Display for AnthropicError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "anthropic {} {}", self.status, self.message)
    }
}
impl std::error::Error for AnthropicError {}

/// Web-search tool definition matching the worker's WEB_SEARCH_TOOL.
fn web_search_tool() -> serde_json::Value {
    serde_json::json!({
        "type": "web_search_20250305",
        "name": "web_search",
        "max_uses": 5,
    })
}

pub async fn call_anthropic(
    api_key: &str,
    client: &reqwest::Client,
    req: &CompleteRequest,
) -> Result<CompleteResponse, AnthropicError> {
    // When an image is attached, the first user message becomes a
    // multi-part content array (image then text). Otherwise we send the
    // prompt as a bare string, matching the pre-vision contract.
    let user_content: serde_json::Value = if let (Some(b64), Some(mime)) = (
        req.image_base64.as_ref().filter(|s| !s.is_empty()),
        req.image_mime.as_ref().filter(|s| !s.is_empty()),
    ) {
        serde_json::json!([
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": mime,
                    "data": b64,
                }
            },
            {
                "type": "text",
                "text": req.prompt,
            }
        ])
    } else {
        serde_json::Value::String(req.prompt.clone())
    };
    let mut messages = vec![serde_json::json!({
        "role": "user",
        "content": user_content,
    })];
    if let Some(prefill) = &req.assistant_prefill {
        messages.push(serde_json::json!({
            "role": "assistant",
            "content": prefill,
        }));
    }

    let mut body = serde_json::json!({
        "model": req.model,
        "max_tokens": req.max_tokens,
        "temperature": req.temperature.unwrap_or(0.7),
        "messages": messages,
        "stream": true,
    });
    if let Some(system) = &req.system {
        body["system"] = serde_json::Value::String(system.clone());
    }
    if req.enable_web_search.unwrap_or(false) {
        body["tools"] = serde_json::json!([web_search_tool()]);
    }

    let response = client
        .post(ANTHROPIC_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AnthropicError {
            status: 502,
            message: format!("network: {}", e),
            upstream_body: String::new(),
        })?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(AnthropicError {
            status: status.as_u16(),
            message: format!("anthropic {} {}", status.as_u16(), status.canonical_reason().unwrap_or("")),
            upstream_body: body,
        });
    }

    consume_sse_stream(response, &req.model, req.assistant_prefill.is_some()).await
}

/// Parse the SSE stream from Anthropic into one accumulated text + usage.
/// Mirrors `consumeStream()` in the TypeScript worker.
async fn consume_sse_stream(
    response: reqwest::Response,
    fallback_model: &str,
    allow_empty: bool,
) -> Result<CompleteResponse, AnthropicError> {
    let mut text = String::new();
    let mut stop_reason: Option<String> = None;
    let mut input_tokens: u32 = 0;
    let mut output_tokens: u32 = 0;
    let mut model = fallback_model.to_string();

    let mut buffer = String::new();
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let bytes: Bytes = chunk.map_err(|e| AnthropicError {
            status: 502,
            message: format!("stream: {}", e),
            upstream_body: String::new(),
        })?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        // SSE events are separated by blank lines.
        loop {
            let Some(split) = buffer.find("\n\n") else { break };
            let event_text = buffer[..split].to_string();
            buffer = buffer[split + 2..].to_string();

            let Some(data_str) = extract_data_line(&event_text) else { continue };
            let Ok(data) = serde_json::from_str::<serde_json::Value>(&data_str) else {
                continue;
            };
            let event_type = data.get("type").and_then(|v| v.as_str()).unwrap_or("");

            match event_type {
                "message_start" => {
                    if let Some(msg) = data.get("message") {
                        if let Some(m) = msg.get("model").and_then(|v| v.as_str()) {
                            model = m.to_string();
                        }
                        if let Some(it) = msg
                            .get("usage")
                            .and_then(|u| u.get("input_tokens"))
                            .and_then(|v| v.as_u64())
                        {
                            input_tokens = it as u32;
                        }
                    }
                }
                "content_block_delta" => {
                    if let Some(delta) = data.get("delta") {
                        let dtype = delta.get("type").and_then(|v| v.as_str()).unwrap_or("");
                        if dtype == "text_delta" {
                            if let Some(t) = delta.get("text").and_then(|v| v.as_str()) {
                                text.push_str(t);
                            }
                        }
                    }
                }
                "message_delta" => {
                    if let Some(delta) = data.get("delta") {
                        if let Some(sr) = delta.get("stop_reason").and_then(|v| v.as_str()) {
                            stop_reason = Some(sr.to_string());
                        }
                    }
                    if let Some(ot) = data
                        .get("usage")
                        .and_then(|u| u.get("output_tokens"))
                        .and_then(|v| v.as_u64())
                    {
                        output_tokens = ot as u32;
                    }
                }
                "error" => {
                    let msg = data
                        .get("error")
                        .and_then(|e| e.get("message"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("anthropic stream error")
                        .to_string();
                    return Err(AnthropicError {
                        status: 502,
                        message: msg,
                        upstream_body: data.to_string(),
                    });
                }
                _ => {}
            }
        }
    }

    if text.is_empty() && !allow_empty {
        return Err(AnthropicError {
            status: 502,
            message: "anthropic returned empty text".to_string(),
            upstream_body: String::new(),
        });
    }

    Ok(CompleteResponse {
        text,
        stop_reason,
        usage: Usage {
            input_tokens,
            output_tokens,
        },
        model,
    })
}

/// SSE: lines look like `event: foo\ndata: { ... }`. We only need the `data:`
/// line. Returns the JSON string (or None if none / empty).
fn extract_data_line(event_text: &str) -> Option<String> {
    let mut data: Option<String> = None;
    for line in event_text.lines() {
        let line = line.trim_start();
        if let Some(rest) = line.strip_prefix("data:") {
            let trimmed = rest.trim();
            if trimmed.is_empty() {
                continue;
            }
            match &mut data {
                None => data = Some(trimmed.to_string()),
                Some(s) => {
                    s.push('\n');
                    s.push_str(trimmed);
                }
            }
        }
    }
    data
}
