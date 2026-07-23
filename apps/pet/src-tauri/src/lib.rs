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

/// Ask the configured provider with the full conversation so far, so
/// follow-up questions keep context. `image_b64` (PNG) enables vision.
#[tauri::command]
async fn pet_ask(
    provider: String,
    thread: Vec<ai::Msg>,
    image_b64: Option<String>,
) -> Result<String, String> {
    let p = ai::Provider::parse(&provider).ok_or_else(|| format!("unknown provider: {provider}"))?;
    ai::complete(p, &thread, image_b64.as_deref()).await
}

/// Split a command template into argv, honouring quotes. Deliberately NOT
/// a shell: `{input}` is substituted as ONE argv element, so a selection
/// containing `;`, backticks or quotes can never become another command.
fn split_args(template: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    let mut started = false;
    for ch in template.chars() {
        match quote {
            Some(q) if ch == q => quote = None,
            Some(_) => cur.push(ch),
            None if ch == '\'' || ch == '"' => {
                quote = Some(ch);
                started = true;
            }
            None if ch.is_whitespace() => {
                if started || !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                    started = false;
                }
            }
            None => cur.push(ch),
        }
    }
    if started || !cur.is_empty() {
        out.push(cur);
    }
    out
}

/// Run a user-configured CLI with the pet's current context as input.
///
/// The user authors the template in Settings (e.g. `claude -p {input}` or
/// `ollama run llama3 {input}`); `{input}` becomes a single argument. No
/// shell is spawned. Output is capped so a runaway tool can't flood the UI.
#[tauri::command]
async fn pet_run_cli(template: String, input: String) -> Result<String, String> {
    let parts = split_args(&template);
    let (program, rest) = parts.split_first().ok_or_else(|| "命令为空".to_string())?;
    let args: Vec<String> = rest
        .iter()
        .map(|a| a.replace("{input}", &input))
        .collect();

    let mut cmd = tokio::process::Command::new(program);
    cmd.args(&args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    // Login shells put user tools in /usr/local/bin and /opt/homebrew/bin;
    // a GUI app inherits neither.
    if let Ok(path) = std::env::var("PATH") {
        cmd.env("PATH", format!("{path}:/usr/local/bin:/opt/homebrew/bin"));
    }

    let out = tokio::time::timeout(std::time::Duration::from_secs(120), cmd.output())
        .await
        .map_err(|_| "命令超时（120 秒）".to_string())?
        .map_err(|e| format!("无法运行 `{program}`：{e}"))?;

    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    let body = if stdout.is_empty() { stderr } else { stdout };
    let body: String = body.chars().take(20_000).collect();
    if !out.status.success() && body.is_empty() {
        return Err(format!("命令退出码 {:?}", out.status.code()));
    }
    Ok(body)
}

/// Open (or focus) the settings window — provider/key + wheel editor.
#[tauri::command]
fn pet_open_settings(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(
        &app,
        "settings",
        tauri::WebviewUrl::App("settings.html".into()),
    )
    .title("nodx Lens — 设置")
    .inner_size(560.0, 700.0)
    .min_inner_size(460.0, 520.0)
    .resizable(true)
    .center()
    .build()
    .map(|_| ())
    .map_err(|e| e.to_string())
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
        "⌥+E 划词提问 · ⌥+W 框选截屏",
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
                    return;
                }
                // ⌥+W — go straight to region capture.
                if shortcut.matches(Modifiers::ALT, Code::KeyW) {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.show();
                    }
                    let _ = app.emit("pet://shoot", ());
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
            pet_open_settings,
            pet_run_cli,
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
                match app.global_shortcut().register(Shortcut::new(
                    Some(Modifiers::ALT),
                    Code::KeyW,
                )) {
                    Ok(()) => log::info!("registered ⌥+W"),
                    Err(e) => log::warn!("could not register ⌥+W: {e}"),
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
