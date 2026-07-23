//! 桌宠 (desktop pet) — a tiny always-on-top bubble window that lives on
//! the desktop and expands into a mini AI panel (screenshot Q&A / quick
//! ask). The webview UI is `pet.html` (src/pet/); this module is only the
//! native bits: interactive region capture and window show/hide.

use tauri::{AppHandle, Manager};

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

/// Bring the main nodx window forward (pet's "open nodx" button).
#[tauri::command]
pub fn pet_show_main(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
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
