import React, { useState, useRef, useEffect } from "react";
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
  color?: string;
}

interface Props {
  items: MenuItem[];
  onLongPress?: () => void;
}

// Quarter-circle arc from straight-up to straight-right (radius 82)
const ARC_POSITIONS = [
  { x: 0,  y: -82 },   // 12 o'clock
  { x: 40, y: -71 },   // ~1 o'clock
  { x: 71, y: -40 },   // ~2 o'clock
  { x: 82, y: 0  },    // 3 o'clock (horizontal right)
];

export default function FloatingMenu({ items, onLongPress }: Props) {
  const [open, setOpen] = useState(false);
  const rotation  = useRef(new Animated.Value(0)).current;
  const overlayOp = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim  = useRef(new Animated.Value(0)).current;
  const itemAnims = useRef(items.map(() => new Animated.Value(0))).current;
  const pressAnims = useRef(items.map(() => new Animated.Value(1))).current;

  // Idle pulse glow when closed
  useEffect(() => {
    if (open) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 1600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 1600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [open]);

  const toggle = () => {
    const toValue = open ? 0 : 1;
    Animated.parallel([
      Animated.spring(rotation,  { toValue, useNativeDriver: true, tension: 130, friction: 8 }),
      Animated.timing(overlayOp, { toValue, duration: 220, useNativeDriver: true }),
      Animated.timing(glowAnim,  { toValue, duration: 200, useNativeDriver: false }),
      ...itemAnims.map((anim, i) =>
        Animated.spring(anim, {
          toValue,
          useNativeDriver: true,
          tension: 130,
          friction: 7,
          delay: open ? 0 : i * 55,
        })
      ),
    ]).start();
    setOpen((prev) => !prev);
  };

  const handleItemPress = (item: MenuItem, index: number) => {
    // Bounce the item before closing
    Animated.sequence([
      Animated.timing(pressAnims[index], { toValue: 0.82, duration: 80, useNativeDriver: true }),
      Animated.spring(pressAnims[index], { toValue: 1, tension: 200, friction: 6, useNativeDriver: true }),
    ]).start();
    toggle();
    setTimeout(() => item.onPress(), 180);
  };

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "45deg"],
  });

  const fabShadowRadius = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 20],
  });
  const fabShadowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.7],
  });

  return (
    <>
      {/* Dimming overlay */}
      {open && (
        <Animated.View
          style={[styles.overlay, { opacity: overlayOp }]}
          pointerEvents="auto"
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={toggle} />
        </Animated.View>
      )}

      {/* Action items */}
      {items.map((item, i) => {
        const pos = ARC_POSITIONS[i] ?? { x: 0, y: -82 * (i + 1) };
        const color = item.color ?? "#6366f1";

        const translateX = itemAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0, pos.x] });
        const translateY = itemAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0, pos.y] });
        const scale      = itemAnims[i].interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.2, 1.08, 1] });
        const opacity    = itemAnims[i].interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.8, 1] });
        const labelSlide = itemAnims[i].interpolate({ inputRange: [0, 1], outputRange: [-10, 0] });

        return (
          <Animated.View
            key={item.label}
            style={[
              styles.itemContainer,
              {
                transform: [{ translateX }, { translateY }, { scale: Animated.multiply(scale, pressAnims[i]) }],
                opacity,
              },
            ]}
            pointerEvents={open ? "auto" : "none"}
          >
            {/* Button */}
            <TouchableOpacity
              style={[
                styles.itemBtn,
                {
                  backgroundColor: color + "1a",
                  borderColor: color + "70",
                  shadowColor: color,
                },
              ]}
              onPress={() => handleItemPress(item, i)}
              activeOpacity={0.8}
            >
              <Text style={styles.itemIcon}>{item.icon}</Text>
              {!!item.badge && item.badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge > 99 ? "99+" : item.badge}</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Label — appears to the right */}
            <Animated.View
              style={[
                styles.label,
                { borderColor: color + "30", transform: [{ translateX: labelSlide }] },
              ]}
            >
              <Text style={styles.labelText}>{item.label}</Text>
            </Animated.View>
          </Animated.View>
        );
      })}

      {/* Main FAB */}
      <Animated.View
        style={[
          styles.fabShadowWrap,
          {
            shadowRadius: fabShadowRadius,
            shadowOpacity: fabShadowOpacity,
            transform: [{ scale: open ? 1 : pulseAnim }],
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.fab, open && styles.fabOpen]}
          onPress={toggle}
          onLongPress={onLongPress}
          activeOpacity={0.85}
        >
          <Animated.Text style={[styles.fabIcon, { transform: [{ rotate }] }]}>
            +
          </Animated.Text>
        </TouchableOpacity>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 10,
  },

  // Items are positioned relative to the FAB (bottom-left)
  itemContainer: {
    position: "absolute",
    bottom: 28,
    left: 20,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 20,
  },
  itemBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 10,
    shadowOpacity: 0.4,
    elevation: 5,
  },
  itemIcon: { fontSize: 22 },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: "#ef4444",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },

  label: {
    marginLeft: 10,
    backgroundColor: "#0d1628",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  labelText: { color: "#e2e8f0", fontSize: 12, fontWeight: "600" },

  fabShadowWrap: {
    position: "absolute",
    bottom: 28,
    left: 20,
    zIndex: 20,
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 4 },
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#6366f1",
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
  },
  fabOpen: {
    backgroundColor: "#4f46e5",
  },
  fabIcon: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "300",
    lineHeight: 32,
    marginTop: Platform.OS === "ios" ? -1 : 0,
  },
});
