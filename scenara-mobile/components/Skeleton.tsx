/**
 * components/Skeleton.tsx — shimmer placeholder primitives.
 *
 * Why skeletons over a spinner:
 *   Spinners answer "is something happening?"; skeletons answer "what shape
 *   will it have?". That second answer lets the eye pre-load the layout so
 *   when real content lands there's no perceived jank. Backend-heavy screens
 *   (portfolio, leaderboard) feel noticeably faster even at identical latency.
 *
 * Implementation notes:
 *   - We animate `translateX` on a LinearGradient — a transform, so
 *     useNativeDriver works and we don't pay JS-thread cost.
 *   - The shimmer band is wider than the container (2x by default) so the
 *     highlight fully sweeps across; `overflow: "hidden"` on the wrapper
 *     clips it to the requested shape + borderRadius.
 *   - Each Skeleton starts its own Animated.loop. That's cheap — native
 *     transforms don't go through the JS bridge per-frame.
 *   - Reduces motion for accessibility: on RN, AccessibilityInfo's
 *     reduceMotion flag is respected by pausing the loop.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  ViewStyle,
  AccessibilityInfo,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { C } from "@/src/theme";

// ── Tokens ────────────────────────────────────────────────────────────────
// Base tone sits between BG and SURFACE so skeletons read as "placeholders"
// without drawing the eye. The highlight is a subtle purple-blue tinted white
// that echoes the brand gradient — keeps the loading state on-brand.
const SKELETON_BASE = "rgba(255,255,255,0.04)";
// Tuple typed for expo-linear-gradient, which requires at least [a, b] at the
// type level. A three-stop fade (transparent → tint → transparent) gives the
// classic "band sweeping through" look.
const SHIMMER_COLORS: readonly [string, string, string] = [
  "rgba(255,255,255,0)",
  "rgba(124,92,252,0.10)",
  "rgba(255,255,255,0)",
];

const DEFAULT_DURATION = 1300;

// ── Core primitive ────────────────────────────────────────────────────────
export type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
  /** Override the shimmer cycle duration in ms. */
  duration?: number;
};

export function Skeleton({
  width = "100%",
  height = 16,
  radius = 6,
  style,
  duration = DEFAULT_DURATION,
}: SkeletonProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const { width: screenW } = useWindowDimensions();

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((r) => {
      if (mounted) setReduceMotion(!!r);
    });
    const sub = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      (r) => setReduceMotion(!!r),
    );
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      progress.stopAnimation();
      progress.setValue(0.5);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, duration, progress]);

  // We don't know the actual rendered width of the wrapper (useWindowDimensions
  // is the best cheap proxy), so we translate across a band sized to the full
  // screen width — that's always enough to cover any skeleton.
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-screenW, screenW],
  });

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[
        { width, height, borderRadius: radius, backgroundColor: SKELETON_BASE, overflow: "hidden" },
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { transform: [{ translateX }] },
        ]}
      >
        <LinearGradient
          colors={SHIMMER_COLORS}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

// ── Convenience compositions ──────────────────────────────────────────────
// Each screen builds its own layout skeleton below by arranging Skeletons to
// mirror the real content's shape. Ideally the skeleton should closely match
// the layout of the real content so that when the real content lands the
// layout doesn't shift.

/** Single market card skeleton — matches the real MarketCard layout. */
export function MarketCardSkeleton() {
  return (
    <View
      style={{
        backgroundColor: C.CARD,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: C.BORDER,
        padding: 14,
        marginBottom: 10,
        gap: 10,
      }}
    >
      {/* Category pill + countdown */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Skeleton width={70} height={18} radius={9} />
        <Skeleton width={60} height={12} radius={6} />
      </View>

      {/* Title — two lines */}
      <Skeleton width="95%" height={16} radius={5} />
      <Skeleton width="70%" height={16} radius={5} />

      {/* Probability gauge row */}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
        <Skeleton width="48%" height={36} radius={10} />
        <Skeleton width="48%" height={36} radius={10} />
      </View>

      {/* Footer stats (volume / players) */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
        <Skeleton width={80} height={11} radius={5} />
        <Skeleton width={80} height={11} radius={5} />
      </View>
    </View>
  );
}

/** Grid of market card skeletons. Use as the markets-screen initial loader. */
export function MarketsGridSkeleton({
  count = 6,
  columns = 1,
}: {
  count?: number;
  columns?: number;
}) {
  const items = Array.from({ length: count });
  if (columns === 1) {
    return (
      <View style={{ padding: 12 }}>
        {items.map((_, i) => (
          <MarketCardSkeleton key={i} />
        ))}
      </View>
    );
  }
  // Two-column web grid — match the real flex-wrap layout.
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", padding: 20, gap: 12 }}>
      {items.map((_, i) => (
        <View key={i} style={{ width: `${100 / columns}%`, padding: 6 }}>
          <MarketCardSkeleton />
        </View>
      ))}
    </View>
  );
}

/** Portfolio screen skeleton — summary header + list of positions. */
export function PortfolioSkeleton() {
  return (
    <View style={{ padding: 16, gap: 14 }}>
      {/* Hero stats */}
      <View
        style={{
          backgroundColor: C.CARD,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: C.BORDER,
          padding: 18,
          gap: 12,
        }}
      >
        <Skeleton width={120} height={12} radius={5} />
        <Skeleton width={180} height={30} radius={6} />
        <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
          <Skeleton width="30%" height={38} radius={8} />
          <Skeleton width="30%" height={38} radius={8} />
          <Skeleton width="30%" height={38} radius={8} />
        </View>
      </View>
      {/* Positions list */}
      {Array.from({ length: 4 }).map((_, i) => (
        <View
          key={i}
          style={{
            backgroundColor: C.CARD,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: C.BORDER,
            padding: 12,
            gap: 8,
          }}
        >
          <Skeleton width="80%" height={14} radius={5} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Skeleton width={100} height={12} radius={5} />
            <Skeleton width={70} height={16} radius={5} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Leaderboard skeleton — ranked row list. */
export function LeaderboardSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <View style={{ padding: 16, gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: C.CARD,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: C.BORDER,
            padding: 12,
            gap: 12,
          }}
        >
          {/* Rank */}
          <Skeleton width={24} height={24} radius={12} />
          {/* Avatar */}
          <Skeleton width={36} height={36} radius={18} />
          {/* Name + grade — take the remaining space */}
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="60%" height={13} radius={5} />
            <Skeleton width="35%" height={10} radius={4} />
          </View>
          {/* PnL */}
          <Skeleton width={60} height={16} radius={5} />
        </View>
      ))}
    </View>
  );
}

/** Market detail skeleton — matches the layout of market-detail.tsx. */
export function MarketDetailSkeleton() {
  return (
    <View style={{ flex: 1, padding: 16, gap: 16 }}>
      {/* Category badge + status pill */}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Skeleton width={72} height={22} radius={11} />
        <Skeleton width={90} height={22} radius={11} />
      </View>

      {/* Title — two lines */}
      <View style={{ gap: 8 }}>
        <Skeleton width="100%" height={22} radius={6} />
        <Skeleton width="75%" height={22} radius={6} />
      </View>

      {/* Description — three lines */}
      <View style={{ gap: 6 }}>
        <Skeleton width="100%" height={13} radius={5} />
        <Skeleton width="95%" height={13} radius={5} />
        <Skeleton width="60%" height={13} radius={5} />
      </View>

      {/* Probability chart placeholder */}
      <Skeleton width="100%" height={120} radius={12} />

      {/* Scenario bet buttons */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Skeleton width="48%" height={56} radius={12} />
        <Skeleton width="48%" height={56} radius={12} />
      </View>

      {/* Amount input row */}
      <Skeleton width="100%" height={48} radius={12} />

      {/* Stats row */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Skeleton width="30%" height={48} radius={10} />
        <Skeleton width="30%" height={48} radius={10} />
        <Skeleton width="30%" height={48} radius={10} />
      </View>
    </View>
  );
}

/** User/trader profile skeleton — header + stats + recent bets. */
export function ProfileSkeleton() {
  return (
    <View style={{ padding: 16, gap: 14 }}>
      {/* Header */}
      <View style={{ alignItems: "center", gap: 10 }}>
        <Skeleton width={80} height={80} radius={40} />
        <Skeleton width={160} height={18} radius={6} />
        <Skeleton width={100} height={12} radius={5} />
      </View>
      {/* Stat tiles */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              backgroundColor: C.CARD,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: C.BORDER,
              padding: 14,
              gap: 6,
            }}
          >
            <Skeleton width="60%" height={10} radius={4} />
            <Skeleton width="80%" height={18} radius={6} />
          </View>
        ))}
      </View>
      {/* Recent activity */}
      {Array.from({ length: 3 }).map((_, i) => (
        <View
          key={i}
          style={{
            backgroundColor: C.CARD,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: C.BORDER,
            padding: 12,
            gap: 8,
          }}
        >
          <Skeleton width="75%" height={13} radius={5} />
          <Skeleton width="40%" height={11} radius={5} />
        </View>
      ))}
    </View>
  );
}
