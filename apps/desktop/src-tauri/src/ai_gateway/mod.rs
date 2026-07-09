//! In-process AI gateway — replaces the Cloudflare worker for desktop usage.
//!
//! Mirrors `workers/ai-gateway` HTTP contract exactly so the existing
//! `packages/ai` client code talks to it unchanged:
//!
//!     GET  /health
//!     POST /v1/complete   { model, prompt, max_tokens, system?, temperature?,
//!                           enable_web_search?, assistant_prefill? }
//!                       → { text, stopReason, usage, model }
//!     POST /v1/embed      { texts: string[], model? }
//!                       → { embeddings: number[][], model }
//!
//! API keys live in the OS keychain (see `keychain.rs`) and are read at
//! request time — they never appear in the frontend, in env files, or on disk.
//!
//! Auth: same Bearer scheme as the worker. The frontend uses a per-launch
//! random token (set via the `inproc_client_token` tauri command on startup
//! and stored in the gateway state), so localhost CSRF can't piggyback on
//! a known token like the old "replace-me-with-..." value.

mod anthropic;
mod cli_mode;
mod gemini;
pub mod keychain;

pub use cli_mode::detect as detect_cli;

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::{Arc, RwLock};
use subtle::ConstantTimeEq;
use tauri::{AppHandle, Emitter};
use tower_http::cors::{Any, CorsLayer};

pub use keychain::Provider;

/// Which backend handles /v1/complete requests.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AiMode {
    /// Direct Anthropic API call using the user's `sk-ant-...` key from
    /// the keychain. Embeddings work (Gemini API key path).
    ApiKey,
    /// Shell out to `claude -p` (the user's locally-installed Claude Code
    /// CLI). Uses their subscription / OAuth — no API key needed in nodx.
    /// Embeddings unavailable in this mode.
    Cli,
}

impl Default for AiMode {
    fn default() -> Self {
        AiMode::ApiKey
    }
}

impl AiMode {
    fn parse(s: &str) -> Option<Self> {
        match s {
            "api_key" | "apikey" | "api-key" => Some(AiMode::ApiKey),
            "cli" | "claude_code" | "claude-code" => Some(AiMode::Cli),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            AiMode::ApiKey => "api_key",
            AiMode::Cli => "cli",
        }
    }
}

/// State the axum app needs at request time.
#[derive(Clone)]
struct GatewayState {
    client: reqwest::Client,
    /// Bearer token shared with the frontend at app launch. Frontend reads
    /// it through a Tauri command; gateway compares constant-time.
    client_token: Arc<RwLock<String>>,
    /// Which backend services /v1/complete. Mutable so the user can switch
    /// from Settings UI without restarting nodx.
    mode: Arc<RwLock<AiMode>>,
    /// Set once at spawn() so image-capture handlers can emit Tauri events
    /// back to the frontend. None until the app hands us its handle.
    app_handle: Arc<RwLock<Option<AppHandle>>>,
}

impl GatewayState {
    fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .user_agent("nodx-desktop-inproc/0.2")
                .build()
                .expect("reqwest client build"),
            client_token: Arc::new(RwLock::new(String::new())),
            mode: Arc::new(RwLock::new(load_mode_from_disk())),
            app_handle: Arc::new(RwLock::new(None)),
        }
    }

    fn set_token(&self, token: String) {
        if let Ok(mut w) = self.client_token.write() {
            *w = token;
        }
    }

    fn token(&self) -> String {
        self.client_token.read().map(|s| s.clone()).unwrap_or_default()
    }

    fn mode(&self) -> AiMode {
        self.mode.read().map(|m| *m).unwrap_or_default()
    }

    fn set_mode(&self, mode: AiMode) {
        if let Ok(mut w) = self.mode.write() {
            *w = mode;
            persist_mode_to_disk(mode);
        }
    }

    fn set_app_handle(&self, handle: AppHandle) {
        if let Ok(mut w) = self.app_handle.write() {
            *w = Some(handle);
        }
    }

    fn app_handle(&self) -> Option<AppHandle> {
        self.app_handle.read().ok().and_then(|g| g.clone())
    }
}

/// Persist the AI mode to a small file in the app data dir so it survives
/// restarts. The path is the same dir as the sqlite DB.
fn mode_file_path() -> Option<std::path::PathBuf> {
    let base = directories_next_data_dir()?;
    Some(base.join("ai_mode.txt"))
}

fn directories_next_data_dir() -> Option<std::path::PathBuf> {
    // Tauri 2 stores app data under Application Support / app.nodx.desktop on macOS.
    // We resolve it via env vars to avoid pulling another crate.
    if cfg!(target_os = "macos") {
        let home = std::env::var_os("HOME").map(std::path::PathBuf::from)?;
        let path = home
            .join("Library")
            .join("Application Support")
            .join("app.nodx.desktop");
        std::fs::create_dir_all(&path).ok()?;
        Some(path)
    } else if cfg!(target_os = "windows") {
        let appdata = std::env::var_os("APPDATA").map(std::path::PathBuf::from)?;
        let path = appdata.join("app.nodx.desktop");
        std::fs::create_dir_all(&path).ok()?;
        Some(path)
    } else {
        let home = std::env::var_os("HOME").map(std::path::PathBuf::from)?;
        let path = home.join(".local").join("share").join("app.nodx.desktop");
        std::fs::create_dir_all(&path).ok()?;
        Some(path)
    }
}

fn load_mode_from_disk() -> AiMode {
    mode_file_path()
        .and_then(|p| std::fs::read_to_string(&p).ok())
        .and_then(|s| AiMode::parse(s.trim()))
        .unwrap_or_default()
}

fn persist_mode_to_disk(mode: AiMode) {
    if let Some(path) = mode_file_path() {
        let _ = std::fs::write(&path, mode.as_str());
    }
}

/// Shared handle so other parts of the app (Tauri commands) can update the
/// client token after init.
static STATE: std::sync::OnceLock<GatewayState> = std::sync::OnceLock::new();

fn state() -> &'static GatewayState {
    STATE.get_or_init(GatewayState::new)
}

/// Update the bearer token the gateway checks against. Called by lib.rs on
/// startup with a fresh random value, and exposed to the frontend via a
/// Tauri command so the JS client can pass it as `Authorization: Bearer ...`.
pub fn set_client_token(token: String) {
    state().set_token(token);
}

pub fn current_client_token() -> String {
    state().token()
}

/// Read the current AI mode (api_key | cli).
pub fn current_mode() -> AiMode {
    state().mode()
}

/// Change the AI mode at runtime + persist.
pub fn set_mode(mode: AiMode) {
    state().set_mode(mode);
}

/// Parse a string like "api_key" / "cli" into AiMode for command boundaries.
pub fn parse_mode(s: &str) -> Option<AiMode> {
    AiMode::parse(s)
}

/// Spawn the gateway on `127.0.0.1:port` in a dedicated background thread
/// with its own tokio runtime.
///
/// Why an OS thread instead of `tauri::async_runtime::spawn`: Tauri 2's
/// `setup()` closure is called synchronously from the macOS main thread's
/// `applicationDidFinishLaunching:` Objective-C callback — i.e. an extern
/// "C" frame. Any `tokio::spawn` / `tauri::async_runtime::spawn` from
/// inside this context panics because no tokio runtime is "entered" on the
/// current thread. The panic then crosses the extern "C" boundary and
/// SIGABRTs the whole app (panic_cannot_unwind).
///
/// Spawning a plain OS thread and building our own runtime inside that
/// thread avoids the issue entirely — the gateway is fully isolated from
/// Tauri's runtime lifecycle.
pub fn spawn(port: u16, app_handle: AppHandle) {
    // Stash the handle so the /v1/capture-image handler can emit
    // frontend events after writing the image to disk.
    state().set_app_handle(app_handle);
    let app = build_app(state().clone());
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();

    let _ = std::thread::Builder::new()
        .name("nodx-ai-gateway".into())
        .spawn(move || {
            // catch_unwind so any internal panic logs instead of taking the
            // whole app down (we're already on a non-main thread, but be safe).
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let rt = match tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .thread_name("nodx-ai-gw-rt")
                    .build()
                {
                    Ok(rt) => rt,
                    Err(e) => {
                        log::error!("ai gateway: build runtime: {}", e);
                        return;
                    }
                };
                rt.block_on(async move {
                    match tokio::net::TcpListener::bind(addr).await {
                        Ok(listener) => {
                            log::info!(
                                "ai gateway listening on http://{} (own runtime)",
                                addr
                            );
                            if let Err(e) = axum::serve(listener, app).await {
                                log::error!("ai gateway serve: {}", e);
                            }
                        }
                        Err(e) => log::error!("ai gateway bind {}: {}", addr, e),
                    }
                });
            }));
        });
}

fn build_app(state: GatewayState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/v1/complete", post(complete))
        .route("/v1/embed", post(embed))
        .route("/v1/capture-image", post(capture_image))
        .layer(
            // Body size limit tuned for image captures — screenshots up to
            // ~10 MB after base64 encoding go through comfortably (a raw
            // 4K PNG rarely exceeds 5 MB, and base64 adds ~33 %).
            axum::extract::DefaultBodyLimit::max(16 * 1024 * 1024),
        )
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(state)
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct Health {
    ok: bool,
    service: &'static str,
}

async fn health() -> impl IntoResponse {
    Json(Health {
        ok: true,
        service: "nodx-desktop-inproc",
    })
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    hint: Option<String>,
}

fn error_response(status: StatusCode, error: impl Into<String>) -> (StatusCode, Json<ErrorBody>) {
    (
        status,
        Json(ErrorBody {
            error: error.into(),
            hint: None,
        }),
    )
}

fn error_with_hint(
    status: StatusCode,
    error: impl Into<String>,
    hint: impl Into<String>,
) -> (StatusCode, Json<ErrorBody>) {
    (
        status,
        Json(ErrorBody {
            error: error.into(),
            hint: Some(hint.into()),
        }),
    )
}

/// Constant-time bearer check. Returns Ok(()) when authorised.
fn check_auth(headers: &HeaderMap, state: &GatewayState) -> Result<(), (StatusCode, Json<ErrorBody>)> {
    let expected = format!("Bearer {}", state.token());
    let provided = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();
    if expected.as_bytes().ct_eq(provided.as_bytes()).into() {
        Ok(())
    } else {
        Err(error_response(StatusCode::UNAUTHORIZED, "unauthorized"))
    }
}

async fn complete(
    State(st): State<GatewayState>,
    headers: HeaderMap,
    Json(req): Json<anthropic::CompleteRequest>,
) -> impl IntoResponse {
    if let Err(e) = check_auth(&headers, &st) {
        return e.into_response();
    }

    match st.mode() {
        AiMode::ApiKey => complete_via_api_key(&st.client, &req).await,
        AiMode::Cli => complete_via_cli(&req).await,
    }
}

async fn complete_via_api_key(
    client: &reqwest::Client,
    req: &anthropic::CompleteRequest,
) -> axum::response::Response {
    let api_key = match keychain::get_key(Provider::Anthropic) {
        Ok(Some(k)) => k,
        Ok(None) => {
            return error_with_hint(
                StatusCode::PAYMENT_REQUIRED, // 402 — closest "needs setup"
                "no Anthropic API key configured",
                "Open nodx Settings → Anthropic API key → paste your sk-ant-... key.",
            )
            .into_response();
        }
        Err(e) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("keychain: {}", e),
            )
            .into_response();
        }
    };

    match anthropic::call_anthropic(&api_key, client, req).await {
        Ok(r) => Json(r).into_response(),
        Err(e) => {
            let status = match e.status {
                401 | 403 => StatusCode::BAD_GATEWAY,
                429 => StatusCode::TOO_MANY_REQUESTS,
                _ => StatusCode::BAD_GATEWAY,
            };
            error_response(status, e.message).into_response()
        }
    }
}

async fn complete_via_cli(
    req: &anthropic::CompleteRequest,
) -> axum::response::Response {
    match cli_mode::run(req).await {
        Ok(r) => Json(r).into_response(),
        Err(e) => {
            let status = match e.status {
                500 => StatusCode::PAYMENT_REQUIRED, // ENOENT-ish "needs setup"
                504 => StatusCode::GATEWAY_TIMEOUT,
                _ => StatusCode::BAD_GATEWAY,
            };
            error_response(status, e.message).into_response()
        }
    }
}

async fn embed(
    State(st): State<GatewayState>,
    headers: HeaderMap,
    Json(req): Json<gemini::EmbedRequest>,
) -> impl IntoResponse {
    if let Err(e) = check_auth(&headers, &st) {
        return e.into_response();
    }

    // CLI mode has no embedding path (Claude Code doesn't do embeddings).
    if st.mode() == AiMode::Cli {
        return error_with_hint(
            StatusCode::NOT_IMPLEMENTED,
            "embeddings unavailable in CLI mode",
            "Switch to API-key mode in Settings to use case-based reasoning features.",
        )
        .into_response();
    }

    if req.texts.is_empty() {
        return error_response(StatusCode::BAD_REQUEST, "texts must be non-empty").into_response();
    }
    if req.texts.len() > gemini::MAX_EMBED_BATCH {
        return error_response(
            StatusCode::BAD_REQUEST,
            format!("too many texts (>{})", gemini::MAX_EMBED_BATCH),
        )
        .into_response();
    }
    if req.texts.iter().any(|t| t.is_empty()) {
        return error_response(StatusCode::BAD_REQUEST, "every text must be non-empty")
            .into_response();
    }

    let api_key = match keychain::get_key(Provider::Gemini) {
        Ok(Some(k)) => k,
        Ok(None) => {
            return error_with_hint(
                StatusCode::PAYMENT_REQUIRED,
                "no Gemini API key configured",
                "Embeddings (used for case-based reasoning) need a Gemini key. \
                 Open nodx Settings → Gemini API key.",
            )
            .into_response();
        }
        Err(e) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("keychain: {}", e),
            )
            .into_response();
        }
    };

    match gemini::call_gemini_embed(&api_key, &st.client, &req).await {
        Ok(r) => Json(r).into_response(),
        Err(e) => {
            let status = if e.status == 429 {
                StatusCode::TOO_MANY_REQUESTS
            } else {
                StatusCode::BAD_GATEWAY
            };
            error_response(status, e.message).into_response()
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/capture-image  —  Chrome extension → nodx image handoff
//
// The extension marquee-selects a region on the page, captures the
// visible tab, crops the image, then POSTs it here as base64. We write
// the bytes to `<app_data>/media/{uuid}.png` and emit a
// `nodx://capture` Tauri event so the frontend's existing capture
// pipeline picks it up (same code path as text captures).
//
// ── Why no Bearer auth on this endpoint ─────────────────────────────
// Every other route requires the per-launch random token because they
// either (a) burn Anthropic / Gemini API-key quota or (b) return data
// derived from the user's keychain. This endpoint neither reads keys
// nor spends money — it just writes bytes into the app-data folder and
// emits an event. It's also bound to 127.0.0.1 only.
//
// The Chrome extension has no way to learn the per-launch token
// (that's owned by the desktop frontend), and adding a "get me the
// token" flow would create a way bigger attack surface than dropping
// auth here. So we treat this endpoint like a local drop box.
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct CaptureImageRequest {
    /// Base64-encoded image bytes.
    #[serde(rename = "imageBase64")]
    image_base64: String,
    #[serde(default = "default_mime")]
    #[serde(rename = "imageMime")]
    image_mime: String,
    #[serde(default)]
    #[serde(rename = "imageWidth")]
    image_width: Option<u32>,
    #[serde(default)]
    #[serde(rename = "imageHeight")]
    image_height: Option<u32>,
    #[serde(default)]
    text: String,
    #[serde(default)]
    #[serde(rename = "sourceUrl")]
    source_url: String,
    #[serde(default)]
    #[serde(rename = "sourceTitle")]
    source_title: String,
    #[serde(default)]
    #[serde(rename = "capturedAt")]
    captured_at: i64,
}

fn default_mime() -> String {
    "image/png".to_string()
}

/// Payload emitted to the frontend after the image lands on disk. Shape is
/// deliberately close to the text CapturePayload in lib.rs so the frontend
/// can dispatch on the presence of `imagePath` inside the same listener.
#[derive(Debug, Clone, Serialize)]
struct CaptureImagePayload {
    id: String,
    text: String,
    #[serde(rename = "sourceUrl")]
    source_url: String,
    #[serde(rename = "sourceTitle")]
    source_title: String,
    #[serde(rename = "sourceKind")]
    source_kind: String,
    kind: String,
    #[serde(rename = "capturedAt")]
    captured_at: i64,
    #[serde(rename = "imagePath")]
    image_path: String,
    #[serde(rename = "imageMime")]
    image_mime: String,
    #[serde(rename = "imageWidth")]
    image_width: Option<u32>,
    #[serde(rename = "imageHeight")]
    image_height: Option<u32>,
}

fn media_dir() -> Option<std::path::PathBuf> {
    let base = directories_next_data_dir()?;
    let media = base.join("media");
    std::fs::create_dir_all(&media).ok()?;
    Some(media)
}

fn extension_for(mime: &str) -> &'static str {
    match mime.to_ascii_lowercase().as_str() {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "png",
    }
}

async fn capture_image(
    State(st): State<GatewayState>,
    Json(req): Json<CaptureImageRequest>,
) -> impl IntoResponse {
    // Basic sanity — reject empty payloads early so we don't create
    // zero-byte files under media/.
    if req.image_base64.is_empty() {
        return error_response(StatusCode::BAD_REQUEST, "imageBase64 must not be empty")
            .into_response();
    }
    // Some encoders prefix `data:image/png;base64,` — strip it so we
    // don't feed the base64 decoder garbage.
    let raw_b64 = req
        .image_base64
        .split_once(',')
        .map(|(_, rest)| rest)
        .unwrap_or(&req.image_base64);

    let bytes = match B64.decode(raw_b64.trim()) {
        Ok(b) => b,
        Err(e) => {
            return error_response(
                StatusCode::BAD_REQUEST,
                format!("invalid base64: {}", e),
            )
            .into_response();
        }
    };
    if bytes.len() < 32 {
        return error_response(
            StatusCode::BAD_REQUEST,
            "image body too small to be a real image",
        )
        .into_response();
    }

    let media = match media_dir() {
        Some(p) => p,
        None => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "could not resolve nodx media dir",
            )
            .into_response();
        }
    };

    let id = format!("att_{}", uuid::Uuid::new_v4().simple());
    let ext = extension_for(&req.image_mime);
    let file_name = format!("{}.{}", id, ext);
    let path = media.join(&file_name);

    if let Err(e) = std::fs::write(&path, &bytes) {
        return error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("write media file: {}", e),
        )
        .into_response();
    }

    let image_path = path.to_string_lossy().to_string();
    let captured_at = if req.captured_at > 0 {
        req.captured_at
    } else {
        // Milliseconds since epoch, matching the shape the frontend uses.
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0)
    };

    let source_kind = if req.source_url.starts_with("http") {
        "lens-chrome"
    } else if req.source_url.is_empty() {
        "manual"
    } else {
        "manual"
    }
    .to_string();

    let payload = CaptureImagePayload {
        id: id.clone(),
        text: req.text,
        source_url: req.source_url,
        source_title: req.source_title,
        source_kind,
        kind: "quick".to_string(),
        captured_at,
        image_path: image_path.clone(),
        image_mime: req.image_mime,
        image_width: req.image_width,
        image_height: req.image_height,
    };

    // Fire the same event name text captures use — the frontend already
    // listens for "nodx://capture" and dispatches on the payload shape.
    if let Some(handle) = st.app_handle() {
        if let Err(e) = handle.emit("nodx://capture", &payload) {
            // Not fatal: the file is on disk, the caller can retry the
            // emit path or rescan the folder. Log + soldier on.
            log::warn!("emit nodx://capture image payload failed: {}", e);
        }
    } else {
        log::warn!("capture-image: no AppHandle stored, cannot notify frontend");
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "id": id,
            "imagePath": image_path,
        })),
    )
        .into_response()
}
