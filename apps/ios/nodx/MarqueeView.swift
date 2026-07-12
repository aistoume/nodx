import SwiftUI

/// Full-screen selection stage — port of Android `SelectionOverlayView`:
/// screenshot + dim + amber drag-rect. Releasing a rect > 24pt opens the
/// radial menu centred on it; picking an action runs it and shows the result.
struct MarqueeView: View {
    let image: UIImage
    let onClose: () -> Void

    private enum Mode { case select, menu, running }

    @State private var mode: Mode = .select
    @State private var dragStart: CGPoint?
    @State private var dragCurrent: CGPoint?
    @State private var selectionRect: CGRect = .zero
    @State private var crop: UIImage?
    @State private var runningLabel = ""
    @State private var outcome: ActionOutcome?
    @State private var errorMessage: String?
    @State private var savedFlash = false

    @Environment(\.openURL) private var openURL

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black.ignoresSafeArea()

                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(width: geo.size.width, height: geo.size.height)

                dimAndFrame()

                if mode == .select {
                    // Drag surface for the marquee.
                    Color.white.opacity(0.001)
                        .contentShape(Rectangle())
                        .gesture(dragGesture(in: geo.size))
                }

                if mode == .menu {
                    RadialMenuView(
                        items: WheelConfig.defaults(),
                        center: CGPoint(x: selectionRect.midX, y: selectionRect.midY),
                        bounds: geo.size,
                        onPick: { item in pick(item) },
                        onCancel: { resetSelection() })
                }

                if mode == .running {
                    VStack(spacing: 12) {
                        ProgressView().tint(.white).scaleEffect(1.4)
                        Text(runningLabel)
                            .font(.footnote.weight(.medium))
                            .foregroundStyle(.white.opacity(0.9))
                    }
                    .padding(24)
                    .background(RoundedRectangle(cornerRadius: 16).fill(Color(white: 0.1).opacity(0.92)))
                }

                closeButton()

                if savedFlash {
                    Label("Saved to Photos", systemImage: "checkmark.circle.fill")
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 18).padding(.vertical, 12)
                        .background(Capsule().fill(Color.green.opacity(0.9)))
                        .transition(.opacity)
                }
            }
        }
        .statusBarHidden()
        .sheet(isPresented: answerSheetBinding) { answerSheet() }
        .alert("Action failed", isPresented: errorBinding) {
            Button("OK") { errorMessage = nil; resetSelection() }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    // MARK: selection

    private func dragGesture(in size: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 4)
            .onChanged { value in
                if dragStart == nil { dragStart = value.startLocation }
                dragCurrent = value.location
                if let s = dragStart, let c = dragCurrent {
                    selectionRect = CGRect(x: min(s.x, c.x), y: min(s.y, c.y),
                                           width: abs(s.x - c.x), height: abs(s.y - c.y))
                }
            }
            .onEnded { _ in
                dragStart = nil
                dragCurrent = nil
                // Same 24px minimum as Android before the menu opens.
                if selectionRect.width > 24 && selectionRect.height > 24,
                   let cropped = cropImage(viewRect: selectionRect, viewSize: size) {
                    crop = cropped
                    withAnimation(.spring(duration: 0.25)) { mode = .menu }
                } else {
                    resetSelection()
                }
            }
    }

    @ViewBuilder
    private func dimAndFrame() -> some View {
        if selectionRect.width > 0 {
            // Dim everything except the selection, then stroke it amber (#F59E0B).
            Color.black.opacity(0.47)
                .ignoresSafeArea()
                .mask {
                    Rectangle()
                        .overlay(
                            Rectangle()
                                .frame(width: selectionRect.width, height: selectionRect.height)
                                .position(x: selectionRect.midX, y: selectionRect.midY)
                                .blendMode(.destinationOut))
                }
            Rectangle()
                .stroke(Color(red: 0.961, green: 0.620, blue: 0.043), lineWidth: 3)
                .frame(width: selectionRect.width, height: selectionRect.height)
                .position(x: selectionRect.midX, y: selectionRect.midY)
        } else {
            Color.black.opacity(0.25).ignoresSafeArea()
        }
    }

    /// Map the on-screen rect back to image pixels (image is aspect-fit centred).
    private func cropImage(viewRect: CGRect, viewSize: CGSize) -> UIImage? {
        let imgSize = image.size
        guard imgSize.width > 0, imgSize.height > 0 else { return nil }
        let fit = min(viewSize.width / imgSize.width, viewSize.height / imgSize.height)
        let displayed = CGSize(width: imgSize.width * fit, height: imgSize.height * fit)
        let origin = CGPoint(x: (viewSize.width - displayed.width) / 2,
                             y: (viewSize.height - displayed.height) / 2)
        let inImage = CGRect(x: (viewRect.minX - origin.x) / fit,
                             y: (viewRect.minY - origin.y) / fit,
                             width: viewRect.width / fit,
                             height: viewRect.height / fit)
            .intersection(CGRect(origin: .zero, size: imgSize))
        guard inImage.width > 8, inImage.height > 8 else { return nil }
        // Render-crop (handles orientation and scale uniformly).
        return UIGraphicsImageRenderer(size: inImage.size).image { _ in
            image.draw(at: CGPoint(x: -inImage.minX, y: -inImage.minY))
        }
    }

    private func resetSelection() {
        withAnimation(.easeOut(duration: 0.15)) {
            mode = .select
            selectionRect = .zero
            crop = nil
        }
    }

    // MARK: actions

    private func pick(_ item: WheelItem) {
        guard let action = item.action, let crop else {
            resetSelection()
            return
        }
        runningLabel = runningText(for: action, label: item.label)
        withAnimation { mode = .running }
        Task {
            do {
                let result = try await Actions.run(action, crop: crop)
                await MainActor.run { handle(result) }
            } catch {
                await MainActor.run {
                    mode = .select
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func handle(_ result: ActionOutcome) {
        switch result {
        case .answer, .generated:
            outcome = result
            mode = .select
        case .openURL(let url, _):
            openURL(url)
            resetSelection()
        case .saved:
            resetSelection()
            withAnimation { savedFlash = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
                withAnimation { savedFlash = false }
            }
        }
    }

    private func runningText(for action: WheelAction, label: String) -> String {
        switch action {
        case .prompt: return "Asking AI\u{2026}"
        case .search: return "Identifying\u{2026}"
        case .save: return "Saving\u{2026}"
        case .generate: return "Generating image\u{2026} (two AI calls)"
        }
    }

    // MARK: result presentation

    private var answerSheetBinding: Binding<Bool> {
        Binding(get: { outcome != nil }, set: { if !$0 { outcome = nil; resetSelection() } })
    }

    private var errorBinding: Binding<Bool> {
        Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
    }

    @ViewBuilder
    private func answerSheet() -> some View {
        if let outcome {
            switch outcome {
            case .answer(let text):
                ResultCard(title: "\u{1F4D6} Explain", text: text, image: nil)
            case .generated(let image):
                ResultCard(title: "\u{1F3A8} Generated (saved to Photos)", text: nil, image: image)
            default:
                EmptyView()
            }
        }
    }

    private func closeButton() -> some View {
        VStack {
            HStack {
                Button {
                    onClose()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(Color(white: 0.1).opacity(0.85)))
                }
                .padding(.leading, 16)
                Spacer()
                Text("Drag to box a region")
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.65))
                    .padding(.trailing, 20)
                    .opacity(mode == .select && selectionRect == .zero ? 1 : 0)
            }
            .padding(.top, 8)
            Spacer()
        }
    }
}
