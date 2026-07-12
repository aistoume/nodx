import SwiftUI

/// Answer / generated-image sheet — the iOS take on Android's `ResultCard`
/// overlay (dark card, amber title, copy button).
struct ResultCard: View {
    let title: String
    let text: String?
    let image: UIImage?

    @Environment(\.dismiss) private var dismiss
    @State private var copied = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let image {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFit()
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    if let text {
                        Text(text)
                            .font(.body)
                            .textSelection(.enabled)
                    }
                }
                .padding(20)
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if let text {
                        Button {
                            UIPasteboard.general.string = text
                            copied = true
                            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { copied = false }
                        } label: {
                            Label(copied ? "Copied" : "Copy", systemImage: copied ? "checkmark" : "doc.on.doc")
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents(image != nil ? [.large] : [.medium, .large])
    }
}
