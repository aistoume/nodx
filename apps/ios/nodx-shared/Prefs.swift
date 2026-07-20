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
    /// App Group so the Share Extension reads the same provider + keys.
    static let appGroup = "group.solutions.aicon.nodx"

    private static let d: UserDefaults = {
        guard let group = UserDefaults(suiteName: appGroup) else { return .standard }
        // One-time migration: settings saved before the app-group move live
        // in .standard — copy them over so nobody re-enters their keys.
        let std = UserDefaults.standard
        if group.string(forKey: "ai_provider") == nil {
            for key in ["ai_provider"] + Provider.allCases.map(\.keyPref) {
                if let v = std.string(forKey: key) { group.set(v, forKey: key) }
            }
        }
        return group
    }()

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
