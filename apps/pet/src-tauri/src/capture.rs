//! Screen + selection capture for the standalone pet (macOS).
//!
//! Two independent paths:
//!   • region screenshot — shells out to the system `screencapture -i`
//!   • text selection    — save clipboard → synthesise ⌘C → read → restore
//!
//! The ⌘C trick needs Accessibility permission, and only lands in the
//! user's app because the pet window is a non-activating panel (clicking
//! or hot-keying it never changes the frontmost app).

#[cfg(target_os = "macos")]
use std::{thread, time::Duration};
use tauri::AppHandle;
#[cfg(target_os = "macos")]
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Interactive region screenshot → base64 PNG. None when the user hits Esc.
pub async fn region_png_b64() -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        use base64::Engine as _;
        let path = std::env::temp_dir().join(format!("nodx-pet-{}.png", uuid::Uuid::new_v4()));
        let status = tokio::process::Command::new("screencapture")
            .arg("-i")
            .arg("-x")
            .arg(&path)
            .status()
            .await
            .map_err(|e| format!("screencapture failed to start: {e}"))?;
        if !status.success() || !path.exists() {
            return Ok(None); // cancelled
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
        Err("Region capture is macOS-only for now".into())
    }
}

/// True when Accessibility is granted (required to synthesise ⌘C).
#[cfg(target_os = "macos")]
pub fn has_accessibility() -> bool {
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
    }
    unsafe { AXIsProcessTrusted() }
}
#[cfg(not(target_os = "macos"))]
pub fn has_accessibility() -> bool {
    true
}

#[cfg(target_os = "macos")]
pub fn open_accessibility_pane() {
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .spawn();
}
#[cfg(not(target_os = "macos"))]
pub fn open_accessibility_pane() {}

#[cfg(target_os = "macos")]
fn simulate_cmd_c() {
    use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation};
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

    let source = match CGEventSource::new(CGEventSourceStateID::CombinedSessionState) {
        Ok(s) => s,
        Err(_) => return,
    };
    let key_c: u16 = 8; // kVK_ANSI_C
    if let Ok(down) = CGEvent::new_keyboard_event(source.clone(), key_c, true) {
        down.set_flags(CGEventFlags::CGEventFlagCommand);
        down.post(CGEventTapLocation::HID);
    }
    if let Ok(up) = CGEvent::new_keyboard_event(source, key_c, false) {
        up.set_flags(CGEventFlags::CGEventFlagCommand);
        up.post(CGEventTapLocation::HID);
    }
}

/// Copy-and-read the frontmost app's selection, restoring the clipboard.
/// None when nothing was selected or Accessibility isn't granted.
#[cfg(target_os = "macos")]
pub fn grab_selection(app: &AppHandle) -> Option<String> {
    if !has_accessibility() {
        return None;
    }
    let original = app.clipboard().read_text().unwrap_or_default();
    simulate_cmd_c();
    // 120 ms is the value the original lens-mac landed on: less and we
    // sometimes read the pre-copy clipboard, more and it feels laggy.
    thread::sleep(Duration::from_millis(120));
    let selection = app.clipboard().read_text().unwrap_or_default();
    if !original.is_empty() && original != selection {
        let _ = app.clipboard().write_text(original);
    }
    let s = selection.trim().to_string();
    if s.is_empty() { None } else { Some(s) }
}
#[cfg(not(target_os = "macos"))]
pub fn grab_selection(_app: &AppHandle) -> Option<String> {
    None
}
