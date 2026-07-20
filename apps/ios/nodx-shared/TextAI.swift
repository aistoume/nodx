import Foundation

/// Text-only AI call routed by the shared provider prefs — the text
/// counterpart of `Actions.vision` (which stays app-side with its UIKit
/// deps). Used by the Share Extension's instruct flow.
enum TextAI {
    static func run(prompt: String, quality: Bool = false) async throws -> String {
        let provider = Prefs.provider
        let key = Prefs.key(for: provider)
        guard !key.isEmpty else { throw AIError.missingKey(provider.displayName) }
        switch provider {
        case .anthropic:
            return try await AnthropicClient.text(
                apiKey: key, prompt: prompt,
                model: quality ? AnthropicClient.qualityModel : AnthropicClient.fastModel)
        case .openai:
            return try await OpenAIClient.text(
                endpoint: "https://api.openai.com/v1/chat/completions",
                apiKey: key, prompt: prompt,
                model: quality ? OpenAIClient.openAIQuality : OpenAIClient.openAIFast)
        case .openrouter:
            return try await OpenAIClient.text(
                endpoint: "https://openrouter.ai/api/v1/chat/completions",
                apiKey: key, prompt: prompt,
                model: OpenAIClient.openRouterModel)
        case .gemini:
            return try await GeminiClient.text(apiKey: key, prompt: prompt)
        }
    }
}
