mod pet;
mod ai_gateway;
mod migrations;
mod os_actions;
mod system_capture;

use ai_gateway::Provider;
use serde::Serialize;
use tauri::{Emitter, Manager};
#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle,
};
use tauri_plugin_deep_link::DeepLinkExt;
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Payload broadcast to the frontend when a `nodx://capture?...` URL fires.
/// All fields are URL-decoded; the frontend's `db/attentions.ts:upsertCaptured`
/// is the consumer of this exact shape.
#[derive(Debug, Clone, Serialize)]
struct CapturePayload {
    id: String,
    text: String,
    explanation: Option<String>,
    #[serde(rename = "sourceUrl")]
    source_url: String,
    #[serde(rename = "sourceTitle")]
    source_title: String,
    #[serde(rename = "sourceKind")]
    source_kind: String,
    kind: String,
    #[serde(rename = "capturedAt")]
    captured_at: i64,
}

/// Parse a single deep-link URL into a `CapturePayload`. Returns None when
/// the URL is not a `nodx://capture` URL or required fields are missing.
fn parse_capture_url(raw: &str) -> Option<CapturePayload> {
    let without_scheme = raw.strip_prefix("nodx://")?;
    let (host_path, query) = match without_scheme.split_once('?') {
        Some(p) => p,
        None => return None,
    };
    if !host_path.trim_start_matches('/').starts_with("capture") {
        return None;
    }

    let mut id = None;
    let mut text = None;
    let mut explanation = None;
    let mut source_url = String::new();
    let mut source_title = String::new();
    let mut kind = String::from("explain");
    let mut captured_at: i64 = 0;

    for pair in query.split('&') {
        let (k, v) = match pair.split_once('=') {
            Some(kv) => kv,
            None => continue,
        };
        // URLSearchParams (browser-side) encodes spaces as '+', not '%20'.
        let space_normalized = v.replace('+', " ");
        let decoded = urlencoding::decode(&space_normalized)
            .map(|s| s.into_owned())
            .ok()?;
        match k {
            "id" => id = Some(decoded),
            "text" => text = Some(decoded),
            "explanation" => explanation = Some(decoded),
            "url" => source_url = decoded,
            "title" => source_title = decoded,
            "kind" => kind = decoded,
            "capturedAt" => captured_at = decoded.parse().unwrap_or(0),
            _ => {}
        }
    }

    let id = id?;
    let text = text?;
    if text.trim().is_empty() {
        return None;
    }

    let source_kind = if source_url.starts_with("http") {
        "lens-chrome"
    } else if source_url.is_empty() {
        "lens-mac"
    } else {
        "manual"
    }
    .to_string();

    Some(CapturePayload {
        id,
        text,
        explanation,
        source_url,
        source_title,
        source_kind,
        kind,
        captured_at,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Tauri commands — exposed to the JS frontend via invoke('cmd_name', { ... })
// All AI key reads/writes go through the OS keychain. The actual key never
// crosses the IPC boundary except when the user explicitly types it in
// Settings.
// ─────────────────────────────────────────────────────────────────────────────

// ── OS actions (docs/desktop-os-actions.md M-A) ─────────────────────────────
// Read side (running apps / shortcuts inventory) feeds the instruct
// grounding table; write side (open_app / run_shortcut) only ever runs
// AFTER the frontend's confirmation card — the commands themselves stay
// dumb executors.

#[tauri::command]
fn os_running_apps() -> Vec<os_actions::RunningApp> {
    os_actions::list_running_apps()
}

#[tauri::command]
fn os_list_shortcuts() -> Vec<String> {
    os_actions::list_shortcuts()
}

#[tauri::command]
async fn os_open_app(target: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || os_actions::open_app(&target))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn os_open_url(url: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || os_actions::open_url(&url))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn os_run_shortcut(name: String, input: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        os_actions::run_shortcut(&name, input.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn ai_key_set(provider: String, key: String) -> Result<(), String> {
    let p = parse_provider(&provider)?;
    ai_gateway::keychain::set_key(p, &key)
}

#[tauri::command]
fn ai_key_has(provider: String) -> Result<bool, String> {
    let p = parse_provider(&provider)?;
    Ok(ai_gateway::keychain::has_key(p))
}

/// Returns the bearer token the in-proc gateway expects. The frontend stores
/// it in a module-scope var on first launch and reuses it for every fetch.
#[tauri::command]
fn ai_gateway_token() -> String {
    ai_gateway::current_client_token()
}

/// Read a media file from `<app_data>/media/` and return it base64-encoded.
///
/// Used by the vision "explain this image" path — the frontend has an
/// attention row with `imagePath` (an absolute filesystem path) but the
/// webview can't turn that into raw bytes without a full FS read scope.
/// This command returns just what we need: the base64 payload plus the
/// detected MIME (from the extension), ready to hand to the gateway.
///
/// Safety: refuses paths outside the app-data media dir so a spoofed
/// attention row can't be used to exfiltrate arbitrary files.
#[tauri::command]
fn read_media_file(path: String) -> Result<(String, String), String> {
    use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
    let target = std::path::PathBuf::from(&path);

    // Resolve app-data media dir the same way the gateway does.
    let media_dir = if cfg!(target_os = "macos") {
        std::env::var_os("HOME")
            .map(|h| std::path::PathBuf::from(h)
                .join("Library")
                .join("Application Support")
                .join("app.nodx.desktop")
                .join("media"))
    } else if cfg!(target_os = "windows") {
        std::env::var_os("APPDATA")
            .map(|a| std::path::PathBuf::from(a).join("app.nodx.desktop").join("media"))
    } else {
        std::env::var_os("HOME")
            .map(|h| std::path::PathBuf::from(h).join(".local").join("share").join("app.nodx.desktop").join("media"))
    };
    let media_dir = media_dir.ok_or_else(|| "cannot resolve nodx media dir".to_string())?;

    // Canonicalise both sides so symlinks / .. tricks can't escape.
    let media_canon = std::fs::canonicalize(&media_dir).map_err(|e| format!("media dir: {}", e))?;
    let target_canon = std::fs::canonicalize(&target).map_err(|e| format!("target: {}", e))?;
    if !target_canon.starts_with(&media_canon) {
        return Err("path escapes media dir".to_string());
    }

    let bytes = std::fs::read(&target_canon).map_err(|e| format!("read: {}", e))?;
    let encoded = B64.encode(&bytes);

    let mime = match target_canon.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/png",
    }
    .to_string();

    Ok((encoded, mime))
}

/// Get the current AI mode as a string ("api_key" | "cli").
#[tauri::command]
fn ai_mode_get() -> String {
    match ai_gateway::current_mode() {
        ai_gateway::AiMode::ApiKey => "api_key".to_string(),
        ai_gateway::AiMode::Cli => "cli".to_string(),
    }
}

/// Switch the AI mode at runtime + persist to disk so next launch remembers.
#[tauri::command]
fn ai_mode_set(mode: String) -> Result<(), String> {
    let m = ai_gateway::parse_mode(&mode).ok_or_else(|| format!("unknown mode: {}", mode))?;
    ai_gateway::set_mode(m);
    Ok(())
}

/// Probe whether `claude` is on PATH and runnable. Returns the version string
/// on success ("1.2.3" etc.) or a descriptive error.
#[tauri::command]
async fn cli_detect() -> Result<String, String> {
    ai_gateway::detect_cli()
        .await
        .map_err(|e| e.message)
}

// ── System-wide capture commands (0.3) ──────────────────────────────────────

/// True if macOS Accessibility permission has been granted to nodx.app.
#[tauri::command]
fn capture_has_permission() -> bool {
    system_capture::has_accessibility()
}

/// Opens System Settings → Privacy & Security → Accessibility on macOS
/// so the user can grant nodx the permission needed to synthesise ⌘+C.
#[tauri::command]
fn capture_open_permission_settings() {
    system_capture::open_accessibility_pane();
}

/// True once we've registered the global ⌥+E shortcut at startup.
#[tauri::command]
fn capture_is_hotkey_active() -> bool {
    system_capture::is_hotkey_registered()
}

fn parse_provider(s: &str) -> Result<Provider, String> {
    match s {
        "anthropic" => Ok(Provider::Anthropic),
        "openai" => Ok(Provider::Openai),
        "gemini" => Ok(Provider::Gemini),
        other => Err(format!("unknown provider: {}", other)),
    }
}

/// Generate a per-launch random token. 32 hex chars from secure-random.
fn random_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    // Stir in a few extra entropy sources so collisions are vanishingly rare
    // across launches even though we don't pull a real CSPRNG here.
    let pid = std::process::id() as u128;
    let mixed = nanos ^ (pid << 64) ^ (nanos.wrapping_mul(0x9E3779B97F4A7C15));
    format!("{:032x}", mixed)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init());

    // Global-shortcut plugin is desktop-only (no such concept on mobile).
    #[cfg(desktop)]
    let builder = builder.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, shortcut, event| {
                // Fire only on the press; the release also calls back.
                if event.state() != ShortcutState::Pressed {
                    return;
                }
                // ⌥+E — system-wide capture trigger.
                if shortcut.matches(Modifiers::ALT, Code::KeyE) {
                    let handle = app.clone();
                    std::thread::spawn(move || {
                        system_capture::on_hotkey(handle);
                    });
                    return;
                }
                // ESC / Cmd+W — popover dismiss shortcuts (registered
                // only while the popover is visible, see system_capture
                // mod). Hide it + clean up the shortcuts.
                if system_capture::is_dismiss_shortcut(shortcut) {
                    system_capture::hide_popover(app);
                    return;
                }
            })
            .build(),
    );

    builder
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:nodx.db", migrations::all())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            ai_key_set,
            ai_key_has,
            ai_gateway_token,
            ai_mode_get,
            ai_mode_set,
            cli_detect,
            capture_has_permission,
            capture_open_permission_settings,
            capture_is_hotkey_active,
            read_media_file,
            os_running_apps,
            os_list_shortcuts,
            os_open_app,
            os_open_url,
            os_run_shortcut,
            pet::pet_capture_region,
            pet::pet_show_main,
            pet::pet_hide,
            pet::pet_only_get,
            pet::pet_only_set,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // ── In-proc AI gateway ───────────────────────────────────────
            // Bind a random bearer token (only the frontend will know it),
            // then spawn the axum gateway on the same :8787 the existing JS
            // client already targets. Keeps `packages/ai` unchanged.
            //
            // Wrapped in catch_unwind so any panic during gateway init does
            // NOT bring down the whole app — the UI can still load, the user
            // just sees a "AI gateway unavailable" message when they trigger
            // an AI action (and the log will explain why).
            let gw_app_handle = app.handle().clone();
            // AssertUnwindSafe: AppHandle isn't UnwindSafe by default but
            // panics inside gateway spawn are logged in a background thread
            // and can't leave dangling references in this closure.
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
                let token = random_token();
                ai_gateway::set_client_token(token);
                ai_gateway::spawn(8787, gw_app_handle);
            }))
            .map_err(|e| {
                log::error!(
                    "ai gateway init panicked: {:?}",
                    e.downcast_ref::<String>()
                        .map(|s| s.as_str())
                        .or_else(|| e.downcast_ref::<&str>().copied())
                        .unwrap_or("(no message)"),
                );
            });

            // ── Deep link plugin (nodx://capture from Lens) ──────────────
            let app_handle = app.handle().clone();
            app.handle().deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    let url_str = url.as_str();
                    log::info!("deep-link URL: {}", url_str);
                    if let Some(payload) = parse_capture_url(url_str) {
                        pet::ensure_main_window(&app_handle);
                        if let Err(e) = app_handle.emit("nodx://capture", &payload) {
                            log::warn!("emit nodx://capture failed: {}", e);
                        }
                    }
                }
            });

            // Replay any queued URLs captured before the listener attached.
            if let Ok(Some(urls)) = app.handle().deep_link().get_current() {
                let app_handle2 = app.handle().clone();
                for url in urls {
                    if let Some(payload) = parse_capture_url(url.as_str()) {
                        let _ = app_handle2.emit("nodx://capture", &payload);
                    }
                }
            }

            // ── 0.3: Global ⌥+E shortcut (system-wide select-and-explain) ──
            // Don't crash the app if registration fails — the user can fall
            // back to in-app Lens usage. Most common failure: another app
            // (e.g. the old standalone lens-mac) already grabbed the key.
            #[cfg(desktop)]
            {
                match app.global_shortcut().register(Shortcut::new(
                    Some(Modifiers::ALT),
                    Code::KeyE,
                )) {
                    Ok(()) => {
                        system_capture::mark_hotkey_registered();
                        log::info!("registered global shortcut ⌥+E");
                    }
                    Err(e) => {
                        log::warn!(
                            "could not register ⌥+E: {} (likely another app already owns it)",
                            e
                        );
                    }
                }

                // ── 0.3: Menu-bar tray icon ─────────────────────────────
                // Lets the app run truly background-friendly: close the
                // main window without quitting; ⌥+E still works; click the
                // tray to bring nodx back.
                build_tray(app.handle())?;

                // Lightweight mode: in pet-only, never build the heavy main
                // workspace webview at launch — only the pet + tray show.
                if !pet::is_pet_only(app.handle()) {
                    pet::ensure_main_window(app.handle());
                }

                // ── 0.3: Popover close → hide (not destroy) ─────────────
                // The popover window declared in tauri.conf.json defaults
                // to destroy-on-close. Install our hide-instead handler so
                // the user can repeatedly fire ⌥+E without us having to
                // rebuild the window every time.
                if let Some(popover) = app.get_webview_window("popover") {
                    system_capture::install_popover_handlers(app.handle(), &popover);
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Build a minimal tray-icon menu so nodx can live in the menu bar.
/// Three actions: open main window, settings, quit.
#[cfg(desktop)]
/// Tray menu incl. the live "运行中" submenu (docs/desktop-os-actions.md
/// M-A). Rebuilt via the ↻ item — clicking an app row activates it.
fn build_tray_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, tauri::Error> {
    use tauri::menu::Submenu;

    let show = MenuItem::with_id(app, "tray-show", "打开 nodx · Open nodx", true, None::<&str>)?;
    let settings =
        MenuItem::with_id(app, "tray-settings", "⚙ 设置 · Settings", true, None::<&str>)?;
    let pet_toggle =
        MenuItem::with_id(app, "tray-pet", "🐣 桌宠 · Desktop pet", true, None::<&str>)?;
    let pet_only = tauri::menu::CheckMenuItem::with_id(
        app,
        "tray-pet-only",
        "🪶 轻量模式（只留桌宠，不开主窗）",
        true,
        pet::is_pet_only(app),
        None::<&str>,
    )?;
    let separator = MenuItem::with_id(app, "tray-sep", "—", false, None::<&str>)?;
    let about_capture = MenuItem::with_id(
        app,
        "tray-capture-hint",
        "⌥+E 全局划词解释 (Highlight + ⌥+E anywhere)",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "tray-quit", "退出 · Quit", true, None::<&str>)?;

    // 运行中 submenu: one row per foreground GUI app, activate on click.
    let apps = os_actions::list_running_apps();
    let mut app_items: Vec<MenuItem<tauri::Wry>> = Vec::new();
    for a in apps.iter().take(20) {
        let id = format!("os-app:{}", a.bundle_id.clone().unwrap_or_else(|| a.name.clone()));
        let label = if a.frontmost { format!("● {}", a.name) } else { a.name.clone() };
        app_items.push(MenuItem::with_id(app, id, label, true, None::<&str>)?);
    }
    let refresh = MenuItem::with_id(app, "tray-apps-refresh", "↻ 刷新 · Refresh", true, None::<&str>)?;
    let mut sub_refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = Vec::new();
    for item in &app_items {
        sub_refs.push(item);
    }
    sub_refs.push(&refresh);
    let running = Submenu::with_id_and_items(
        app,
        "tray-running",
        format!("🖥 运行中 · Running ({})", apps.len()),
        true,
        &sub_refs,
    )?;

    Menu::with_items(
        app,
        &[&show, &settings, &pet_toggle, &pet_only, &separator, &running, &separator, &about_capture, &separator, &quit],
    )
}

fn build_tray(app: &AppHandle) -> Result<(), tauri::Error> {
    let menu = build_tray_menu(app)?;

    let _ = TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .icon_as_template(true)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray-show" => {
                pet::ensure_main_window(app);
            }
            "tray-pet" => pet::toggle(app),
            "tray-pet-only" => {
                let now = !pet::is_pet_only(app);
                pet::pet_only_set(app.clone(), now);
                // Rebuild the menu so the checkmark reflects the new state.
                if let (Some(tray), Ok(menu)) =
                    (app.tray_by_id("main-tray"), build_tray_menu(app))
                {
                    let _ = tray.set_menu(Some(menu));
                }
            }
            "tray-settings" => {
                pet::ensure_main_window(app);
                let _ = app.emit("nav-to-settings", ());
            }
            "tray-quit" => {
                app.exit(0);
            }
            "tray-apps-refresh" => {
                if let Some(tray) = app.tray_by_id("main-tray") {
                    if let Ok(menu) = build_tray_menu(app) {
                        let _ = tray.set_menu(Some(menu));
                    }
                }
            }
            id if id.starts_with("os-app:") => {
                let target = id.trim_start_matches("os-app:").to_string();
                std::thread::spawn(move || {
                    let _ = os_actions::open_app(&target);
                });
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
