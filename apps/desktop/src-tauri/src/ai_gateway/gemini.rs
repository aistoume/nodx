//! Gemini embedding adapter — Rust port of `workers/ai-gateway/src/gemini.ts`.
//! Batch-embeds up to 32 texts at 768-dim MRL.

use serde::{Deserialize, Serialize};

const GEMINI_BASE: &str = "https://generativelanguage.googleapis.com/v1beta";
pub const GEMINI_EMBED_MODEL: &str = "gemini-embedding-001";
pub const EMBED_DIM: usize = 768;
pub const MAX_EMBED_BATCH: usize = 32;

#[derive(Debug, Deserialize)]
pub struct EmbedRequest {
    pub texts: Vec<String>,
    #[serde(default)]
    #[allow(dead_code)]
    pub model: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct EmbedResponse {
    pub embeddings: Vec<Vec<f32>>,
    pub model: String,
}

#[derive(Debug)]
pub struct GeminiError {
    pub status: u16,
    pub message: String,
    /// Raw upstream body, kept for future error reporting / diagnostics.
    #[allow(dead_code)]
    pub upstream_body: String,
}

impl std::fmt::Display for GeminiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "gemini {} {}", self.status, self.message)
    }
}
impl std::error::Error for GeminiError {}

pub async fn call_gemini_embed(
    api_key: &str,
    client: &reqwest::Client,
    req: &EmbedRequest,
) -> Result<EmbedResponse, GeminiError> {
    let url = format!(
        "{}/models/{}:batchEmbedContents?key={}",
        GEMINI_BASE, GEMINI_EMBED_MODEL, api_key
    );
    let body = serde_json::json!({
        "requests": req.texts.iter().map(|t| serde_json::json!({
            "model": format!("models/{}", GEMINI_EMBED_MODEL),
            "content": { "parts": [{ "text": t }] },
            "outputDimensionality": EMBED_DIM,
        })).collect::<Vec<_>>(),
    });

    let response = client
        .post(&url)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| GeminiError {
            status: 502,
            message: format!("network: {}", e),
            upstream_body: String::new(),
        })?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(GeminiError {
            status: status.as_u16(),
            message: format!(
                "gemini {} {}",
                status.as_u16(),
                status.canonical_reason().unwrap_or("")
            ),
            upstream_body: body,
        });
    }

    let payload: serde_json::Value = response.json().await.map_err(|e| GeminiError {
        status: 502,
        message: format!("parse: {}", e),
        upstream_body: String::new(),
    })?;

    let mut embeddings: Vec<Vec<f32>> = Vec::with_capacity(req.texts.len());
    if let Some(arr) = payload.get("embeddings").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(values) = item.get("values").and_then(|v| v.as_array()) {
                let vec: Vec<f32> = values
                    .iter()
                    .filter_map(|x| x.as_f64().map(|f| f as f32))
                    .collect();
                embeddings.push(vec);
            }
        }
    }

    if embeddings.len() != req.texts.len() {
        return Err(GeminiError {
            status: 502,
            message: format!(
                "gemini returned {} embeddings for {} texts",
                embeddings.len(),
                req.texts.len()
            ),
            upstream_body: payload.to_string().chars().take(400).collect(),
        });
    }

    for v in &embeddings {
        if v.len() != EMBED_DIM {
            return Err(GeminiError {
                status: 502,
                message: format!(
                    "gemini returned a {}-dim vector, expected {}",
                    v.len(),
                    EMBED_DIM
                ),
                upstream_body: String::new(),
            });
        }
    }

    Ok(EmbedResponse {
        embeddings,
        model: GEMINI_EMBED_MODEL.to_string(),
    })
}

// ── Image generation ────────────────────────────────────────────────────
// gemini-2.5-flash-image via :generateContent — the image comes back as
// base64 in candidates[0].content.parts[].inlineData.data (same shape the
// Chrome extension uses; no responseModalities needed for the image-only
// model).

pub const GEMINI_IMAGE_MODEL: &str = "gemini-2.5-flash-image";

#[derive(Debug, serde::Deserialize)]
pub struct GenerateImageRequest {
    pub prompt: String,
}

/// Generate one image from a text prompt. Returns raw PNG bytes.
pub async fn generate_image(
    api_key: &str,
    client: &reqwest::Client,
    prompt: &str,
) -> Result<Vec<u8>, GeminiError> {
    let url = format!(
        "{}/models/{}:generateContent?key={}",
        GEMINI_BASE, GEMINI_IMAGE_MODEL, api_key
    );
    let body = serde_json::json!({
        "contents": [{ "parts": [{ "text": prompt }] }]
    });

    let response = client
        .post(&url)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| GeminiError {
            status: 502,
            message: format!("network: {}", e),
            upstream_body: String::new(),
        })?;

    let status = response.status();
    let payload: serde_json::Value = response.json().await.map_err(|e| GeminiError {
        status: 502,
        message: format!("bad json from gemini: {}", e),
        upstream_body: String::new(),
    })?;

    if !status.is_success() {
        let msg = payload
            .pointer("/error/message")
            .and_then(|v| v.as_str())
            .unwrap_or("(no message)");
        return Err(GeminiError {
            status: status.as_u16(),
            message: format!("gemini {}: {}", status.as_u16(), msg),
            upstream_body: payload.to_string().chars().take(400).collect(),
        });
    }

    let b64 = payload
        .pointer("/candidates/0/content/parts")
        .and_then(|parts| parts.as_array())
        .and_then(|parts| {
            parts.iter().find_map(|p| {
                p.pointer("/inlineData/data").and_then(|d| d.as_str())
            })
        })
        .ok_or_else(|| GeminiError {
            status: 502,
            message: "gemini returned no image data".to_string(),
            upstream_body: payload.to_string().chars().take(400).collect(),
        })?;

    use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
    B64.decode(b64).map_err(|e| GeminiError {
        status: 502,
        message: format!("invalid base64 image from gemini: {}", e),
        upstream_body: String::new(),
    })
}
