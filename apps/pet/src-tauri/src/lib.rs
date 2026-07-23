//! nodx Lens — the standalone desktop pet.
//!
//! A self-contained app: floating non-activating bubble, ⌥+E wake with the
//! current text selection, region screenshot Q&A, and direct provider API
//! calls with the user's own key from the OS keychain. It shares no runtime
//! with nodx desktop — install either, both, or neither.

mod ai;
mod capture;

use tauri::{AppHandle, Emitter, Manager};
#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const BUBBLE: (f64, f64) = (84.0, 84.0);

// ── Commands ─────────────────────────────────────────────────────────

#[tauri::command]
async fn pet_capture_region() -> Result<Option<String>, String> {
    capture::region_png_b64().await
}

#[tauri::command]
fn pet_read_clipboard(app: AppHandle) -> String {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard().read_text().unwrap_or_default().trim().to_string()
}

#[tauri::command]
fn pet_grab_selection(app: AppHandle) -> Option<String> {
    capture::grab_selection(&app)
}

#[tauri::command]
fn pet_has_accessibility() -> bool {
    capture::has_accessibility()
}

#[tauri::command]
fn pet_open_accessibility() {
    capture::open_accessibility_pane();
}

#[tauri::command]
fn pet_hide(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

/// Ask the configured provider. `image_b64` (PNG) enables vision.
#[tauri::command]
async fn pet_ask(
    provider: String,
    prompt: String,
    image_b64: Option<String>,
) -> Result<String, String> {
    let p = ai::Provider::parse(&provider).ok_or_else(|| format!("unknown provider: {provider}"))?;
    ai::complete(p, &prompt, image_b64.as_deref()).await
}

#[tauri::command]
fn pet_key_set(provider: String, key: String) -> Result<(), String> {
    let p = ai::Provider::parse(&provider).ok_or_else(|| format!("unknown provider: {provider}"))?;
    ai::set_key(p, &key)
}

#[tauri::command]
fn pet_key_has(provider: String) -> Result<bool, String> {
    let p = ai::Provider::parse(&provider).ok_or_else(|| format!("unknown provider: {provider}"))?;
    Ok(ai::has_key(p))
}

#[tauri::command]
fn pet_open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = url;
        Err("unsupported".into())
    }
}

// ── ⌥+E ──────────────────────────────────────────────────────────────

/// Grab the selection FIRST (user's app is still frontmost), then surface
/// the pet and hand it the text so the question bar is pre-filled.
#[cfg(desktop)]
fn on_hotkey(app: AppHandle) {
    let selection = if capture::has_accessibility() {
        capture::grab_selection(&app)
    } else {
        capture::open_accessibility_pane();
        None
    };
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        // Panels only take the keyboard when asked — do it so the user can
        // type immediately after the shortcut.
        let _ = win.set_focus();
    }
    let _ = app.emit("pet://wake", selection);
}

// ── Tray ─────────────────────────────────────────────────────────────

#[cfg(desktop)]
fn build_tray(app: &AppHandle) -> Result<(), tauri::Error> {
    let show = MenuItem::with_id(app, "show", "🐣 显示桌宠 · Show pet", true, None::<&str>)?;
    let hint = MenuItem::with_id(
        app,
        "hint",
        "⌥+E 划词唤醒 (Select text + ⌥+E)",
        false,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "退出 · Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hint, &quit])?;

    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-icon.png"))
        .unwrap_or_else(|_| app.default_window_icon().unwrap().clone());

    let _ = TrayIconBuilder::with_id("pet-tray")
        .icon(icon)
        // Not a template: template mode masks by alpha and flattens the
        // brand colours into a black blob.
        .icon_as_template(false)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_clipboard_manager::init());

    #[cfg(desktop)]
    let builder = builder.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, shortcut, event| {
                if event.state() != ShortcutState::Pressed {
                    return;
                }
                if shortcut.matches(Modifiers::ALT, Code::KeyE) {
                    let handle = app.clone();
                    // The ⌘C dance sleeps 120 ms — keep it off the UI thread.
                    std::thread::spawn(move || on_hotkey(handle));
                }
            })
            .build(),
    );

    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());

    builder
        .invoke_handler(tauri::generate_handler![
            pet_capture_region,
            pet_read_clipboard,
            pet_grab_selection,
            pet_has_accessibility,
            pet_open_accessibility,
            pet_hide,
            pet_ask,
            pet_key_set,
            pet_key_has,
            pet_open_url,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                match app.global_shortcut().register(Shortcut::new(
                    Some(Modifiers::ALT),
                    Code::KeyE,
                )) {
                    Ok(()) => log::info!("registered ⌥+E"),
                    Err(e) => log::warn!("could not register ⌥+E: {e}"),
                }
                build_tray(app.handle())?;

                // No Dock icon — this lives in the menu bar and on top of
                // whatever the user is working in.
                #[cfg(target_os = "macos")]
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            // Non-activating floating panel: clicking the pet must never
            // steal focus from the app holding the user's selection.
            #[cfg(target_os = "macos")]
            {
                use tauri_nspanel::WebviewWindowExt as _;
                if let Some(win) = app.get_webview_window("main") {
                    match win.to_panel() {
                        Ok(panel) => {
                            // NSWindowStyleMaskNonactivatingPanel = 1 << 7
                            panel.set_style_mask(1 << 7);
                            panel.set_level(3); // floating
                            panel.set_becomes_key_only_if_needed(true);
                        }
                        Err(e) => log::warn!("to_panel failed: {e}"),
                    }
                }
            }
            let _ = BUBBLE;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running nodx Lens");
}
