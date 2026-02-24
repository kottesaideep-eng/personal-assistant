import WidgetKit
import SwiftUI

// MARK: - Shared data key (written by React Native via App Group UserDefaults)
private let appGroupID = "group.com.saideep.personalassistant"
private let lastMessageKey = "widget_last_message"

// MARK: - Timeline Entry

struct AssistantEntry: TimelineEntry {
    let date: Date
    let lastMessage: String
}

// MARK: - Timeline Provider

struct AssistantProvider: TimelineProvider {
    func placeholder(in context: Context) -> AssistantEntry {
        AssistantEntry(date: Date(), lastMessage: "How can I help you today?")
    }

    func getSnapshot(in context: Context, completion: @escaping (AssistantEntry) -> Void) {
        completion(makeEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<AssistantEntry>) -> Void) {
        // Refresh every 15 minutes so the widget picks up new messages
        let entry = makeEntry()
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date()
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    private func makeEntry() -> AssistantEntry {
        let defaults = UserDefaults(suiteName: appGroupID)
        let msg = defaults?.string(forKey: lastMessageKey) ?? "Tap to start chatting…"
        return AssistantEntry(date: Date(), lastMessage: msg)
    }
}

// MARK: - Widget Views

struct AssistantWidgetSmallView: View {
    let entry: AssistantEntry

    var body: some View {
        ZStack {
            background
            VStack(alignment: .leading, spacing: 0) {
                // Header
                HStack(spacing: 6) {
                    Text("🤖")
                        .font(.system(size: 18))
                    Text("SARVIS")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(Color(hex: "#f1f5f9"))
                    Spacer()
                }

                Spacer()

                // Last message preview
                Text(entry.lastMessage)
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: "#94a3b8"))
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)

                Spacer(minLength: 6)

                // CTA
                HStack {
                    Spacer()
                    Text("Open →")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Color(hex: "#60a5fa"))
                }
            }
            .padding(14)
        }
    }
}

struct AssistantWidgetMediumView: View {
    let entry: AssistantEntry

    var body: some View {
        ZStack {
            background
            HStack(spacing: 14) {
                // Left column: branding
                VStack(alignment: .leading, spacing: 6) {
                    Text("🤖")
                        .font(.system(size: 28))
                    Text("SARVIS")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(Color(hex: "#f1f5f9"))
                        .lineLimit(2)
                    Spacer()
                    Text("Open →")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color(hex: "#60a5fa"))
                }
                .frame(maxWidth: 100)

                // Divider
                Rectangle()
                    .fill(Color(hex: "#1e293b"))
                    .frame(width: 1)

                // Right column: last message
                VStack(alignment: .leading, spacing: 6) {
                    Text("Last reply")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(Color(hex: "#475569"))
                        .textCase(.uppercase)
                    Text(entry.lastMessage)
                        .font(.system(size: 13))
                        .foregroundColor(Color(hex: "#94a3b8"))
                        .lineLimit(4)
                    Spacer()
                }
            }
            .padding(14)
        }
    }
}

private var background: some View {
    LinearGradient(
        colors: [Color(hex: "#0a0f1e"), Color(hex: "#0f172a")],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

// MARK: - Widget Entry View (dispatcher)

struct AssistantWidgetEntryView: View {
    var entry: AssistantEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .systemSmall:
            AssistantWidgetSmallView(entry: entry)
        case .systemMedium:
            AssistantWidgetMediumView(entry: entry)
        default:
            AssistantWidgetSmallView(entry: entry)
        }
    }
}

// MARK: - Widget Configuration

@main
struct AssistantWidgetBundle: WidgetBundle {
    var body: some Widget {
        AssistantWidget()
    }
}

struct AssistantWidget: Widget {
    let kind: String = "AssistantWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: AssistantProvider()) { entry in
            if #available(iOS 17.0, *) {
                AssistantWidgetEntryView(entry: entry)
                    .containerBackground(Color(hex: "#0a0f1e"), for: .widget)
            } else {
                AssistantWidgetEntryView(entry: entry)
            }
        }
        .configurationDisplayName("SARVIS")
        .description("Quick access to SARVIS — your personal AI assistant.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Color helper

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r, g, b: UInt64
        switch hex.count {
        case 6:
            (r, g, b) = ((int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF)
        default:
            (r, g, b) = (0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: 1
        )
    }
}
