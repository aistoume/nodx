// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    // Only act on Pressed (not Released)
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut.matches(Modifiers::ALT, Code::KeyE) {
                        on_hotkey(app.clone());
                    }
                })
                .build(),
        )
        .setup(|app| {
            // Register the global shortcut ⌥+E (Alt+E on macOS)
            let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::KeyE);
            app.global_shortcut().register(shortcut)?;

            // System tray
            let toggle = MenuItem::with_id(app, "toggle", "Show / Hide", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit nodx Lens", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle, &settings, &quit])?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(false)
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => {
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                show_at_cursor(app.clone());
                            }
                        }
                    }
                    "settings" => {
                        let _ = app.emit("open-settings", ());
                        show_at_cursor(app.clone());
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Called when ⌥+E is pressed anywhere on the system.
fn on_hotkey(app: AppHandle) {
    // Hard gate: without Accessibility permission, we cannot simulate ⌘+C.
    if !has_accessibility() {
        // Show our window so the user sees the explanation
        show_at_cursor(app.clone());
        let _ = app.emit("permission-required", ());
        // Also open System Settings → Privacy → Accessibility for one-click access
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn();
        return;
    }

    // 1. Save original clipboard
    let original = app.clipboard().read_text().unwrap_or_default();

    // 2. Synthesize ⌘+C against the currently focused app
    simulate_cmd_c();

    // 3. Let the source app handle the key event and write to pasteboard
    std::thread::sleep(std::time::Duration::from_millis(120));

    // 4. Read the captured selection
    let selection = app.clipboard().read_text().unwrap_or_default();

    // 5. Restore original clipboard if it changed
    if !original.is_empty() && original != selection {
        let _ = app.clipboard().write_text(original);
    }

    // 6. Show our window and emit
    show_at_cursor(app.clone());
    let _ = app.emit("explain-clipboard", selection);
}

/// Returns true if this app currently has macOS Accessibility permission.
#[cfg(target_os = "macos")]
fn has_accessibility() -> bool {
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
    }
    unsafe { AXIsProcessTrusted() }
}

#[cfg(not(target_os = "macos"))]
fn has_accessibility() -> bool { true }

/// Synthesize a ⌘+C keystroke into the current frontmost application.
/// Requires Accessibility permission for this app — macOS will prompt on
/// first call.
#[cfg(target_os = "macos")]
fn simulate_cmd_c() {
    use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation};
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

    let source = match CGEventSource::new(CGEventSourceStateID::CombinedSessionState) {
        Ok(s) => s,
        Err(_) => return,
    };

    // kVK_ANSI_C = 8
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
    // no-op on other platforms (lens-mac is macOS only for now)
}

/// V0: just center the window.  V1 will use CGEventGetLocation via objc
/// bindings to spawn the panel at the cursor's actual screen position.
fn show_at_cursor(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.center();
        let _ = win.show();
        let _ = win.set_focus();
    }
}
