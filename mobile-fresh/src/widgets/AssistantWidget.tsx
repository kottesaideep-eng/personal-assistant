import React from "react";
import {
  FlexWidget,
  TextWidget,
  ImageWidget,
} from "react-native-android-widget";

interface Props {
  lastMessage?: string;
}

export function AssistantWidget({ lastMessage }: Props) {
  return (
    <FlexWidget
      style={{
        height: "match_parent",
        width: "match_parent",
        flexDirection: "column",
        backgroundColor: "#0f172a",
        borderRadius: 16,
        padding: 16,
        justifyContent: "space-between",
      }}
      clickAction="OPEN_APP"
    >
      <FlexWidget style={{ flexDirection: "row", alignItems: "center" }}>
        <TextWidget
          text="🤖  Roar"
          style={{ color: "#f1f5f9", fontSize: 14, fontWeight: "bold" }}
        />
      </FlexWidget>

      <TextWidget
        text={lastMessage || "Tap to open and start chatting…"}
        style={{
          color: "#94a3b8",
          fontSize: 12,
          marginTop: 8,
        }}
        maxLines={4}
      />

      <TextWidget
        text="Open app →"
        style={{ color: "#60a5fa", fontSize: 12, fontWeight: "bold", marginTop: 8 }}
      />
    </FlexWidget>
  );
}
