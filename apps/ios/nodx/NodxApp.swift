import SwiftUI

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
    var body: some View {
        TabView {
            CaptureView()
                .tabItem { Label("Run", systemImage: "viewfinder") }
            HistoryView()
                .tabItem { Label("History", systemImage: "clock.arrow.circlepath") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
    }
}
