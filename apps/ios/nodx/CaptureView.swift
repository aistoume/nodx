import SwiftUI
import Photos
import PhotosUI

/// The "Run" tab. iOS has no floating bubble / MediaProjection, so the flow
/// is: take a system screenshot anywhere → open nodx → the latest screenshot
/// is one tap away → box a region → action wheel.
struct CaptureView: View {
    @EnvironmentObject private var router: AppRouter
    @State private var authStatus: PHAuthorizationStatus = .notDetermined
    @State private var screenshots: [PHAsset] = []
    @State private var thumbs: [String: UIImage] = [:]
    @State private var stageImage: UIImage?
    @State private var pickerItem: PhotosPickerItem?
    @State private var loadingAsset = false

    private let thumbSize = CGSize(width: 240, height: 520)

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header()
                    latestButton()
                    screenshotStrip()
                    howTo()
                }
                .padding(20)
            }
            .navigationTitle("nodx")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    PhotosPicker(selection: $pickerItem, matching: .images) {
                        Label("Pick image", systemImage: "photo.on.rectangle")
                    }
                }
            }
        }
        .task { await requestAndLoad() }
        .onChange(of: router.captureRequest) { _, _ in
            // nodx://capture (screenshot Shortcut): open the freshest
            // screenshot straight into the marquee, no taps.
            Task { await openFreshestScreenshot() }
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    stageImage = image
                }
                pickerItem = nil
            }
        }
        .fullScreenCover(item: stageBinding) { staged in
            MarqueeView(image: staged.image) { stageImage = nil }
        }
    }

    // MARK: pieces

    private func header() -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("See it. Ask it. Act on it.")
                .font(.title2.weight(.bold))
            Text("Box any part of a screenshot, then explain, search, shop, or generate from it.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func latestButton() -> some View {
        Button {
            if let first = screenshots.first { open(asset: first) }
        } label: {
            HStack {
                Image(systemName: "camera.viewfinder").font(.title3)
                VStack(alignment: .leading, spacing: 2) {
                    Text(screenshots.isEmpty ? "No screenshots yet" : "Open latest screenshot")
                        .font(.headline)
                    Text(screenshots.isEmpty
                         ? "Take one (Side + Volume Up), then come back"
                         : relativeDate(screenshots.first?.creationDate))
                        .font(.caption)
                        .opacity(0.8)
                }
                Spacer()
                if loadingAsset { ProgressView() } else { Image(systemName: "chevron.right") }
            }
            .padding(16)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 14).fill(Color.accentColor.opacity(screenshots.isEmpty ? 0.25 : 1)))
            .foregroundStyle(screenshots.isEmpty ? Color.primary : Color.white)
        }
        .disabled(screenshots.isEmpty || loadingAsset)
    }

    @ViewBuilder
    private func screenshotStrip() -> some View {
        if authStatus == .denied || authStatus == .restricted {
            VStack(alignment: .leading, spacing: 8) {
                Text("Photo access is off").font(.headline)
                Text("nodx reads your screenshots to act on them. Enable photo access in Settings, or use the picker (top right).")
                    .font(.subheadline).foregroundStyle(.secondary)
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 14).fill(.quaternary.opacity(0.5)))
        } else if !screenshots.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("Recent screenshots").font(.headline)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(screenshots, id: \.localIdentifier) { asset in
                            Button { open(asset: asset) } label: {
                                thumbView(for: asset)
                            }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func thumbView(for asset: PHAsset) -> some View {
        if let img = thumbs[asset.localIdentifier] {
            Image(uiImage: img)
                .resizable()
                .scaledToFill()
                .frame(width: 96, height: 200)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(.quaternary, lineWidth: 1))
        } else {
            RoundedRectangle(cornerRadius: 10)
                .fill(.quaternary.opacity(0.4))
                .frame(width: 96, height: 200)
                .overlay(ProgressView())
        }
    }

    private func howTo() -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("How it works").font(.headline)
            ForEach(Array(steps.enumerated()), id: \.offset) { i, step in
                HStack(alignment: .top, spacing: 10) {
                    Text("\(i + 1)")
                        .font(.caption.weight(.bold))
                        .frame(width: 22, height: 22)
                        .background(Circle().fill(Color.accentColor.opacity(0.18)))
                    Text(step).font(.subheadline)
                }
            }
        }
        .padding(.top, 4)
    }

    private var steps: [String] {
        [
            "Take a screenshot anywhere (Side + Volume Up).",
            "Open nodx — your latest screenshot is one tap away.",
            "Drag to box the part you care about.",
            "Pick a spoke: \u{1F4D6} explain · \u{1F50E} search · \u{1F6D2} shop · \u{1F4A1} save · \u{1F3A8} generate.",
        ]
    }

    // MARK: data

    private struct StagedImage: Identifiable {
        let id = UUID()
        let image: UIImage
    }

    private var stageBinding: Binding<StagedImage?> {
        Binding(
            get: { stageImage.map { StagedImage(image: $0) } },
            set: { if $0 == nil { stageImage = nil } })
    }

    /// Deep-link entry: the Shortcut saves a screenshot moments before the
    /// app opens, so Photos may lag one beat — refetch, and retry once if
    /// the newest screenshot doesn't look fresh yet.
    private func openFreshestScreenshot() async {
        stageImage = nil
        await requestAndLoad()
        if let first = screenshots.first, let created = first.creationDate,
           Date().timeIntervalSince(created) < 30 {
            open(asset: first)
            return
        }
        try? await Task.sleep(nanoseconds: 900_000_000)
        await requestAndLoad()
        if let first = screenshots.first { open(asset: first) }
    }

    private func requestAndLoad() async {
        let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        await MainActor.run { authStatus = status }
        guard status == .authorized || status == .limited else { return }
        let options = PHFetchOptions()
        options.predicate = NSPredicate(format: "(mediaSubtypes & %d) != 0",
                                        PHAssetMediaSubtype.photoScreenshot.rawValue)
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        options.fetchLimit = 30
        let result = PHAsset.fetchAssets(with: .image, options: options)
        var assets: [PHAsset] = []
        result.enumerateObjects { asset, _, _ in assets.append(asset) }
        let list = assets
        await MainActor.run { screenshots = list }
        loadThumbs(for: list)
    }

    private func loadThumbs(for assets: [PHAsset]) {
        let manager = PHImageManager.default()
        let options = PHImageRequestOptions()
        options.deliveryMode = .opportunistic
        options.isNetworkAccessAllowed = true
        for asset in assets {
            manager.requestImage(for: asset, targetSize: thumbSize, contentMode: .aspectFill, options: options) { image, _ in
                guard let image else { return }
                DispatchQueue.main.async { thumbs[asset.localIdentifier] = image }
            }
        }
    }

    private func open(asset: PHAsset) {
        loadingAsset = true
        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.isNetworkAccessAllowed = true
        PHImageManager.default().requestImage(
            for: asset,
            targetSize: PHImageManagerMaximumSize,
            contentMode: .aspectFit,
            options: options) { image, _ in
            DispatchQueue.main.async {
                loadingAsset = false
                if let image { stageImage = image }
            }
        }
    }

    private func relativeDate(_ date: Date?) -> String {
        guard let date else { return "" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
