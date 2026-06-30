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
