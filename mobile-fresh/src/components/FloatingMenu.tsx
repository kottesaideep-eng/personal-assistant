import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";

interface MenuItem {
  icon: string;
  label: string;
  onPress: () => void;
  badge?: number;
}

interface Props {
  items: MenuItem[];
  onLongPress?: () => void;
}

export default function FloatingMenu({ items, onLongPress }: Props) {
  const [open, setOpen] = useState(false);
  const rotation = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const itemAnims = useRef(items.map(() => new Animated.Value(0))).current;

  const toggle = () => {
    const toValue = open ? 0 : 1;
    Animated.parallel([
      Animated.spring(rotation, { toValue, useNativeDriver: true, tension: 120, friction: 8 }),
      Animated.timing(overlayOpacity, { toValue, duration: 200, useNativeDriver: true }),
      ...itemAnims.map((anim, i) =>
        Animated.spring(anim, {
          toValue,
          useNativeDriver: true,
          tension: 100,
          friction: 7,
          delay: open ? 0 : i * 45,
        })
      ),
    ]).start();
    setOpen(!open);
  };

  const handleItemPress = (item: MenuItem) => {
    toggle();
    setTimeout(() => item.onPress(), 150);
  };

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] });

  // Fan positions — arc above the FAB
  const positions = [
    { x: 0, y: -70 },
    { x: -65, y: -45 },
    { x: -80, y: 20 },
    { x: -45, y: 75 },
  ];

  return (
    <>
      {/* Tap-away overlay */}
      {open && (
        <Animated.View
          style={[styles.overlay, { opacity: overlayOpacity }]}
          pointerEvents={open ? "auto" : "none"}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={toggle} />
        </Animated.View>
      )}

      {/* Action items */}
      {items.map((item, i) => {
        const pos = positions[i] ?? { x: 0, y: -70 * (i + 1) };
        const translateX = itemAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0, pos.x] });
        const translateY = itemAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0, pos.y] });
        const scale = itemAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
        const opacity = itemAnims[i];

        return (
          <Animated.View
            key={item.label}
            style={[
              styles.itemContainer,
              { transform: [{ translateX }, { translateY }, { scale }], opacity },
            ]}
            pointerEvents={open ? "auto" : "none"}
          >
            {/* Label */}
            <View style={styles.labelBubble}>
              <Text style={styles.labelText}>{item.label}</Text>
            </View>

            {/* Button */}
            <TouchableOpacity style={styles.itemBtn} onPress={() => handleItemPress(item)} activeOpacity={0.85}>
              <Text style={styles.itemIcon}>{item.icon}</Text>
              {!!item.badge && item.badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge > 99 ? "99+" : item.badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>
        );
      })}

      {/* Main FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={toggle}
        onLongPress={onLongPress}
        activeOpacity={0.85}
      >
        <Animated.Text style={[styles.fabIcon, { transform: [{ rotate }] }]}>
          +
        </Animated.Text>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    zIndex: 10,
  },
  fab: {
    position: "absolute",
    bottom: 28,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#6366f1",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
    shadowColor: "#6366f1",
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabIcon: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "300",
    lineHeight: 32,
    marginTop: Platform.OS === "ios" ? -1 : 0,
  },
  itemContainer: {
    position: "absolute",
    bottom: 28,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 20,
  },
  labelBubble: {
    backgroundColor: "#1e293b",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  labelText: { color: "#f1f5f9", fontSize: 12, fontWeight: "600" },
  itemBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#475569",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  itemIcon: { fontSize: 22 },
  badge: {
    position: "absolute",
    top: -3,
    right: -3,
    backgroundColor: "#ef4444",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
});
