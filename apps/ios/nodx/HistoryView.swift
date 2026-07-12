import SwiftUI

/// Activity log tab — newest first, tap for detail / reopen URL.
struct HistoryView: View {
    @State private var entries: [LogEntry] = []
    @State private var selected: LogEntry?

    @Environment(\.openURL) private var openURL

    var body: some View {
        NavigationStack {
            Group {
                if entries.isEmpty {
                    ContentUnavailableView(
                        "No activity yet",
                        systemImage: "clock.arrow.circlepath",
                        description: Text("Explains, searches, saves and generations will show up here."))
                } else {
                    List(entries) { entry in
                        Button { tap(entry) } label: { row(entry) }
                            .buttonStyle(.plain)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("History")
        }
        .onAppear { entries = ActionLog.list().reversed() }
        .sheet(item: $selected) { entry in
            ResultCard(
                title: "\(entry.kind.emoji) \(entry.title)",
                text: entry.detail.isEmpty ? entry.title : entry.detail,
                image: ActionLog.thumbImage(entry))
        }
    }

    private func row(_ entry: LogEntry) -> some View {
        HStack(spacing: 12) {
            if let thumb = ActionLog.thumbImage(entry) {
                Image(uiImage: thumb)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            } else {
                Text(entry.kind.emoji)
                    .frame(width: 44, height: 44)
                    .background(RoundedRectangle(cornerRadius: 8).fill(.quaternary.opacity(0.5)))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("\(entry.kind.emoji) \(entry.title)")
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                Text(entry.date, style: .relative)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if entry.url != nil {
                Image(systemName: "arrow.up.right.square").foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    private func tap(_ entry: LogEntry) {
        if let urlString = entry.url, let url = URL(string: urlString) {
            openURL(url)
        } else {
            selected = entry
        }
    }
}
