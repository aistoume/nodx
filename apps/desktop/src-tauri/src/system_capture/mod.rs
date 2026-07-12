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
#[cfg(desktop)]
use std::thread;
#[cfg(desktop)]
use std::time::Duration;

#[cfg(desktop)]
use tauri::{AppHandle, Emitter, Manager};
#[cfg(desktop)]
use tauri_plugin_clipboard_manager::ClipboardExt;
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

#[cfg(desktop)]
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
#[cfg(desktop)]
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

/// Shortcuts we register **only while** the popover is visible.
/// macOS `alwaysOnTop` ("floating") windows have `canBecomeKeyWindow=false`
/// by default, so a plain DOM `keydown` listener never fires inside the
/// popover webview. Registering ESC + Cmd+W as temporary global shortcuts
/// bypasses focus entirely.
#[cfg(desktop)]
fn popover_dismiss_shortcuts() -> [Shortcut; 2] {
    [
        Shortcut::new(None, Code::Escape),
        Shortcut::new(Some(Modifiers::META), Code::KeyW),
    ]
}

/// Register the ESC + Cmd+W dismiss shortcuts. Best-effort — if a global
/// ESC is somehow already taken we still fall back to the in-webview
/// listener (which works when the user has clicked into the popover).
#[cfg(desktop)]
pub fn register_dismiss_shortcuts(app: &AppHandle) {
    for sc in popover_dismiss_shortcuts() {
        match app.global_shortcut().register(sc) {
            Ok(()) => log::debug!("registered popover dismiss shortcut"),
            Err(e) => log::debug!("dismiss shortcut already taken: {}", e),
        }
    }
}

/// Unregister the dismiss shortcuts so they don't intercept ESC / Cmd+W
/// system-wide while the popover is hidden.
#[cfg(desktop)]
pub fn unregister_dismiss_shortcuts(app: &AppHandle) {
    for sc in popover_dismiss_shortcuts() {
        let _ = app.global_shortcut().unregister(sc);
    }
}

/// True if the given shortcut is one of our popover dismiss shortcuts.
/// Called from the global-shortcut handler in lib.rs.
#[cfg(desktop)]
pub fn is_dismiss_shortcut(sc: &Shortcut) -> bool {
    popover_dismiss_shortcuts().iter().any(|d| d == sc)
}

/// Hide the popover and unregister dismiss shortcuts.
///
/// **Important**: when called from inside the global-shortcut handler,
/// unregistering must run on a different thread. The plugin holds an
/// internal lock during dispatch; calling `unregister()` re-enters that
/// lock and deadlocks the entire app. So we hide synchronously (cheap),
/// then defer the unregister to a worker thread.
#[cfg(desktop)]
pub fn hide_popover(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("popover") {
        let _ = win.hide();
    }
    let app_handle = app.clone();
    std::thread::spawn(move || {
        // Tiny pause to let the global-shortcut handler return first,
        // releasing the dispatch lock.
        thread::sleep(Duration::from_millis(50));
        unregister_dismiss_shortcuts(&app_handle);
    });
}

/// Show (or focus) the popover window. Best-effort.
///
/// Two failure modes we handle:
///  1. The popover window was destroyed (e.g. the user clicked the native
///     red close button before we installed the "hide instead of close"
///     handler) — we rebuild it from the saved WebviewWindowBuilder config.
///  2. macOS likes to drop keyboard focus on an `alwaysOnTop` window when
///     it's shown without explicit activation. We additionally register
///     ESC + Cmd+W as temporary global shortcuts (see register_dismiss_
///     shortcuts) so the user can always dismiss regardless of focus.
#[cfg(desktop)]
fn show_popover(app: &AppHandle) {
    use tauri::WebviewUrl;

    let win = match app.get_webview_window("popover") {
        Some(w) => w,
        None => {
            // Recreate it. Config mirrors tauri.conf.json closely.
            // Note: `.transparent()` is behind Tauri's `unstable` cargo
            // feature and would force a feature flag here; the popover
            // doesn't need transparency so we just leave the default.
            match tauri::WebviewWindowBuilder::new(
                app,
                "popover",
                WebviewUrl::App("popover.html".into()),
            )
            .title("nodx — explain")
            .inner_size(460.0, 360.0)
            .min_inner_size(360.0, 260.0)
            .decorations(true)
            .shadow(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(true)
            .visible(false)
            .focused(true)
            .fullscreen(false)
            .center()
            .build()
            {
                Ok(w) => {
                    install_popover_handlers(app, &w);
                    w
                }
                Err(e) => {
                    log::warn!("system_capture: failed to rebuild popover: {}", e);
                    return;
                }
            }
        }
    };

    // Show + center + focus. show_focused does set_focus on most platforms
    // but macOS still occasionally drops focus on alwaysOnTop windows, so we
    // belt-and-suspenders it.
    let _ = win.center();
    let _ = win.show();
    let _ = win.unminimize();
    let _ = win.set_focus();

    // On macOS, activate the app so the popover can receive keyboard events.
    #[cfg(target_os = "macos")]
    {
        // NSApp.activate(ignoringOtherApps:true) equivalent via Tauri.
        // The deprecated API still works in 12+; newer activate() is preferred but
        // requires more setup. This is the practical compromise.
        if let Err(e) = app.set_activation_policy(tauri::ActivationPolicy::Regular) {
            log::debug!("set_activation_policy: {:?}", e);
        }
    }

    // Register ESC + Cmd+W as temporary global shortcuts. This is the
    // reliable dismiss path — webview-level keydown is unreliable on
    // alwaysOnTop windows (canBecomeKeyWindow=false on macOS).
    register_dismiss_shortcuts(app);
}

/// Wire the "hide instead of destroy on close" handler + unregister dismiss
/// shortcuts when the user manually hides the popover. Called once for the
/// window declared in tauri.conf.json (via lib.rs setup) AND once for every
/// runtime rebuild (via the None arm of show_popover above).
///
/// Without this:
/// - the user clicks the native red close button → Tauri destroys the window
///   → next ⌥+E finds no window and (without the rebuild fallback) silently
///   does nothing.
/// - ESC + Cmd+W global shortcuts would stay registered even after the
///   popover is hidden, swallowing those keys system-wide.
#[cfg(desktop)]
pub fn install_popover_handlers(app: &AppHandle, win: &tauri::WebviewWindow) {
    let _label = win.label().to_string();
    let app_handle = app.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            // Cancel the destroy; just hide.
            api.prevent_close();
            hide_popover(&app_handle);
        }
    });
}

/// Local stand-in for chrono so we don't pull a whole crate just for ms.
#[cfg(desktop)]
fn chrono_now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
