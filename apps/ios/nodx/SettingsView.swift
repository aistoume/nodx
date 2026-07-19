import SwiftUI

/// Provider + API key, mirroring the Android Settings tab: a provider picker
/// and the active provider's key row (persisted on every keystroke, BYOK).
struct SettingsView: View {
    @State private var provider: Provider = Prefs.provider
    @State private var key: String = Prefs.key(for: Prefs.provider)

    var body: some View {
        NavigationStack {
            Form {
                Section("AI provider") {
                    Picker("Provider", selection: $provider) {
                        ForEach(Provider.allCases) { p in
                            Text(p.displayName).tag(p)
                        }
                    }
                    .pickerStyle(.menu)
                }

                Section {
                    HStack {
                        TextField(provider.keyPlaceholder, text: $key)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .font(.system(.body, design: .monospaced))
                        Button {
                            if let pasted = UIPasteboard.general.string {
                                key = pasted.trimmingCharacters(in: .whitespacesAndNewlines)
                            }
                        } label: {
                            Image(systemName: "doc.on.clipboard")
                        }
                    }
                } header: {
                    Text("\(provider.displayName) API key")
                } footer: {
                    footerText
                }

                Section("About") {
                    LabeledContent("Version", value: "0.2.0")
                    Link("aicon.solutions", destination: URL(string: "https://aicon.solutions/nodx/")!)
                }
            }
            .navigationTitle("Settings")
        }
        .onChange(of: provider) { _, newProvider in
            Prefs.provider = newProvider
            key = Prefs.key(for: newProvider)
        }
        .onChange(of: key) { _, newKey in
            Prefs.setKey(newKey, for: provider)
        }
    }

    private var footerText: Text {
        if provider == .gemini {
            return Text("Your key stays on this device. Gemini also powers \u{1F3A8} image generation.")
        }
        return Text("Your key stays on this device. \u{1F3A8} Generate additionally needs a Gemini key \u{2014} switch the provider to Google (Gemini) to add one.")
    }
}
