import SwiftUI

/// Cross-view signals. `captureRequest` bumps on every `nodx://capture`
/// deep link (fired by the user's screenshot Shortcut — Back Tap or
/// AssistiveTouch double-tap) and makes CaptureView jump straight into the
/// marquee with the freshest screenshot.
final class AppRouter: ObservableObject {
    @Published var captureRequest = 0
}

@main
struct NodxApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .tint(Color(red: 0.961, green: 0.620, blue: 0.043)) // nodx amber #F59E0B
        }
    }
}

struct ContentView: View {
    @StateObject private var router = AppRouter()
    @State private var tab = 0

    var body: some View {
        TabView(selection: $tab) {
            CaptureView()
                .tabItem { Label("Run", systemImage: "viewfinder") }
                .tag(0)
            HistoryView()
                .tabItem { Label("History", systemImage: "clock.arrow.circlepath") }
                .tag(1)
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
                .tag(2)
        }
        .environmentObject(router)
        .onOpenURL { url in
            guard url.scheme == "nodx" else { return }
            tab = 0
            router.captureRequest += 1
        }
    }
}
