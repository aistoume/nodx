import Foundation

/// Action kinds — 1:1 with the Android/extension `wheel_config_v1` schema.
enum WheelAction: Equatable {
    case prompt(String)
    case search(urlPrefix: String)
    case save
    /// Ask for the instruction at use time (typed in a dialog), then run it
    /// through the intent-dispatch protocol (`Dispatch.swift`): search-type
    /// instructions open the real results page, everything else answers.
    case instruct
    case generate(layout: String, stylePrompt: String)

    static let layoutGrid = "grid"
    static let layoutSingle = "single"

    static let defaultExplainPrompt =
        "What is this? Answer concisely (2\u{2013}4 sentences), quoting key numbers/text exactly."

    static let defaultSearchPrefix = "https://www.google.com/search?udm=2&q="

    /// Same prompt as the extension service worker / Android `AnthropicClient.IDENTIFY_PROMPT`.
    static let identifyPrompt =
        "Identify the single product shown in this image. Reply with ONLY a concise shopping search query \u{2014} brand + product name + key attribute (e.g. \"Seven Minerals aloe vera gel 12oz\"). 3-8 words, no punctuation, no quotes, no explanation. If it is not obviously a buyable product, still return the best short search term for the main object."

    /// Same as Android `AnthropicClient.DESCRIBE_PROMPT`.
    static let describePrompt =
        "Look at this image carefully. Write a detailed, vivid image-generation prompt (English, one paragraph, 60\u{2013}120 words) that captures the subject, composition, style, colours, lighting, mood, and any distinctive details. The prompt should be usable in Midjourney / DALL-E / Gemini image generation. Do NOT prefix with 'a prompt for' \u{2014} just write the prompt itself."

    /// Same as Android `WheelAction.DEFAULT_GRID_STYLE_PROMPT`.
    static let defaultGridStylePrompt = """
    Create ONE single image composed as a clean 2×2 grid of four equal quadrants. Each quadrant shows the SAME subject rendered in a different visual style. Keep the subject identical across all four quadrants.

    Subject: {subject}

    - Top-left quadrant: a realistic e-commerce PRODUCT PHOTOGRAPH of the subject as a physical, purchasable object on a plain seamless white studio background, soft even lighting, sharp focus, realistic materials.
    - Top-right quadrant: a hand-drawn ink-and-watercolour illustration.
    - Bottom-left quadrant: a polished 3D render with soft global illumination and subtle reflections.
    - Bottom-right quadrant: minimalist black line art on a plain white background, a few clean strokes, no shading.

    Lay the four quadrants out as an even, clearly separated 2×2 grid. Keep it a small, compact graphic.
    """

    /// Same as Android `WheelAction.DEFAULT_SINGLE_STYLE_PROMPT`.
    static let defaultSingleStylePrompt = """
    Create ONE single, polished image of the subject below. Clean composition, soft lighting, simple uncluttered background, sharp focus. Keep it a small, compact graphic.

    Subject: {subject}
    """
}

/// One spoke (or submenu child) of the wheel.
struct WheelItem: Identifiable {
    let id = UUID()
    let emoji: String
    let label: String
    let action: WheelAction?
    let children: [WheelItem]

    init(emoji: String, label: String, action: WheelAction? = nil, children: [WheelItem] = []) {
        self.emoji = emoji
        self.label = label
        self.action = action
        self.children = children
    }

    var isBranch: Bool { !children.isEmpty }
}

enum WheelConfig {
    /// The stock wheel — mirrors Android v1.2.0 `WheelConfig.defaults`:
    /// up 🔍 Search(📖 Explain / 🔎 Web search / 💡 Save) · right ✏️ Instruct
    /// · down 🛒 Shopping(🏷/📦) · left 🎨 Generate. Every item is labeled.
    static func defaults() -> [WheelItem] {
        [
            WheelItem(emoji: "\u{1F50D}", label: "Search", children: [
                WheelItem(emoji: "\u{1F4D6}", label: "Explain", action: .prompt(WheelAction.defaultExplainPrompt)),
                WheelItem(emoji: "\u{1F50E}", label: "Web search", action: .search(urlPrefix: WheelAction.defaultSearchPrefix)),
                WheelItem(emoji: "\u{1F4A1}", label: "Save", action: .save),
            ]),
            WheelItem(emoji: "\u{270F}\u{FE0F}", label: "Instruct", action: .instruct),
            WheelItem(emoji: "\u{1F6D2}", label: "Shopping", children: [
                WheelItem(emoji: "\u{1F3F7}", label: "Google shop", action: .search(urlPrefix: "https://www.google.com/search?udm=28&q=")),
                WheelItem(emoji: "\u{1F4E6}", label: "Amazon", action: .search(urlPrefix: "https://www.amazon.com/s?k=")),
            ]),
            WheelItem(emoji: "\u{1F3A8}", label: "Generate",
                      action: .generate(layout: WheelAction.layoutGrid, stylePrompt: WheelAction.defaultGridStylePrompt)),
        ]
    }
}
