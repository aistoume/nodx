//! Self-contained AI client for the standalone pet.
//!
//! Deliberately NOT the nodx desktop in-proc gateway — this app ships on
//! its own, so it talks to the provider APIs directly with the user's key
//! from the OS keychain. Calls run in Rust (not the webview) so there's no
//! CORS dance and the key never crosses into JS.

use serde::{Deserialize, Serialize};

const SERVICE: &str = "app.nodx.pet";

/// One conversation turn. The pet keeps the whole thread so follow-up
/// questions land in context instead of starting over.
#[derive(Debug, Clone, Deserialize)]
pub struct Msg {
    /// "user" | "assistant"
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Anthropic,
    OpenAI,
    Gemini,
}

impl Provider {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "anthropic" => Some(Self::Anthropic),
            "openai" => Some(Self::OpenAI),
            "gemini" | "google" => Some(Self::Gemini),
            _ => None,
        }
    }
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Anthropic => "anthropic",
            Self::OpenAI => "openai",
            Self::Gemini => "gemini",
        }
    }
    /// Fast model — plain text asks.
    fn quick_model(self) -> &'static str {
        match self {
            Self::Anthropic => "claude-haiku-4-5",
            Self::OpenAI => "gpt-5.6-luna",
            Self::Gemini => "gemini-3.5-flash",
        }
    }
    /// Quality model — vision (screenshot) asks.
    fn vision_model(self) -> &'static str {
        match self {
            Self::Anthropic => "claude-sonnet-5",
            Self::OpenAI => "gpt-5.6-sol",
            Self::Gemini => "gemini-3.5-flash",
        }
    }
}

// ── Keychain ─────────────────────────────────────────────────────────

fn entry(p: Provider) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, p.as_str()).map_err(|e| e.to_string())
}

pub fn set_key(p: Provider, key: &str) -> Result<(), String> {
    let e = entry(p)?;
    if key.trim().is_empty() {
        let _ = e.delete_credential();
        return Ok(());
    }
    e.set_password(key.trim()).map_err(|e| e.to_string())
}

pub fn get_key(p: Provider) -> Option<String> {
    entry(p).ok()?.get_password().ok().filter(|k| !k.is_empty())
}

pub fn has_key(p: Provider) -> bool {
    get_key(p).is_some()
}

// ── Completion ───────────────────────────────────────────────────────

const SYSTEM: &str = "You are nodx Lens, a tiny desktop assistant. Answer concisely (2–6 sentences unless asked for more). If an image is attached, answer about the exact pixels shown, quoting visible text/numbers exactly. If quoted text is provided, ground your answer in it. Reply in the language of the question.";

/// Multi-turn completion. `image_b64` (PNG) attaches to the FIRST user
/// turn (the one the screenshot belongs to) and switches to the vision
/// model.
pub async fn complete(
    p: Provider,
    thread: &[Msg],
    image_b64: Option<&str>,
) -> Result<String, String> {
    let key = get_key(p).ok_or_else(|| "NO_KEY".to_string())?;
    let model = if image_b64.is_some() { p.vision_model() } else { p.quick_model() };
    let client = reqwest::Client::new();

    let (url, body, headers): (String, serde_json::Value, Vec<(&str, String)>) = match p {
        Provider::Anthropic => {
            let msgs: Vec<serde_json::Value> = thread
                .iter()
                .enumerate()
                .map(|(i, m)| {
                    let mut content = vec![];
                    if i == 0 && m.role == "user" {
                        if let Some(b64) = image_b64 {
                            content.push(serde_json::json!({
                                "type": "image",
                                "source": { "type": "base64", "media_type": "image/png", "data": b64 }
                            }));
                        }
                    }
                    content.push(serde_json::json!({ "type": "text", "text": m.content }));
                    serde_json::json!({ "role": m.role, "content": content })
                })
                .collect();
            (
                "https://api.anthropic.com/v1/messages".into(),
                serde_json::json!({
                    "model": model,
                    "max_tokens": 1024,
                    "system": SYSTEM,
                    "messages": msgs
                }),
                vec![
                    ("x-api-key", key.clone()),
                    ("anthropic-version", "2023-06-01".to_string()),
                ],
            )
        }
        Provider::OpenAI => {
            let mut msgs = vec![serde_json::json!({ "role": "system", "content": SYSTEM })];
            for (i, m) in thread.iter().enumerate() {
                if i == 0 && m.role == "user" && image_b64.is_some() {
                    msgs.push(serde_json::json!({
                        "role": "user",
                        "content": [
                            { "type": "image_url",
                              "image_url": { "url": format!("data:image/png;base64,{}", image_b64.unwrap()) } },
                            { "type": "text", "text": m.content }
                        ]
                    }));
                } else {
                    msgs.push(serde_json::json!({ "role": m.role, "content": m.content }));
                }
            }
            (
                "https://api.openai.com/v1/chat/completions".into(),
                serde_json::json!({
                    "model": model,
                    // GPT-5.x rejects max_tokens; the replacement also covers
                    // hidden reasoning tokens, so it needs headroom.
                    "max_completion_tokens": 4096,
                    "messages": msgs
                }),
                vec![("authorization", format!("Bearer {key}"))],
            )
        }
        Provider::Gemini => {
            let contents: Vec<serde_json::Value> = thread
                .iter()
                .enumerate()
                .map(|(i, m)| {
                    let mut parts = vec![serde_json::json!({ "text": m.content })];
                    if i == 0 && m.role == "user" {
                        if let Some(b64) = image_b64 {
                            parts.push(serde_json::json!({
                                "inline_data": { "mime_type": "image/png", "data": b64 }
                            }));
                        }
                    }
                    // Gemini calls the assistant role "model".
                    let role = if m.role == "assistant" { "model" } else { "user" };
                    serde_json::json!({ "role": role, "parts": parts })
                })
                .collect();
            (
                format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"),
                serde_json::json!({
                    "system_instruction": { "parts": [{ "text": SYSTEM }] },
                    "contents": contents,
                    "generationConfig": { "maxOutputTokens": 2048 }
                }),
                vec![("x-goog-api-key", key.clone())],
            )
        }
    };

    let mut req = client.post(&url).json(&body);
    for (k, v) in headers {
        req = req.header(k, v);
    }
    let res = req.send().await.map_err(|e| format!("network: {e}"))?;
    let status = res.status();
    let text = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("{} {}: {}", p.as_str(), status, text.chars().take(300).collect::<String>()));
    }
    let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;

    let answer = match p {
        Provider::Anthropic => json["content"]
            .as_array()
            .map(|blocks| {
                blocks
                    .iter()
                    .filter(|b| b["type"] == "text")
                    .filter_map(|b| b["text"].as_str())
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_default(),
        Provider::OpenAI => json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        Provider::Gemini => json["candidates"][0]["content"]["parts"]
            .as_array()
            .map(|parts| {
                parts
                    .iter()
                    // Gemini 3.x interleaves reasoning parts — drop them.
                    .filter(|p| p["thought"] != true)
                    .filter_map(|p| p["text"].as_str())
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_default(),
    };

    if answer.trim().is_empty() {
        Err("(empty response)".into())
    } else {
        Ok(answer)
    }
}
