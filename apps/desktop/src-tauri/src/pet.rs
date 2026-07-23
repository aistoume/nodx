//! 桌宠 (desktop pet) — a tiny always-on-top bubble window that lives on
//! the desktop and expands into a mini AI panel (screenshot Q&A / quick
//! ask). The webview UI is `pet.html` (src/pet/); this module is only the
//! native bits: interactive region capture and window show/hide.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Interactive region screenshot → base64 PNG.
///
/// macOS: shells out to the system `screencapture -i -x` (the native
/// crosshair selector — same UX as ⌘⇧4). Returns Ok(None) when the user
/// presses Esc. First use triggers the one-time Screen Recording TCC
/// prompt for nodx.
///
/// Windows/Linux: not wired yet — the pet hides the screenshot button
/// there (see PetApp).
#[tauri::command]
pub async fn pet_capture_region() -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        use base64::Engine as _;
        let path = std::env::temp_dir().join(format!("nodx-pet-{}.png", uuid::Uuid::new_v4()));
        let status = tokio::process::Command::new("screencapture")
            .arg("-i") // interactive region select
            .arg("-x") // no shutter sound
            .arg(&path)
            .status()
            .await
            .map_err(|e| format!("screencapture failed to start: {e}"))?;
        // Esc leaves no file (and may exit non-zero) — both mean "cancelled".
        if !status.success() || !path.exists() {
            return Ok(None);
        }
        let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&path);
        if bytes.is_empty() {
            return Ok(None);
        }
        Ok(Some(base64::engine::general_purpose::STANDARD.encode(bytes)))
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Region capture is not available on this OS yet".into())
    }
}

/// Read the current clipboard text so the pet can answer about text the
/// user copied from any app.
///
/// Why clipboard and not synthesise-⌘C like ⌥+E: clicking a pet button
/// moves focus to the pet window, so a synthesised copy would target the
/// pet, not the app that holds the selection. Global ⌥+E doesn't have that
/// problem (no focus change), which is why THAT path grabs the live
/// selection. For the pet, "copy → click" is the reliable contract.
#[tauri::command]
pub fn pet_read_clipboard(app: AppHandle) -> String {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard().read_text().unwrap_or_default().trim().to_string()
}

/// Bring the main nodx window forward (pet's "open nodx" button). Builds
/// it on demand — in lightweight (pet-only) mode it never existed yet.
#[tauri::command]
pub fn pet_show_main(app: AppHandle) {
    ensure_main_window(&app);
}

// ── Lightweight / pet-only mode ──────────────────────────────────────
// When enabled, launch shows ONLY the pet bubble (+ tray); the heavy main
// workspace webview is never created until the user explicitly opens it.
// The flag persists to app_data/pet_only.txt.

fn pet_only_file(app: &AppHandle) -> Option<std::path::PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    let _ = std::fs::create_dir_all(&dir);
    Some(dir.join("pet_only.txt"))
}

pub fn is_pet_only(app: &AppHandle) -> bool {
    pet_only_file(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .map(|s| s.trim() == "1")
        .unwrap_or(false)
}

#[tauri::command]
pub fn pet_only_get(app: AppHandle) -> bool {
    is_pet_only(&app)
}

#[tauri::command]
pub fn pet_only_set(app: AppHandle, on: bool) {
    if let Some(p) = pet_only_file(&app) {
        let _ = std::fs::write(p, if on { "1" } else { "0" });
    }
    if on {
        // Hide (not destroy) the main window if it's already up, so toggling
        // at runtime takes effect immediately.
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.hide();
        }
    } else {
        ensure_main_window(&app);
    }
}

/// Show the main workspace window, building it lazily if it doesn't exist
/// yet. Config mirrors the old tauri.conf.json `main` entry. This is the
/// single entry point every "open nodx" path routes through (tray, pet 🧠,
/// deep-link capture), so pet-only mode can defer the heavy webview.
pub fn ensure_main_window(app: &AppHandle) -> Option<WebviewWindow> {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        return Some(w);
    }
    match WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("nodx")
        .inner_size(1280.0, 820.0)
        .min_inner_size(960.0, 640.0)
        .resizable(true)
        .fullscreen(false)
        .build()
    {
        Ok(w) => {
            let _ = w.show();
            let _ = w.set_focus();
            Some(w)
        }
        Err(e) => {
            log::warn!("ensure_main_window failed: {e}");
            None
        }
    }
}

/// Hide the pet (its own ✕ / right-click). Re-show via the tray menu.
#[tauri::command]
pub fn pet_hide(app: AppHandle) {
    if let Some(win) = app.get_webview_window("pet") {
        let _ = win.hide();
    }
}

/// Tray toggle: 🐣 桌宠 · Desktop pet.
pub fn toggle(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("pet") {
        match win.is_visible() {
            Ok(true) => {
                let _ = win.hide();
            }
            _ => {
                let _ = win.show();
            }
        }
    }
}
