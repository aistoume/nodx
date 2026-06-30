//! Secure API-key storage using the OS keychain.
//!
//! macOS  → Keychain
//! Windows → Credential Manager
//! Linux  → Secret Service (gnome-keyring / kwallet)
//!
//! Keys are NEVER written to disk in plain text and are NEVER passed to the
//! frontend (the frontend only ever asks "is a key configured?" and "save
//! this new key"). The Rust HTTP gateway pulls them out at request time.
//!
//! We store under service name `app.nodx.desktop` with per-provider account
//! names so users can configure multiple providers without collisions.

use keyring::Entry;

const SERVICE: &str = "app.nodx.desktop";

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Anthropic,
    Openai,
    Gemini,
}

impl Provider {
    fn account(self) -> &'static str {
        match self {
            Provider::Anthropic => "anthropic_api_key",
            Provider::Openai => "openai_api_key",
            Provider::Gemini => "gemini_api_key",
        }
    }
}

/// Persist a key. Empty string deletes the entry instead.
pub fn set_key(provider: Provider, key: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE, provider.account()).map_err(|e| e.to_string())?;
    if key.is_empty() {
        // delete_credential returns NoEntry if missing — treat as ok.
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    } else {
        entry.set_password(key).map_err(|e| e.to_string())
    }
}

/// Read a key. Returns None when nothing is stored (NOT an error).
pub fn get_key(provider: Provider) -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE, provider.account()).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(s) => Ok(Some(s)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn has_key(provider: Provider) -> bool {
    get_key(provider).ok().flatten().is_some()
}
