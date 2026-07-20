import Foundation

/// Errors surfaced to the UI. Provider HTTP errors keep the Android format
/// ("Anthropic 401: …") so failures read the same across platforms.
enum AIError: LocalizedError {
    case missingKey(String)
    case http(String)
    case badResponse(String)

    var errorDescription: String? {
        switch self {
        case .missingKey(let provider): return "No API key for \(provider) \u{2014} add one in Settings."
        case .http(let msg): return msg
        case .badResponse(let msg): return msg
        }
    }
}

private func postJSON(_ url: URL, headers: [String: String], body: [String: Any], timeout: TimeInterval) async throws -> Data {
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.timeoutInterval = timeout
    req.setValue("application/json", forHTTPHeaderField: "content-type")
    for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }
    req.httpBody = try JSONSerialization.data(withJSONObject: body)
    let (data, resp) = try await URLSession.shared.data(for: req)
    guard let http = resp as? HTTPURLResponse else { throw AIError.badResponse("(no response)") }
    guard (200..<300).contains(http.statusCode) else {
        let text = String(data: data, encoding: .utf8) ?? ""
        let host = url.host ?? "api"
        throw AIError.http("\(host) \(http.statusCode): \(String(text.prefix(160)))")
    }
    return data
}

private func json(_ data: Data) throws -> [String: Any] {
    guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        throw AIError.badResponse("(unparseable response)")
    }
    return obj
}

// MARK: - Anthropic

enum AnthropicClient {
    static let fastModel = "claude-haiku-4-5"
    static let qualityModel = "claude-sonnet-5"

    static func text(apiKey: String, prompt: String, model: String) async throws -> String {
        let body: [String: Any] = [
            "model": model,
            "max_tokens": 800,
            "messages": [["role": "user", "content": prompt]],
        ]
        let data = try await postJSON(
            URL(string: "https://api.anthropic.com/v1/messages")!,
            headers: ["x-api-key": apiKey, "anthropic-version": "2023-06-01"],
            body: body, timeout: 60)
        guard let content = try json(data)["content"] as? [[String: Any]] else {
            throw AIError.badResponse("Anthropic: no content in response")
        }
        let out = content.compactMap { $0["text"] as? String }.joined()
        guard !out.isEmpty else { throw AIError.badResponse("Anthropic: empty answer") }
        return out
    }

    static func vision(apiKey: String, imageBase64: String, prompt: String, model: String) async throws -> String {
        let body: [String: Any] = [
            "model": model,
            "max_tokens": 400,
            "messages": [[
                "role": "user",
                "content": [
                    ["type": "image", "source": ["type": "base64", "media_type": "image/jpeg", "data": imageBase64]],
                    ["type": "text", "text": prompt],
                ],
            ]],
        ]
        let data = try await postJSON(
            URL(string: "https://api.anthropic.com/v1/messages")!,
            headers: ["x-api-key": apiKey, "anthropic-version": "2023-06-01"],
            body: body, timeout: 60)
        guard let content = try json(data)["content"] as? [[String: Any]] else {
            throw AIError.badResponse("Anthropic: no content in response")
        }
        let out = content.compactMap { $0["text"] as? String }.joined()
        guard !out.isEmpty else { throw AIError.badResponse("Anthropic: empty answer") }
        return out
    }
}

// MARK: - OpenAI & OpenAI-compatible (OpenRouter)

enum OpenAIClient {
    static let openAIFast = "gpt-5.6-luna"
    static let openAIQuality = "gpt-5.6-sol"
    static let openRouterModel = "openrouter/free"

    static func text(endpoint: String, apiKey: String, prompt: String, model: String) async throws -> String {
        let isOpenAI = endpoint.contains("api.openai.com")
        var body: [String: Any] = [
            "model": model,
            "messages": [["role": "user", "content": prompt]],
        ]
        if isOpenAI { body["max_completion_tokens"] = 4096 } else { body["max_tokens"] = 800 }
        let data = try await postJSON(
            URL(string: endpoint)!,
            headers: ["authorization": "Bearer \(apiKey)"],
            body: body, timeout: 90)
        guard let choices = try json(data)["choices"] as? [[String: Any]],
              let message = choices.first?["message"] as? [String: Any],
              let out = message["content"] as? String, !out.isEmpty else {
            throw AIError.badResponse("OpenAI: empty answer")
        }
        return out
    }

    static func vision(endpoint: String, apiKey: String, imageBase64: String, prompt: String, model: String) async throws -> String {
        let isOpenAI = endpoint.contains("api.openai.com")
        var body: [String: Any] = [
            "model": model,
            "messages": [[
                "role": "user",
                "content": [
                    ["type": "image_url", "image_url": ["url": "data:image/jpeg;base64,\(imageBase64)"]],
                    ["type": "text", "text": prompt],
                ],
            ]],
        ]
        // api.openai.com rejects max_tokens on current models; OpenRouter still uses it.
        if isOpenAI { body["max_completion_tokens"] = 4096 } else { body["max_tokens"] = 800 }
        let data = try await postJSON(
            URL(string: endpoint)!,
            headers: ["authorization": "Bearer \(apiKey)"],
            body: body, timeout: 90)
        guard let choices = try json(data)["choices"] as? [[String: Any]],
              let message = choices.first?["message"] as? [String: Any],
              let out = message["content"] as? String, !out.isEmpty else {
            throw AIError.badResponse("OpenAI: empty answer")
        }
        return out
    }
}

// MARK: - Gemini (vision + image generation)

enum GeminiClient {
    static let visionModel = "gemini-3.5-flash"
    /// gemini-2.5-flash-image sunsets 2026-08-17; this is its successor.
    static let imageModel = "gemini-3.1-flash-image"

    private static func endpoint(_ model: String, key: String) -> URL {
        URL(string: "https://generativelanguage.googleapis.com/v1beta/models/\(model):generateContent?key=\(key)")!
    }

    static func vision(apiKey: String, imageBase64: String, prompt: String) async throws -> String {
        let body: [String: Any] = [
            "contents": [[
                "role": "user",
                "parts": [
                    ["inlineData": ["mimeType": "image/jpeg", "data": imageBase64]],
                    ["text": prompt],
                ],
            ]],
        ]
        let data = try await postJSON(endpoint(visionModel, key: apiKey), headers: [:], body: body, timeout: 120)
        let out = textParts(try json(data)).joined()
        guard !out.isEmpty else { throw AIError.badResponse("Gemini: empty answer") }
        return out
    }

    static func text(apiKey: String, prompt: String) async throws -> String {
        let body: [String: Any] = [
            "contents": [["role": "user", "parts": [["text": prompt]]]],
        ]
        let data = try await postJSON(endpoint(visionModel, key: apiKey), headers: [:], body: body, timeout: 120)
        let out = textParts(try json(data)).joined()
        guard !out.isEmpty else { throw AIError.badResponse("Gemini: empty answer") }
        return out
    }

    /// Text-only request; returns decoded image bytes from the first inlineData part.
    static func generateImage(apiKey: String, prompt: String) async throws -> Data {
        let body: [String: Any] = [
            "contents": [["role": "user", "parts": [["text": prompt]]]],
        ]
        let data = try await postJSON(endpoint(imageModel, key: apiKey), headers: [:], body: body, timeout: 120)
        for part in parts(try json(data)) {
            if let inline = part["inlineData"] as? [String: Any],
               let b64 = inline["data"] as? String,
               let bytes = Data(base64Encoded: b64, options: .ignoreUnknownCharacters) {
                return bytes
            }
        }
        throw AIError.badResponse("Gemini: no image in response")
    }

    private static func parts(_ obj: [String: Any]) -> [[String: Any]] {
        guard let candidates = obj["candidates"] as? [[String: Any]],
              let content = candidates.first?["content"] as? [String: Any],
              let parts = content["parts"] as? [[String: Any]] else { return [] }
        return parts
    }

    private static func textParts(_ obj: [String: Any]) -> [String] {
        parts(obj).compactMap { part in
            if (part["thought"] as? Bool) == true { return nil }
            return part["text"] as? String
        }
    }
}
