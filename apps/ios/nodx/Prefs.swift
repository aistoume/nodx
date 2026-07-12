import Foundation

/// AI providers — same set and pref keys as the Android app (`Prefs.kt`),
/// minus nothing: Android already dropped the desktop-loopback provider.
enum Provider: String, CaseIterable, Identifiable {
    case anthropic
    case openai
    case openrouter
    case gemini

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .anthropic: return "Anthropic (Claude)"
        case .openai: return "OpenAI (GPT)"
        case .openrouter: return "OpenRouter (free)"
        case .gemini: return "Google (Gemini)"
        }
    }

    /// UserDefaults key, matching Android's SharedPreferences names.
    var keyPref: String { "\(rawValue)_key" }

    var keyPlaceholder: String {
        switch self {
        case .anthropic: return "sk-ant-…"
        case .openai: return "sk-…"
        case .openrouter: return "sk-or-…"
        case .gemini: return "AIza…"
        }
    }
}

enum Prefs {
    private static let d = UserDefaults.standard

    static var provider: Provider {
        get { Provider(rawValue: d.string(forKey: "ai_provider") ?? "") ?? .anthropic }
        set { d.set(newValue.rawValue, forKey: "ai_provider") }
    }

    static func key(for p: Provider) -> String {
        (d.string(forKey: p.keyPref) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func setKey(_ value: String, for p: Provider) {
        d.set(value, forKey: p.keyPref)
    }

    static var activeKey: String { key(for: provider) }

    /// Image generation is always Gemini, regardless of the vision provider.
    static var geminiKey: String { key(for: .gemini) }
}
