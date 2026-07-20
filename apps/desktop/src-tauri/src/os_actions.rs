//! OS-level actions (docs/desktop-os-actions.md M-A): running-app list,
//! Shortcuts inventory, and the two sanctioned executors — open_app and
//! run_shortcut. Shortcuts are the core execution primitive: the AI can
//! only invoke automations the user personally created, so the user's own
//! Shortcuts library doubles as the capability allowlist.
//!
//! macOS-first. Other platforms return empty lists / an explanatory Err so
//! the UI degrades gracefully (grounding table just omits the sections).

use serde::Serialize;
use std::process::Command;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RunningApp {
    pub name: String,
    pub bundle_id: Option<String>,
    pub pid: Option<i32>,
    pub frontmost: bool,
}

/// GUI apps currently running. Uses `lsappinfo` (ships with macOS, needs no
/// TCC permission, unlike System Events) and keeps only `type="Foreground"`
/// entries — regular dock apps, not menu-bar/UIElement helpers.
#[cfg(target_os = "macos")]
pub fn list_running_apps() -> Vec<RunningApp> {
    let out = match Command::new("lsappinfo").arg("list").output() {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).into_owned(),
        _ => return Vec::new(),
    };
    let front_asn = Command::new("lsappinfo")
        .arg("front")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();

    // Entries look like:
    //   1) "Finder" ASN:0x0-0x1c01c:
    //       bundleID="com.apple.finder"
    //       pid = 345 type="Foreground" …
    // Group lines into blocks starting at each `N) "Name" ASN:` header.
    let mut blocks: Vec<String> = Vec::new();
    for line in out.lines() {
        let t = line.trim_start();
        let is_header = t
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_digit())
            && t.contains(") \"")
            && t.contains("ASN:");
        if is_header {
            blocks.push(String::new());
        }
        if let Some(b) = blocks.last_mut() {
            b.push_str(line);
            b.push('\n');
        }
    }

    let mut apps = Vec::new();
    for block in blocks.iter().map(String::as_str) {
        if !block.contains("type=\"Foreground\"") {
            continue;
        }
        let name = block
            .split('"')
            .nth(1)
            .unwrap_or_default()
            .to_string();
        if name.is_empty() {
            continue;
        }
        let asn = block
            .split("ASN:")
            .nth(1)
            .and_then(|s| s.split(':').next())
            .unwrap_or_default();
        let bundle_id = block
            .split("bundleID=\"")
            .nth(1)
            .and_then(|s| s.split('"').next())
            .map(str::to_string);
        let pid = block
            .split("pid = ")
            .nth(1)
            .and_then(|s| s.split_whitespace().next())
            .and_then(|s| s.parse().ok());
        let frontmost = !asn.is_empty() && front_asn.contains(asn);
        apps.push(RunningApp { name, bundle_id, pid, frontmost });
    }
    apps
}

#[cfg(not(target_os = "macos"))]
pub fn list_running_apps() -> Vec<RunningApp> {
    Vec::new()
}

/// Names of the user's Shortcuts (`shortcuts list`). Empty on failure or
/// non-macOS — the instruct protocol simply won't offer run_shortcut then.
pub fn list_shortcuts() -> Vec<String> {
    if !cfg!(target_os = "macos") {
        return Vec::new();
    }
    match Command::new("shortcuts").arg("list").output() {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout)
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

/// Launch or activate an app. Accepts a bundle id ("com.tencent.xinWeChat")
/// or a display name ("WeChat"); bundle ids are preferred by the protocol
/// because the grounding table carries them.
pub fn open_app(target: &str) -> Result<(), String> {
    if !cfg!(target_os = "macos") {
        return Err("open_app is macOS-only for now".into());
    }
    let looks_like_bundle_id = target.contains('.') && !target.contains(' ');
    let mut cmd = Command::new("open");
    if looks_like_bundle_id {
        cmd.args(["-b", target]);
    } else {
        cmd.args(["-a", target]);
    }
    let out = cmd.output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// Open an http(s) URL in the default browser. Scheme-restricted so a
/// directive can never invoke arbitrary URL handlers (file:, ssh:, …).
pub fn open_url(url: &str) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("only http/https URLs are allowed".into());
    }
    let out = Command::new("open").arg(url).output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    /// Live smoke: lsappinfo parsing yields real foreground apps (Finder is
    /// always running on a logged-in Mac).
    #[test]
    fn lists_running_gui_apps() {
        let apps = list_running_apps();
        assert!(!apps.is_empty(), "expected at least one foreground app");
        assert!(
            apps.iter().any(|a| a.bundle_id.as_deref() == Some("com.apple.finder")),
            "Finder missing from {:?}",
            apps.iter().map(|a| &a.name).collect::<Vec<_>>()
        );
    }

    #[test]
    fn open_url_rejects_non_http() {
        assert!(open_url("file:///etc/passwd").is_err());
        assert!(open_url("applescript://run").is_err());
    }
}

/// Run a user Shortcut by exact name, optionally piping `input` to it.
/// 60s hard timeout — a stuck shortcut must not wedge the app.
pub fn run_shortcut(name: &str, input: Option<&str>) -> Result<String, String> {
    use std::io::Write;
    use std::time::{Duration, Instant};

    if !cfg!(target_os = "macos") {
        return Err("run_shortcut is macOS-only for now".into());
    }
    let mut cmd = Command::new("shortcuts");
    cmd.args(["run", name]);
    if input.is_some() {
        cmd.args(["--input-path", "-"]);
    }
    cmd.stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("shortcuts spawn failed: {e}"))?;
    if let Some(text) = input {
        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(text.as_bytes());
        }
    }

    let deadline = Instant::now() + Duration::from_secs(60);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut stdout = String::new();
                let mut stderr = String::new();
                if let Some(mut o) = child.stdout.take() {
                    use std::io::Read;
                    let _ = o.read_to_string(&mut stdout);
                }
                if let Some(mut e) = child.stderr.take() {
                    use std::io::Read;
                    let _ = e.read_to_string(&mut stderr);
                }
                return if status.success() {
                    Ok(stdout.trim().to_string())
                } else {
                    Err(if stderr.trim().is_empty() {
                        format!("shortcut exited with {status}")
                    } else {
                        stderr.trim().to_string()
                    })
                };
            }
            Ok(None) => {
                if Instant::now() > deadline {
                    let _ = child.kill();
                    return Err("shortcut timed out after 60s".into());
                }
                std::thread::sleep(Duration::from_millis(120));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}
