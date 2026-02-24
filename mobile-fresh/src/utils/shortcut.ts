import { Platform } from "react-native";

export const SARVIS_ACTIVITY_TYPE = "com.saideep.personalassistant.voice";
export const SARVIS_PHRASE = "SARVIS";

const shortcutOptions = {
  activityType: SARVIS_ACTIVITY_TYPE,
  title: "Chat with SARVIS",
  suggestedInvocationPhrase: SARVIS_PHRASE,
  isEligibleForSearch: true,
  isEligibleForPrediction: true,
  userInfo: { action: "voice" },
};

/** Donate the SARVIS shortcut to Siri so it learns the user's phrase. */
export function donateSarvisShortcut(): void {
  if (Platform.OS !== "ios") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { donateShortcut } = require("react-native-siri-shortcut");
    donateShortcut(shortcutOptions);
  } catch {
    // Not available in Expo Go — requires EAS build
  }
}

/** Add to Siri dialog — lets user customise the invocation phrase. */
export function presentAddToSiriDialog(
  onResult: (status: "added" | "updated" | "deleted" | "cancelled") => void
): void {
  if (Platform.OS !== "ios") return;
  try {
    const { presentShortcut } = require("react-native-siri-shortcut");
    presentShortcut(shortcutOptions, (data: { status: "added" | "updated" | "deleted" | "cancelled" }) => {
      onResult(data.status);
    });
  } catch {
    // Not available
  }
}

/** Register a listener for when Siri opens the app via the SARVIS shortcut. */
export function addSarvisShortcutListener(onInvoked: () => void): () => void {
  if (Platform.OS !== "ios") return () => {};
  try {
    const { addShortcutListener, getInitialShortcut } = require("react-native-siri-shortcut");

    // Handle cold-start via Siri
    getInitialShortcut().then((shortcut: { activityType: string } | null) => {
      if (shortcut?.activityType === SARVIS_ACTIVITY_TYPE) {
        onInvoked();
      }
    });

    // Handle warm-start via Siri
    const sub = addShortcutListener((shortcut: { activityType: string }) => {
      if (shortcut.activityType === SARVIS_ACTIVITY_TYPE) {
        onInvoked();
      }
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
