# Building nodx desktop for Windows

We build Windows binaries via **GitHub Actions**. Cross-building from macOS
is technically possible with wine + MSVC in a Docker image, but the
setup+debug cost is much higher than just letting GitHub's free
`windows-latest` runner do it.

## Two ways to trigger a Windows build

### Option A — Manual dispatch (recommended for ad-hoc builds)

Use this to produce a fresh Windows installer without cutting a tagged
release.

```
1. Push whatever code you want to build to any branch on GitHub
2. Open https://github.com/aistoume/nodx/actions/workflows/build-desktop-windows.yml
3. Click "Run workflow" (top right)
4. Choose the branch, leave "release_tag" blank
5. Click the green "Run workflow" button
```

Runs take ~8-12 minutes end-to-end (first run) or ~4-5 min (cached).
When it finishes:

- Open the finished run
- Scroll to **Artifacts** at the bottom
- Download `nodx-windows-msi.zip` (contains the `.msi` installer)

Send that MSI to a Windows user. They double-click → wizard installs
nodx.exe into `C:\Program Files\nodx\`.

### Option B — Tag a release (recommended for actual public releases)

If you also want the installer attached to a GitHub Release page:

```bash
# From your Mac
cd /Users/youbinmo/Develop/nodx/nodx
git tag v0.5.0
git push origin v0.5.0
```

Pushing the tag triggers the workflow AND, when it succeeds, uploads
the MSI + EXE to the matching release page under
`https://github.com/aistoume/nodx/releases/tag/v0.5.0`.

If a release for that tag doesn't yet exist, the action creates it.

## What gets built

Two installer flavours drop out of `pnpm tauri build`:

| Format | Path in artefact | Best for |
|---|---|---|
| `.msi` (WiX) | `nodx_<version>_x64_en-US.msi` | Managed Windows environments, deployment via SCCM/Intune, silent installs |
| `.exe` (NSIS) | `nodx_<version>_x64-setup.exe` | Regular home users — a friendlier "next / next / finish" wizard |

You can distribute either. If you're not sure, use the `.exe`.

## Code signing (optional but recommended)

An **unsigned** Windows installer will show a SmartScreen warning on first
launch ("Windows protected your PC"). Users can click "More info" →
"Run anyway", but this scares off ~30% of them.

To sign automatically in CI, add these three GitHub Actions secrets to
the `aistoume/nodx` repo:

- `WINDOWS_CERT_PFX_BASE64` — base64-encoded `.pfx` cert file
- `WINDOWS_CERT_PFX_PASSWORD` — the cert password
- (optional) `WINDOWS_TIMESTAMP_URL` — e.g. `http://timestamp.digicert.com`

Then in `apps/desktop/src-tauri/tauri.conf.json` add the `bundle.windows`
section:

```json
"windows": {
  "certificateThumbprint": "<paste thumbprint or leave null>",
  "digestAlgorithm": "sha256",
  "timestampUrl": "http://timestamp.digicert.com",
  "wix": {
    "language": "en-US"
  }
}
```

Certificates: a EV Code Signing Cert from Sectigo / DigiCert is ~$300/yr
and eliminates SmartScreen after ~50-100 downloads build reputation.
Ordinary OV certs are cheaper (~$80/yr) but still show a warning until
Microsoft "reputation" is earned (thousands of installs).

If shipping to <100 people, don't bother — just tell users to click
"More info" → "Run anyway".

## Testing the MSI locally on Windows

The GitHub Actions runner produces the same bits you'd get building on
a Windows machine. If you own or borrow a Windows box:

```powershell
# Prereqs (one-time):
#   • Node.js 20 LTS from https://nodejs.org
#   • Rust from https://rustup.rs (pick the MSVC toolchain, not GNU)
#   • WiX Toolset 3.11 from https://wixtoolset.org
#   • pnpm 9 from https://pnpm.io/installation

git clone https://github.com/aistoume/nodx
cd nodx
pnpm install
pnpm --filter @nodx/desktop tauri build
```

Installers land at
`apps/desktop/src-tauri/target/release/bundle/msi/*.msi`.

## What Windows users can and can't do

### Works out of the box

- All AI features (Anthropic / OpenAI / Gemini via BYO key)
- Local SQLite database
- Network graph, expert panels, auto-recursion
- Deep-link handshake with the Chrome extension (`nodx://capture`)

### Not yet ported to Windows

- **System-wide ⌥+E capture** (macOS-only right now). Windows equivalent
  would use `SetWindowsHookEx` + `SendInput` — planned for a later
  release. Windows users get everything except that one shortcut for
  now; text-selection→AI-explanation still works from the Chrome
  extension.
- **macOS-specific things**: Keychain (Windows uses the Credential
  Manager via the same `keyring` crate transparently, so this actually
  *does* work; just wanted to flag it).

## Rollout order

1. Push code as usual to `main`
2. Trigger the workflow (Option A) or push a tag (Option B)
3. Download `.msi` artefact from GitHub Actions
4. Test in a Windows VM or on a Windows friend's machine
5. Attach to the GitHub Release
6. Add a "Windows" card to `apps/web/nodx/index.html` pointing at
   the release asset
