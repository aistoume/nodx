import Foundation

/// Verified site search prefixes — 1:1 with Android `SearchPresets.ITEMS` /
/// the extension's `search-presets.ts`. Models hallucinate site URL patterns
/// otherwise, so the dispatch protocol grounds them in this table.
enum SearchPresets {
    static let items: [(label: String, url: String)] = [
        ("Google Search", "https://www.google.com/search?q="),
        ("Google Images", "https://www.google.com/search?udm=2&q="),
        ("Google Shopping", "https://www.google.com/search?udm=28&q="),
        ("Amazon", "https://www.amazon.com/s?k="),
        ("eBay", "https://www.ebay.com/sch/i.html?_nkw="),
        ("Taobao \u{6DD8}\u{5B9D}", "https://s.taobao.com/search?q="),
        ("JD \u{4EAC}\u{4E1C}", "https://search.jd.com/Search?keyword="),
        ("Xiaohongshu \u{5C0F}\u{7EA2}\u{4E66}", "https://www.xiaohongshu.com/search_result?keyword="),
        ("Temu", "https://www.temu.com/search_result.html?search_key="),
        ("AliExpress", "https://www.aliexpress.com/wholesale?SearchText="),
        ("Bing", "https://www.bing.com/search?q="),
        ("YouTube", "https://www.youtube.com/results?search_query="),
        ("Bilibili", "https://search.bilibili.com/all?keyword="),
        ("X (Twitter)", "https://x.com/search?q="),
        ("Reddit", "https://www.reddit.com/search/?q="),
        ("Zhihu \u{77E5}\u{4E4E}", "https://www.zhihu.com/search?type=content&q="),
        ("Wikipedia", "https://en.wikipedia.org/w/index.php?search="),
        ("arXiv", "https://arxiv.org/search/?searchtype=all&query="),
        ("Google Scholar", "https://scholar.google.com/scholar?q="),
        ("GitHub", "https://github.com/search?q="),
        ("Perplexity", "https://www.perplexity.ai/search?q="),
    ]
}

/// Intent-dispatch protocol for ✏️ Instruct — port of Android
/// `TextActions.visionDispatchProtocol` / the extension's `dispatch.ts`.
/// The model either answers directly, or emits ONE executable directive:
/// `{"action":"open_url","url":…,"note":…}`.
enum Dispatch {
    struct Directive {
        let url: URL
        let note: String?
    }

    /// "  Label: https://prefix" lines — presets + the wheel's own search actions.
    private static func sitePrefixList() -> String {
        var order: [String] = []
        var prefixes: [String: String] = [:]
        func put(_ label: String, _ url: String) {
            if prefixes[label] == nil { order.append(label) }
            prefixes[label] = url
        }
        for p in SearchPresets.items { put(p.label, p.url) }
        for spoke in WheelConfig.defaults() {
            for item in [spoke] + spoke.children {
                if case .search(let urlPrefix) = item.action, !item.label.isEmpty, !urlPrefix.isEmpty {
                    put(item.label, urlPrefix)
                }
            }
        }
        return order.map { "  \($0): \(prefixes[$0]!)" }.joined(separator: "\n")
    }

    /// Vision flavour: the instruction applies to a screenshot crop the user
    /// framed — identify the subject first, then build the query.
    static func visionProtocol() -> String {
        """
        You can either ANSWER the instruction directly, OR execute an action:

        You are looking at a screenshot region the user framed. When the instruction asks to SEARCH / find / buy / open something related to what is shown, first IDENTIFY the main subject in the image, turn it into a concise search query (brand + product + key attribute; 3-8 words), then reply with ONLY this one-line JSON and absolutely nothing else:
        {"action":"open_url","url":"<search-results URL with the query filled in>","note":"<one short sentence naming what you identified and where you opened it, in the instruction's language>"}
        CRITICAL: emitting this JSON is the ONLY way the page actually opens. Do not describe the action in prose, and never claim a page was opened unless your reply IS this JSON.

        Known site search prefixes — when the target site matches one of these, you MUST use the exact prefix and append the URL-encoded query:
        \(sitePrefixList())
        For a site NOT in this list, use its real search URL only if you are certain; otherwise fall back to https://www.google.com/search?q=site%3A<domain>+<query>.
        Make the query practical for that site's audience (translate/simplify when appropriate).

        For every other kind of instruction (describe, explain, read the text, translate what's shown\u{2026}), just do the task and output the result directly \u{2014} no JSON.
        """
    }

    /// Parse a directive: whole reply, code-fenced reply, or JSON embedded in
    /// prose (models slip despite the protocol — a narrated-but-unexecuted
    /// action reads as a lie, so the embedded form still runs).
    static func parseDirective(_ raw: String) -> Directive? {
        func tryParse(_ body: String) -> Directive? {
            guard let data = body.data(using: .utf8),
                  let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                  obj["action"] as? String == "open_url",
                  let urlString = obj["url"] as? String,
                  let url = URL(string: urlString),
                  url.scheme == "https" || url.scheme == "http" else { return nil }
            let note = (obj["note"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            return Directive(url: url, note: (note?.isEmpty ?? true) ? nil : note)
        }

        var body = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if body.hasPrefix("```"), body.hasSuffix("```"), body.count > 6 {
            body = String(body.dropFirst(3).dropLast(3))
            if body.lowercased().hasPrefix("json") { body = String(body.dropFirst(4)) }
            body = body.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let whole = tryParse(body) { return whole }
        if let regex = try? NSRegularExpression(pattern: "\\{[^{}]*\"action\"\\s*:\\s*\"open_url\"[^{}]*\\}") {
            let ns = raw as NSString
            for m in regex.matches(in: raw, range: NSRange(location: 0, length: ns.length)) {
                if let d = tryParse(ns.substring(with: m.range)) { return d }
            }
        }
        return nil
    }
}
