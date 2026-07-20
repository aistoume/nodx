import UIKit
import Photos

/// What a finished action hands back to the UI.
enum ActionOutcome {
    case answer(String)                 // explain → ResultCard
    case openURL(URL, query: String)    // search/shop → Safari
    case saved                          // crop written to Photos
    case generated(UIImage)             // Gemini image (already saved)
}

enum Actions {
    // MARK: vision routing — same provider/model table as Android `Actions.vision()`

    static func vision(imageBase64: String, prompt: String, quality: Bool = false) async throws -> String {
        let provider = Prefs.provider
        let key = Prefs.key(for: provider)
        guard !key.isEmpty else { throw AIError.missingKey(provider.displayName) }
        switch provider {
        case .anthropic:
            return try await AnthropicClient.vision(
                apiKey: key, imageBase64: imageBase64, prompt: prompt,
                model: quality ? AnthropicClient.qualityModel : AnthropicClient.fastModel)
        case .openai:
            return try await OpenAIClient.vision(
                endpoint: "https://api.openai.com/v1/chat/completions",
                apiKey: key, imageBase64: imageBase64, prompt: prompt,
                model: quality ? OpenAIClient.openAIQuality : OpenAIClient.openAIFast)
        case .openrouter:
            return try await OpenAIClient.vision(
                endpoint: "https://openrouter.ai/api/v1/chat/completions",
                apiKey: key, imageBase64: imageBase64, prompt: prompt,
                model: OpenAIClient.openRouterModel)
        case .gemini:
            return try await GeminiClient.vision(apiKey: key, imageBase64: imageBase64, prompt: prompt)
        }
    }

    // MARK: runner

    /// Vision payloads don't need full-Retina pixels — Anthropic rejects
    /// >10MB and models are capped around ~1.6k px anyway. Downscale + JPEG
    /// keeps payloads ~100× smaller than a full-res PNG crop.
    private static func visionBase64(_ image: UIImage) throws -> String {
        let small = downscaled(image, maxDim: 1568)
        guard let jpeg = small.jpegData(compressionQuality: 0.82) else {
            throw AIError.badResponse("could not encode crop")
        }
        return jpeg.base64EncodedString()
    }

    static func run(_ action: WheelAction, crop: UIImage) async throws -> ActionOutcome {
        let b64 = try visionBase64(crop)

        switch action {
        case .prompt(let prompt):
            let answer = try await vision(imageBase64: b64, prompt: prompt)
            ActionLog.append(kind: .prompt, title: firstLine(answer), detail: answer, url: nil, thumb: crop)
            return .answer(answer)

        case .search(let urlPrefix):
            let raw = try await vision(imageBase64: b64, prompt: WheelAction.identifyPrompt)
            let query = cleanQuery(raw)
            guard let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
                  let url = URL(string: urlPrefix + encoded) else {
                throw AIError.badResponse("bad search URL for \u{201C}\(query)\u{201D}")
            }
            ActionLog.append(kind: .search, title: query, detail: query, url: url.absoluteString, thumb: crop)
            return .openURL(url, query: query)

        case .save:
            try await saveToPhotos(crop)
            ActionLog.append(kind: .save, title: "Saved to Photos", detail: "", url: nil, thumb: crop)
            return .saved

        case .instruct:
            // Never dispatched directly — MarqueeView collects the typed
            // instruction first and calls runInstruction below.
            throw AIError.badResponse("instruct needs a typed instruction")

        case .generate(_, let stylePrompt):
            let geminiKey = Prefs.geminiKey
            guard !geminiKey.isEmpty else { throw AIError.missingKey("Google (Gemini)") }
            let subject = try await vision(imageBase64: b64, prompt: WheelAction.describePrompt, quality: true)
            let fullPrompt = stylePrompt.replacingOccurrences(of: "{subject}", with: subject.trimmingCharacters(in: .whitespacesAndNewlines))
            let imageData = try await GeminiClient.generateImage(apiKey: geminiKey, prompt: fullPrompt)
            guard let image = UIImage(data: imageData) else { throw AIError.badResponse("Gemini returned unreadable image data") }
            let small = downscaled(image, maxDim: 640)
            try await saveToPhotos(small)
            ActionLog.append(kind: .generate, title: firstLine(subject), detail: fullPrompt, url: nil, thumb: small)
            return .generated(small)
        }
    }

    /// ✏️ Instruct (screenshot flow): vision + the intent-dispatch protocol
    /// (mirrors Android `instructVision`). A search-type instruction
    /// ("find it on Amazon") identifies the subject and OPENS the real
    /// results page; anything else shows the answer card.
    static func runInstruction(_ instruction: String, crop: UIImage) async throws -> ActionOutcome {
        let b64 = try visionBase64(crop)
        let prompt = Dispatch.visionProtocol() + "\n\n---\nInstruction: " + instruction
        let raw = try await vision(imageBase64: b64, prompt: prompt)
        if let directive = Dispatch.parseDirective(raw) {
            ActionLog.append(kind: .search, title: String(instruction.prefix(120)),
                             detail: directive.note ?? "", url: directive.url.absoluteString, thumb: crop)
            return .openURL(directive.url, query: instruction)
        }
        ActionLog.append(kind: .prompt, title: String(instruction.prefix(120)),
                         detail: raw, url: nil, thumb: crop)
        return .answer(raw)
    }

    // MARK: helpers

    /// Same cleanup as Android `AnthropicClient.identify`: strip quotes, collapse whitespace.
    static func cleanQuery(_ raw: String) -> String {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        for quote in ["\"", "'"] where s.hasPrefix(quote) && s.hasSuffix(quote) && s.count >= 2 {
            s = String(s.dropFirst().dropLast())
        }
        return s.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
    }

    private static func firstLine(_ s: String) -> String {
        let line = s.split(separator: "\n").first.map(String.init) ?? s
        return String(line.prefix(80))
    }

    static func saveToPhotos(_ image: UIImage) async throws {
        try await PHPhotoLibrary.shared().performChanges {
            PHAssetChangeRequest.creationRequestForAsset(from: image)
        }
    }

    static func downscaled(_ image: UIImage, maxDim: CGFloat) -> UIImage {
        let size = image.size
        let longest = max(size.width, size.height)
        guard longest > maxDim else { return image }
        let scale = maxDim / longest
        let target = CGSize(width: size.width * scale, height: size.height * scale)
        return UIGraphicsImageRenderer(size: target).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
    }
}
