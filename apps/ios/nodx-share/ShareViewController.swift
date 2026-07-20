import SwiftUI
import UniformTypeIdentifiers

/// Share Extension entry: select text anywhere → Share → nodx.
/// Extracts the shared text (or URL), then hosts the SwiftUI instruct UI.
final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        loadSharedText { [weak self] text in
            DispatchQueue.main.async { self?.present(text: text) }
        }
    }

    private func present(text: String) {
        let root = InstructShareView(
            sharedText: text,
            openURL: { [weak self] url in
                self?.extensionContext?.open(url) { ok in
                    if !ok { UIPasteboard.general.string = url.absoluteString }
                }
            },
            done: { [weak self] in
                self?.extensionContext?.completeRequest(returningItems: nil)
            })
        let host = UIHostingController(rootView: root)
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
    }

    private func loadSharedText(_ completion: @escaping (String) -> Void) {
        let providers = (extensionContext?.inputItems as? [NSExtensionItem])?
            .flatMap { $0.attachments ?? [] } ?? []
        // Prefer plain text (selected words); fall back to a shared page URL.
        if let p = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) }) {
            p.loadItem(forTypeIdentifier: UTType.plainText.identifier) { item, _ in
                completion((item as? String) ?? (item as? NSAttributedString)?.string ?? "")
            }
        } else if let p = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.url.identifier) }) {
            p.loadItem(forTypeIdentifier: UTType.url.identifier) { item, _ in
                completion((item as? URL)?.absoluteString ?? "")
            }
        } else {
            completion("")
        }
    }
}

/// The instruct sheet: shows the grabbed text, takes a typed instruction,
/// runs the text dispatch protocol — search-type instructions produce an
/// "Open …" button (real results page), everything else an answer card.
struct InstructShareView: View {
    let sharedText: String
    let openURL: (URL) -> Void
    let done: () -> Void

    @State private var instruction = ""
    @State private var running = false
    @State private var answer: String?
    @State private var directive: Dispatch.Directive?
    @State private var errorText: String?
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section("Selected text") {
                    Text(sharedText.count > 300 ? String(sharedText.prefix(300)) + "\u{2026}" : sharedText)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(6)
                }
                Section("\u{270F}\u{FE0F} Instruction") {
                    TextField("e.g. \u{201C}explain it to me\u{201D}, \u{201C}open it on Amazon\u{201D}\u{2026}", text: $instruction)
                        .focused($focused)
                        .submitLabel(.go)
                        .onSubmit(run)
                        .disabled(running)
                    if running {
                        HStack(spacing: 8) {
                            ProgressView()
                            Text("Running\u{2026}").foregroundStyle(.secondary)
                        }
                    }
                }
                if let d = directive {
                    Section("Result") {
                        if let note = d.note { Text(note) }
                        Button {
                            openURL(d.url)
                            done()
                        } label: {
                            Label("Open \(d.url.host ?? "page")", systemImage: "safari")
                        }
                        Button {
                            UIPasteboard.general.string = d.url.absoluteString
                        } label: {
                            Label("Copy link", systemImage: "doc.on.doc")
                        }
                    }
                }
                if let a = answer {
                    Section("Answer") {
                        Text(a).font(.callout).textSelection(.enabled)
                        Button {
                            UIPasteboard.general.string = a
                        } label: {
                            Label("Copy", systemImage: "doc.on.doc")
                        }
                    }
                }
                if let e = errorText {
                    Section { Text(e).foregroundStyle(.red).font(.footnote) }
                }
            }
            .navigationTitle("nodx")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { done() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Run") { run() }.disabled(running || instruction.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear { focused = true }
        }
    }

    private func run() {
        let ins = instruction.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !ins.isEmpty, !running else { return }
        running = true
        answer = nil
        directive = nil
        errorText = nil
        Task {
            do {
                let prompt = Dispatch.textProtocol() + "\n\n---\nInstruction: " + ins + "\n\nText:\n" + sharedText
                let raw = try await TextAI.run(prompt: prompt)
                await MainActor.run {
                    running = false
                    if let d = Dispatch.parseDirective(raw) {
                        directive = d
                    } else {
                        answer = raw
                    }
                }
            } catch {
                await MainActor.run {
                    running = false
                    errorText = error.localizedDescription
                }
            }
        }
    }
}
