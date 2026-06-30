//! System-wide select-and-explain capture, ported from `apps/lens-mac`.
//!
//! The flow:
//!   user presses ⌥+E in any macOS app
//!     → we save the current clipboard
//!     → synthesise ⌘+C via CGEvent (requires Accessibility permission)
//!     → wait 120 ms for the foreground app to write the copy to clipboard
//!     → read the new clipboard (= what the user had selected)
//!     → restore the original clipboard so we don't trample on the user's copy
//!     → emit `system-capture` event with the snippet to the frontend
//!
//! Windows / Linux variants can later live behind cfg flags; for 0.3 macOS
//! only (matching lens-mac's scope).

use std::sync::OnceLock;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Payload broadcast on a successful capture.
#[derive(serde::Serialize, Clone, Debug)]
pub struct CapturedSnippet {
    pub text: String,
    pub captured_at: i64,
}

/// One-time gate: `true` after `register_hotkey` succeeds. Lets us avoid
/// re-registering when Settings flips the toggle off then on again.
static HOTKEY_REGISTERED: OnceLock<bool> = OnceLock::new();
pub fn mark_hotkey_registered() {
    let _ = HOTKEY_REGISTERED.set(true);
}
pub fn is_hotkey_registered() -> bool {
    *HOTKEY_REGISTERED.get().unwrap_or(&false)
}

/// macOS Accessibility permission check via the ApplicationServices framework.
/// Without this, our synthesised ⌘+C events are silently dropped.
#[cfg(target_os = "macos")]
pub fn has_accessibility() -> bool {
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
    }
    unsafe { AXIsProcessTrusted() }
}

#[cfg(not(target_os = "macos"))]
pub fn has_accessibility() -> bool {
    // No equivalent on Windows / Linux — treat as granted; the win/linux
    // capture paths will use different mechanisms.
    true
}

/// Synthesise the keypress sequence ⌘+C system-wide. Requires Accessibility
/// permission on macOS.
#[cfg(target_os = "macos")]
fn simulate_cmd_c() {
    use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation};
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

    let source = match CGEventSource::new(CGEventSourceStateID::CombinedSessionState) {
        Ok(s) => s,
        Err(_) => return,
    };
    // kVK_ANSI_C — the virtual key code for 'C'
    let key_c: u16 = 8;

    if let Ok(down) = CGEvent::new_keyboard_event(source.clone(), key_c, true) {
        down.set_flags(CGEventFlags::CGEventFlagCommand);
        down.post(CGEventTapLocation::HID);
    }
    if let Ok(up) = CGEvent::new_keyboard_event(source, key_c, false) {
        up.set_flags(CGEventFlags::CGEventFlagCommand);
        up.post(CGEventTapLocation::HID);
    }
}

#[cfg(not(target_os = "macos"))]
fn simulate_cmd_c() {
    // TODO: Windows = SendInput; Linux = uinput / xdotool.
}

/// Try to open macOS System Settings on the Accessibility pane. Best-effort,
/// failure is silent — we'll just have the UI nudge the user instead.
#[cfg(target_os = "macos")]
pub fn open_accessibility_pane() {
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .spawn();
}

#[cfg(not(target_os = "macos"))]
pub fn open_accessibility_pane() {}

/// The hot-path called when the user fires the global shortcut.
///
/// Runs on whatever thread the global-shortcut plugin invokes us on, so we
/// avoid any tokio / Tauri runtime assumptions. The 120 ms sleep is on this
/// thread — that's fine, the hotkey isn't fired rapidly.
pub fn on_hotkey(app: AppHandle) {
    // 1. Permission gate. Without Accessibility our synthesised ⌘+C is
    //    silently dropped and we'd end up emitting whatever was in the
    //    clipboard before the user pressed the shortcut — confusing.
    if !has_accessibility() {
        log::warn!("system_capture: Accessibility not granted");
        let _ = app.emit("system-capture-permission-required", ());
        open_accessibility_pane();
        // Also surface a popover so the user sees a hint, not silence.
        show_popover(&app);
        return;
    }

    // 2. Save original clipboard so we can restore it. Use a separate scope
    //    so the clipboard handle drops before we synthesise the keypress
    //    (avoids any weird re-entrancy on macOS).
    let original = app.clipboard().read_text().unwrap_or_default();

    // 3. Fire ⌘+C in the foreground app.
    simulate_cmd_c();

    // 4. Give the foreground app time to handle the copy + write to pasteboard.
    //    120 ms was the value lens-mac landed on after empirical testing —
    //    less and we sometimes read the OLD clipboard; more and the UX feels
    //    sluggish.
    thread::sleep(Duration::from_millis(120));

    // 5. Read what the user had selected.
    let selection = app.clipboard().read_text().unwrap_or_default();

    // 6. Restore the original clipboard so we don't steal the user's copy.
    //    Skip the write if the selection IS the original (nothing was
    //    selected → ⌘+C copied nothing → clipboard unchanged).
    if !original.is_empty() && original != selection {
        let _ = app.clipboard().write_text(original);
    }

    // 7. Empty selection = user fired hotkey without selecting anything.
    //    Don't show a popover — that'd be noise.
    let snippet = selection.trim().to_string();
    if snippet.is_empty() {
        log::info!("system_capture: empty selection — nothing to explain");
        return;
    }

    log::info!(
        "system_capture: captured {} chars",
        snippet.chars().count()
    );

    // 8. Show popover + emit so the popover's React listener picks it up.
    show_popover(&app);

    let payload = CapturedSnippet {
        text: snippet,
        captured_at: chrono_now_ms(),
    };
    if let Err(e) = app.emit("system-capture", &payload) {
        log::warn!("system_capture: emit failed: {}", e);
    }
}

/// Show (or focus) the popover window. Best-effort.
fn show_popover(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("popover") {
        let _ = win.show();
        let _ = win.set_focus();
        // Try to position near the cursor — Tauri 2 doesn't expose a
        // cross-platform "cursor position" so we center for v1.
        let _ = win.center();
    } else {
        log::warn!("system_capture: popover window not found");
    }
}

/// Local stand-in for chrono so we don't pull a whole crate just for ms.
fn chrono_now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
