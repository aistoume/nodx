//! CLI mode — drives Anthropic via the user's locally-installed Claude Code
//! (`claude -p`), using whatever auth that CLI has cached (subscription /
//! API key / OAuth — Claude Code handles it).
//!
//! Lets users with a Pro / Max subscription use nodx without an API key.
//!
//! Behaviour mirrors `workers/cli-gateway/src/server.mjs`:
//!   - `claude -p --output-format json --model <alias> --allowedTools <…> --max-turns <…> --system-prompt <…>`
//!   - stdin = prompt
//!   - parse the JSON result envelope on stdout
//!   - 5-minute timeout per call (cold-start can be slow)
//!   - map model ids: anything with "haiku"/"sonnet"/"opus" → alias
//!
//! Limitations carried over from cli-gateway:
//!   - No streaming (CLI returns whole answer at once — that's fine; the
//!     in-proc gateway is non-streaming for callers either way)
//!   - No assistant_prefill / continuation: stop_reason of `max_tokens`
//!     would make the client re-run with a prefill chunk concat that the
//!     CLI can't honour, producing garbage. So we always rewrite
//!     `max_tokens` → `end_turn` before returning.
//!   - No embeddings (nodx CBR features need the API-key path)

use std::path::Path;
use std::process::Stdio;
use std::sync::OnceLock;
use std::time::Duration;

use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::time::timeout;

use super::anthropic::{CompleteRequest, CompleteResponse, Usage};

/// Temp file that removes itself when dropped — image staging for the
/// CLI's Read tool survives every early-return path without leaking.
struct TempImage(std::path::PathBuf);
impl Drop for TempImage {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

/// Stage a base64 image under $TMPDIR/nodx-cli/ for the CLI to Read.
fn stage_image(b64: &str, mime: Option<&str>) -> Result<TempImage, String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("bad image_base64: {}", e))?;
    let dir = std::env::temp_dir().join("nodx-cli");
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {}", e))?;
    let ext = if mime.is_some_and(|m| m.contains("jpeg")) { "jpg" } else { "png" };
    let path = dir.join(format!("img-{}.{}", uuid::Uuid::new_v4(), ext));
    std::fs::write(&path, bytes).map_err(|e| format!("write: {}", e))?;
    Ok(TempImage(path))
}

// ─────────────────────────────────────────────────────────────────────────────
// claude binary resolver
//
// macOS GUI apps inherit a stripped-down PATH (~/usr/bin:/bin:/usr/sbin:/sbin
// /usr/local/bin), so `Command::new("claude")` fails to find Claude Code
// installed by npm / homebrew / nvm even though `claude` works in the user's
// terminal (where ~/.zshrc / ~/.bash_profile have extended PATH).
//
// We solve this in three layers:
//   1. CLAUDE_BIN env var if set (explicit override)
//   2. A list of common absolute paths
//   3. Ask the user's login shell `command -v claude`
// First hit wins, cached for the rest of the session.
// ─────────────────────────────────────────────────────────────────────────────

static RESOLVED_BIN: OnceLock<Option<String>> = OnceLock::new();

fn resolve_claude_bin() -> Option<String> {
    RESOLVED_BIN
        .get_or_init(|| {
            // 1. Explicit override
            if let Ok(p) = std::env::var("CLAUDE_BIN") {
                if Path::new(&p).exists() {
                    return Some(p);
                }
            }

            // 2. Common absolute locations
            let home = std::env::var("HOME").ok();
            let mut candidates: Vec<String> = vec![
                "/usr/local/bin/claude".into(),
                "/opt/homebrew/bin/claude".into(),
            ];
            if let Some(h) = &home {
                candidates.extend([
                    format!("{}/.npm-global/bin/claude", h),
                    format!("{}/.local/bin/claude", h),
                    format!("{}/.bun/bin/claude", h),
                    format!("{}/.volta/bin/claude", h),
                    format!("{}/.claude/local/claude", h),
                    format!("{}/bin/claude", h),
                ]);
            }
            for c in &candidates {
                if Path::new(c).exists() {
                    return Some(c.clone());
                }
            }

            // 3. Ask the user's login shell — picks up nvm / fnm / asdf
            //    versioned bin dirs that we can't enumerate.
            if let Some(p) = ask_shell_for_claude() {
                return Some(p);
            }

            None
        })
        .clone()
}

/// Run `$SHELL -lic 'command -v claude'` to leverage the user's shell rc files.
/// `-l` = login shell, `-i` = interactive (some setups only set PATH there).
fn ask_shell_for_claude() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let output = std::process::Command::new(&shell)
        .arg("-lic")
        .arg("command -v claude")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&output.stdout)
        .trim()
        .to_string();
    if path.is_empty() || !Path::new(&path).exists() {
        return None;
    }
    Some(path)
}

/// Snapshot of the user's shell PATH, so we can inject it into the spawned
/// claude process (so claude itself can find node / npm / fnm bins it needs).
fn user_shell_path() -> Option<String> {
    static CACHED: OnceLock<Option<String>> = OnceLock::new();
    CACHED
        .get_or_init(|| {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
            let output = std::process::Command::new(&shell)
                .arg("-lic")
                .arg("echo $PATH")
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .output()
                .ok()?;
            if !output.status.success() {
                return None;
            }
            let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if p.is_empty() {
                None
            } else {
                Some(p)
            }
        })
        .clone()
}

/// Hard cap on a single Claude CLI invocation. The CLI can take 5–10 s of
/// cold-start before the model begins; reasoning-heavy prompts can run a
/// few more minutes. 5 min covers Sonnet long-form replies comfortably.
const CALL_TIMEOUT: Duration = Duration::from_secs(300);

const DEFAULT_SYSTEM: &str = "你是一个严谨的推理助手。严格按用户的指令作答，只输出被要求的内容；不要使用任何工具，不要解释你在做什么。";

#[derive(Debug)]
pub struct CliError {
    pub status: u16,
    pub message: String,
}

impl std::fmt::Display for CliError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "claude cli {} {}", self.status, self.message)
    }
}
impl std::error::Error for CliError {}

/// Detect if `claude` is available. Cheap — runs `claude --version`.
/// Tries multiple strategies (env override → common paths → user shell)
/// to overcome the macOS GUI-app PATH stripping issue.
pub async fn detect() -> Result<String, CliError> {
    let bin = match resolve_claude_bin() {
        Some(p) => p,
        None => {
            return Err(CliError {
                status: 500,
                message: not_found_hint(),
            });
        }
    };

    let mut cmd = Command::new(&bin);
    cmd.arg("--version");
    if let Some(path) = user_shell_path() {
        cmd.env("PATH", path);
    }

    let output = match timeout(Duration::from_secs(10), cmd.output()).await {
        Ok(Ok(o)) => o,
        Ok(Err(e)) => {
            return Err(CliError {
                status: 500,
                message: if e.kind() == std::io::ErrorKind::NotFound {
                    not_found_hint()
                } else {
                    format!("spawn {} failed: {}", bin, e)
                },
            });
        }
        Err(_) => {
            return Err(CliError {
                status: 504,
                message: format!("`{} --version` timed out", bin),
            });
        }
    };

    if !output.status.success() {
        return Err(CliError {
            status: 500,
            message: format!(
                "`{} --version` exited {:?}: {}",
                bin,
                output.status.code(),
                String::from_utf8_lossy(&output.stderr)
                    .chars()
                    .take(200)
                    .collect::<String>(),
            ),
        });
    }
    // Return "<version> · <path>" so the user can verify which binary nodx picked.
    let ver = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(format!("{} · {}", ver, bin))
}

fn not_found_hint() -> String {
    "找不到 claude CLI。常见原因：\n\
     ① 没装 — 跑：npm i -g @anthropic-ai/claude-code  然后  claude  登录一次\n\
     ② 装了但 nodx 没找到（macOS GUI app PATH 限制） — 在 terminal 跑 `which claude` 拿到完整路径，\
     然后这样启动 nodx：\n\
       CLAUDE_BIN=\"<完整路径>\" open /Applications/nodx.app\n\
     或者把 claude 软链到 /usr/local/bin/：\n\
       sudo ln -s \"$(which claude)\" /usr/local/bin/claude".to_string()
}

/// Run one completion via `claude -p`.
pub async fn run(req: &CompleteRequest) -> Result<CompleteResponse, CliError> {
    let bin = match resolve_claude_bin() {
        Some(p) => p,
        None => {
            return Err(CliError {
                status: 500,
                message: not_found_hint(),
            });
        }
    };
    let model_alias = map_model(&req.model);

    // Vision: the CLI can't take image bytes on stdin, but its Read tool
    // renders images — stage the crop as a temp file and let it look.
    let temp_image = match req.image_base64.as_deref().filter(|s| !s.is_empty()) {
        Some(b64) => match stage_image(b64, req.image_mime.as_deref()) {
            Ok(t) => Some(t),
            Err(e) => {
                return Err(CliError { status: 500, message: format!("failed to stage image: {}", e) });
            }
        },
        None => None,
    };

    let mut args: Vec<String> = vec![
        "-p".into(),
        "--output-format".into(),
        "json".into(),
        "--model".into(),
        model_alias,
    ];

    if req.enable_web_search.unwrap_or(false) {
        // Web tools only — never let the CLI touch files / shell.
        args.push("--allowedTools".into());
        args.push("WebSearch".into());
        args.push("WebFetch".into());
        args.push("--max-turns".into());
        args.push("8".into());
    } else if temp_image.is_some() {
        // Read renders the staged image; a couple of turns to view+answer.
        // (Read is not path-scoped — acceptable for the user's own local
        // screenshots; the gateway stays loopback-only.)
        args.push("--allowedTools".into());
        args.push("Read".into());
        args.push("--max-turns".into());
        args.push("3".into());
    } else {
        // Empty allowedTools = NO tools at all → safe.
        // One turn = a single assistant message (the answer).
        args.push("--allowedTools".into());
        args.push("--max-turns".into());
        args.push("1".into());
    }

    let system = req
        .system
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(DEFAULT_SYSTEM);
    args.push("--system-prompt".into());
    args.push(system.to_string());

    let mut cmd = Command::new(&bin);
    cmd.args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // Inject the user's shell PATH so claude itself can find node / npm /
    // fnm / etc that it depends on internally.
    if let Some(path) = user_shell_path() {
        cmd.env("PATH", path);
    }
    let mut child = match cmd.spawn()
    {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(CliError {
                status: 500,
                message: format!(
                    "'{}' not found on PATH — install Claude Code (npm i -g @anthropic-ai/claude-code) and run `claude` once to log in",
                    bin
                ),
            });
        }
        Err(e) => {
            return Err(CliError {
                status: 500,
                message: format!("spawn {} failed: {}", bin, e),
            });
        }
    };

    // Feed the prompt on stdin (image runs get a view-then-answer wrapper).
    let final_prompt = match &temp_image {
        Some(t) => format!(
            "First use the Read tool to view the image at {} — do not do anything else with the filesystem. Then complete the following task about that image, replying with ONLY the final answer:\n\n{}",
            t.0.display(),
            req.prompt
        ),
        None => req.prompt.clone(),
    };
    if let Some(mut stdin) = child.stdin.take() {
        if let Err(e) = stdin.write_all(final_prompt.as_bytes()).await {
            return Err(CliError {
                status: 500,
                message: format!("write stdin: {}", e),
            });
        }
        // close stdin so claude knows the input is done
        drop(stdin);
    }

    let output = match timeout(CALL_TIMEOUT, child.wait_with_output()).await {
        Ok(Ok(o)) => o,
        Ok(Err(e)) => {
            return Err(CliError {
                status: 502,
                message: format!("claude io: {}", e),
            });
        }
        Err(_) => {
            return Err(CliError {
                status: 504,
                message: format!(
                    "claude call timed out after {}s",
                    CALL_TIMEOUT.as_secs()
                ),
            });
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    let envelope = parse_envelope(&stdout).ok_or_else(|| CliError {
        status: 502,
        message: format!(
            "claude exited {:?} without parseable result. stderr: {}",
            output.status.code(),
            stderr.chars().take(500).collect::<String>()
        ),
    })?;

    if envelope
        .get("is_error")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
        || envelope.get("subtype").and_then(|v| v.as_str()) != Some("success")
    {
        return Err(CliError {
            status: 502,
            message: format!(
                "claude returned error: {}",
                envelope
                    .get("result")
                    .and_then(|v| v.as_str())
                    .unwrap_or("(unknown)")
                    .chars()
                    .take(500)
                    .collect::<String>()
            ),
        });
    }

    Ok(envelope_to_response(envelope, &req.model))
}

fn map_model(model: &str) -> String {
    let s = model.to_lowercase();
    if s.contains("haiku") {
        "haiku".into()
    } else if s.contains("opus") {
        "opus".into()
    } else if s.contains("sonnet") {
        "sonnet".into()
    } else if model.is_empty() {
        "sonnet".into()
    } else {
        model.into()
    }
}

/// Claude CLI prints a single JSON envelope. If it printed multiple lines
/// (some versions stream events then a final result), pick the last line
/// that parses as `{ "type": "result", ... }`.
fn parse_envelope(stdout: &str) -> Option<serde_json::Value> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
        return Some(v);
    }
    for line in trimmed.lines().rev() {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
            if v.get("type").and_then(|t| t.as_str()) == Some("result") {
                return Some(v);
            }
        }
    }
    None
}

fn envelope_to_response(env: serde_json::Value, requested_model: &str) -> CompleteResponse {
    // Tokens — prefer modelUsage (per-model breakdown), fall back to usage.
    let mut input_tokens: u32 = 0;
    let mut output_tokens: u32 = 0;
    let mut model: String = requested_model.to_string();

    if let Some(mu) = env.get("modelUsage").and_then(|v| v.as_object()) {
        if let Some(first_key) = mu.keys().next() {
            model = first_key.clone();
        }
        for (_k, v) in mu {
            input_tokens += v
                .get("inputTokens")
                .and_then(|n| n.as_u64())
                .unwrap_or(0) as u32;
            output_tokens += v
                .get("outputTokens")
                .and_then(|n| n.as_u64())
                .unwrap_or(0) as u32;
        }
    }
    if input_tokens == 0 {
        input_tokens = env
            .get("usage")
            .and_then(|u| u.get("input_tokens"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;
    }
    if output_tokens == 0 {
        output_tokens = env
            .get("usage")
            .and_then(|u| u.get("output_tokens"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;
    }

    let text = env
        .get("result")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // CLI can't do continuation (assistantPrefill) reliably, so never
    // report max_tokens — would make the client loop and concat garbage.
    let stop_reason = match env.get("stop_reason").and_then(|v| v.as_str()) {
        Some("max_tokens") | None => Some("end_turn".to_string()),
        Some(other) => Some(other.to_string()),
    };

    CompleteResponse {
        text,
        stop_reason,
        usage: Usage {
            input_tokens,
            output_tokens,
        },
        model,
    }
}
