import UIKit

/// Append-only JSONL activity log + thumbnails, mirroring Android `ActionLog`:
/// Documents/action-log.jsonl, Documents/action-thumbs/<uuid>.png, capped at 200.
enum LogKind: String, Codable {
    case prompt, search, save, generate

    var emoji: String {
        switch self {
        case .prompt: return "\u{1F4D6}"
        case .search: return "\u{1F50E}"
        case .save: return "\u{1F4A1}"
        case .generate: return "\u{1F3A8}"
        }
    }
}

struct LogEntry: Codable, Identifiable {
    let id: String
    let kind: LogKind
    let title: String
    let detail: String
    let url: String?
    let thumb: String?      // filename inside action-thumbs/
    let createdAt: Double   // epoch ms

    var date: Date { Date(timeIntervalSince1970: createdAt / 1000) }
}

enum ActionLog {
    static let maxEntries = 200

    private static var docs: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }
    private static var logFile: URL { docs.appendingPathComponent("action-log.jsonl") }
    private static var thumbsDir: URL { docs.appendingPathComponent("action-thumbs", isDirectory: true) }

    static func append(kind: LogKind, title: String, detail: String, url: String?, thumb: UIImage?) {
        let id = UUID().uuidString
        var thumbName: String?
        if let thumb {
            let small = Actions.downscaled(thumb, maxDim: 360)
            if let data = small.pngData() {
                try? FileManager.default.createDirectory(at: thumbsDir, withIntermediateDirectories: true)
                let name = "\(id).png"
                if (try? data.write(to: thumbsDir.appendingPathComponent(name))) != nil {
                    thumbName = name
                }
            }
        }
        let entry = LogEntry(id: id, kind: kind, title: title, detail: detail, url: url,
                             thumb: thumbName, createdAt: Date().timeIntervalSince1970 * 1000)
        var entries = list()
        entries.append(entry)
        if entries.count > maxEntries {
            let dropped = entries.prefix(entries.count - maxEntries)
            for old in dropped {
                if let t = old.thumb {
                    try? FileManager.default.removeItem(at: thumbsDir.appendingPathComponent(t))
                }
            }
            entries = Array(entries.suffix(maxEntries))
        }
        write(entries)
    }

    /// Oldest-first, as stored.
    static func list() -> [LogEntry] {
        guard let raw = try? String(contentsOf: logFile, encoding: .utf8) else { return [] }
        let decoder = JSONDecoder()
        return raw.split(separator: "\n").compactMap { line in
            try? decoder.decode(LogEntry.self, from: Data(line.utf8))
        }
    }

    static func thumbImage(_ entry: LogEntry) -> UIImage? {
        guard let t = entry.thumb else { return nil }
        return UIImage(contentsOfFile: thumbsDir.appendingPathComponent(t).path)
    }

    private static func write(_ entries: [LogEntry]) {
        let encoder = JSONEncoder()
        let lines = entries.compactMap { entry -> String? in
            guard let data = try? encoder.encode(entry) else { return nil }
            return String(data: data, encoding: .utf8)
        }
        try? lines.joined(separator: "\n").write(to: logFile, atomically: true, encoding: .utf8)
    }
}
