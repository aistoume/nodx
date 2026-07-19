import SwiftUI

/// Two-level radial (pie) menu — port of Android `RadialMenu` / extension
/// `radial-menu.ts`. Four spokes at up/right/down/left; branch spokes swap to
/// their children fanned at 36° steps on a larger radius with dashed
/// connectors. Center button: ✕ cancel at level 1, ↩ back at level 2.
struct RadialMenuView: View {
    let items: [WheelItem]          // exactly 4 spokes
    let center: CGPoint             // desired center in this view's coords
    let bounds: CGSize              // hosting view size, for clamping/scaling
    let onPick: (WheelItem) -> Void
    let onCancel: () -> Void

    @State private var level: WheelItem? = nil   // nil = level 1, else the open branch

    // Reference geometry (Android dp / extension px); scaled to fit the screen.
    private static let outerRadius: CGFloat = 92
    private static let subRadius: CGFloat = 172
    private static let buttonSize: CGFloat = 78
    private static let subStepDeg: CGFloat = 36

    /// Fixed spoke colours by position: up blue, right amber, down green, left purple.
    private static let spokeColors: [Color] = [
        Color(red: 0.231, green: 0.510, blue: 0.965),
        Color(red: 0.851, green: 0.467, blue: 0.024),
        Color(red: 0.063, green: 0.725, blue: 0.506),
        Color(red: 0.659, green: 0.333, blue: 0.969),
    ]

    private var scale: CGFloat {
        let need = Self.subRadius + Self.buttonSize / 2 + 12
        let available = min(bounds.width, bounds.height) / 2 - 8
        return min(1, max(0.55, available / need))
    }

    private var clampedCenter: CGPoint {
        let pad = (Self.subRadius + Self.buttonSize / 2 + 12) * scale
        return CGPoint(
            x: min(max(center.x, pad), max(pad, bounds.width - pad)),
            y: min(max(center.y, pad), max(pad, bounds.height - pad)))
    }

    var body: some View {
        ZStack {
            // Scrim: tap backs out of a submenu, or cancels at top level.
            Color.black.opacity(0.001)
                .contentShape(Rectangle())
                .onTapGesture {
                    if level != nil { level = nil } else { onCancel() }
                }

            if let branch = level {
                connectors(for: branch)
                childButtons(for: branch)
            } else {
                spokeButtons()
            }

            centerButton()
        }
    }

    // MARK: pieces

    private func spokeButtons() -> some View {
        // Android v1.2.0: every button carries its label ("全项带名").
        ForEach(Array(items.prefix(4).enumerated()), id: \.element.id) { index, item in
            let pos = position(angleDeg: CGFloat(index) * 90, radius: Self.outerRadius * scale)
            wheelButton(item: item, color: Self.spokeColors[index], at: pos, showLabel: true) {
                if item.isBranch {
                    withAnimation(.spring(duration: 0.2)) { level = item }
                } else {
                    onPick(item)
                }
            }
        }
    }

    private func childButtons(for branch: WheelItem) -> some View {
        let parentIndex = items.firstIndex(where: { $0.id == branch.id }) ?? 0
        let parentAngle = CGFloat(parentIndex) * 90
        let color = Self.spokeColors[min(parentIndex, 3)]
        let n = branch.children.count
        return ForEach(Array(branch.children.enumerated()), id: \.element.id) { i, child in
            let offset = (CGFloat(i) - CGFloat(n - 1) / 2) * Self.subStepDeg
            let pos = position(angleDeg: parentAngle + offset, radius: Self.subRadius * scale)
            wheelButton(item: child, color: color, at: pos, showLabel: true) {
                onPick(child)
            }
        }
    }

    private func connectors(for branch: WheelItem) -> some View {
        let parentIndex = items.firstIndex(where: { $0.id == branch.id }) ?? 0
        let parentAngle = CGFloat(parentIndex) * 90
        let from = position(angleDeg: parentAngle, radius: Self.outerRadius * scale * 0.4)
        let n = branch.children.count
        return Path { path in
            for i in 0..<n {
                let offset = (CGFloat(i) - CGFloat(n - 1) / 2) * Self.subStepDeg
                let to = position(angleDeg: parentAngle + offset, radius: Self.subRadius * scale)
                path.move(to: from)
                path.addLine(to: to)
            }
        }
        .stroke(Color.white.opacity(0.55), style: StrokeStyle(lineWidth: 2, dash: [6, 6]))
    }

    private func centerButton() -> some View {
        Button {
            if level != nil {
                withAnimation(.spring(duration: 0.2)) { level = nil }
            } else {
                onCancel()
            }
        } label: {
            Text(level == nil ? "\u{2715}" : "\u{21A9}")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 48 * scale + 8, height: 48 * scale + 8)
                .background(Circle().fill(Color(white: 0.12).opacity(0.95)))
                .overlay(Circle().stroke(Color.white.opacity(0.35), lineWidth: 1))
        }
        .position(clampedCenter)
    }

    private func wheelButton(item: WheelItem, color: Color, at pos: CGPoint, showLabel: Bool, action: @escaping () -> Void) -> some View {
        let labeled = showLabel && !item.label.isEmpty
        return Button(action: action) {
            VStack(spacing: 1) {
                Text(item.emoji).font(.system(size: (labeled ? 24 : 30) * scale))
                if labeled {
                    Text(item.label)
                        .font(.system(size: 10, weight: .bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .foregroundStyle(.white)
                }
            }
            .frame(width: Self.buttonSize * scale, height: Self.buttonSize * scale)
            .background(Circle().fill(color.opacity(0.95)))
            .shadow(color: .black.opacity(0.4), radius: 6, y: 2)
        }
        .position(pos)
    }

    /// 0° = up, clockwise (same convention as Android/extension).
    private func position(angleDeg: CGFloat, radius: CGFloat) -> CGPoint {
        let rad = angleDeg * .pi / 180
        let c = clampedCenter
        return CGPoint(x: c.x + sin(rad) * radius, y: c.y - cos(rad) * radius)
    }
}
