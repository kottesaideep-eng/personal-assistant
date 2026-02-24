import { Platform } from "react-native";
import { requireNativeModule } from "expo-modules-core";

interface SharedDefaultsNative {
  setString(key: string, value: string): void;
  getString(key: string): string | null;
}

// On Android or when native module isn't available, fall back silently
let native: SharedDefaultsNative | null = null;
if (Platform.OS === "ios") {
  try {
    native = requireNativeModule("SharedDefaults");
  } catch {
    // Native module not available (e.g. Expo Go) — widget updates won't work
  }
}

const APP_GROUP_ID = "group.com.saideep.personalassistant";
const LAST_MESSAGE_KEY = "widget_last_message";

/** Write the latest assistant reply to the App Group so the iOS widget can read it. */
export function updateWidgetLastMessage(message: string): void {
  native?.setString(LAST_MESSAGE_KEY, message);
}
