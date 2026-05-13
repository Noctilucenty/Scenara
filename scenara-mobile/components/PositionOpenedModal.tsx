/**
 * components/PositionOpenedModal.tsx
 *
 * Centered modal shown right after a user places a successful prediction.
 * Auto-dismisses after `autoDismissMs`, or tap anywhere outside to close.
 *
 * Used by:
 *   - BetPanel  (markets tab inline bet panel)
 *   - SidebarTradePanel (sidebar trade panel)
 *   - market-detail.tsx (full market detail screen)
 *
 * Animation: spring scale-in from 0 → 1 when `visible` flips true.  The
 * Modal itself fades the backdrop in/out via `animationType="fade"`.
 */
import React, { useEffect, useRef } from "react";
import { Modal, TouchableOpacity, View, Text, Animated, Platform } from "react-native";

const CARD     = "#0D1117";
const TEXT     = "#F1F5F9";
const TEXT_SUB = "#94A3B8";
const TEXT_MID = "#64748B";
const GREEN    = "#22C55E";

const LABELS = {
  en: { title: "Position opened",        subtitle: "Bet placed successfully" },
  pt: { title: "Posição aberta",         subtitle: "Aposta feita com sucesso" },
  zh: { title: "已下单",                  subtitle: "投注成功" },
} as const;

type Props = {
  visible: boolean;
  /** Display amount like "$100" or "R$ 100".  Caller formats. */
  amount: string;
  /** Short scenario label, e.g. "Yes" / "No" / "Trump wins". */
  scenarioLabel?: string;
  /** Optional market title preview shown below the amount. */
  marketTitle?: string;
  language?: "en" | "pt" | "zh" | string;
  /** Dismiss after N ms.  Pass 0 to require manual tap.  Default 2500. */
  autoDismissMs?: number;
  onDismiss(): void;
};

export function PositionOpenedModal({
  visible,
  amount,
  scenarioLabel,
  marketTitle,
  language = "en",
  autoDismissMs = 2500,
  onDismiss,
}: Props) {
  const scale   = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  // Spring-in when the modal becomes visible.  Reset to 0 on hide so the
  // next show plays the entrance animation again.
  useEffect(() => {
    if (visible) {
      scale.setValue(0.7);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale,   { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
      if (autoDismissMs > 0) {
        const id = setTimeout(onDismiss, autoDismissMs);
        return () => clearTimeout(id);
      }
    }
  }, [visible, autoDismissMs, onDismiss, scale, opacity]);

  const t = (LABELS as any)[language] ?? LABELS.en;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={onDismiss}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.65)",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
        }}
      >
        <Animated.View
          style={{
            backgroundColor: CARD,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: "rgba(34,197,94,0.3)",
            paddingVertical: 28,
            paddingHorizontal: 32,
            alignItems: "center",
            minWidth: 280,
            maxWidth: 360,
            transform: [{ scale }],
            opacity,
            // Native shadow + web fallback via boxShadow
            shadowColor: GREEN,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.35,
            shadowRadius: 20,
            elevation: 12,
            ...(Platform.OS === "web" ? { boxShadow: "0 8px 32px rgba(34,197,94,0.25)" as any } : {}),
          }}
        >
          {/* Green checkmark circle */}
          <View
            style={{
              width: 68,
              height: 68,
              borderRadius: 34,
              backgroundColor: "rgba(34,197,94,0.15)",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 18,
              borderWidth: 1.5,
              borderColor: "rgba(34,197,94,0.35)",
            }}
          >
            <Text style={{ fontSize: 36, color: GREEN, fontFamily: "DMSans_700Bold" }}>✓</Text>
          </View>

          {/* Title */}
          <Text
            style={{
              color: TEXT,
              fontSize: 20,
              fontFamily: "DMSans_700Bold",
              marginBottom: 6,
              textAlign: "center",
            }}
          >
            {t.title}
          </Text>

          {/* Subtitle */}
          <Text
            style={{
              color: TEXT_SUB,
              fontSize: 13,
              fontFamily: "DMSans_400Regular",
              marginBottom: 16,
              textAlign: "center",
            }}
          >
            {t.subtitle}
          </Text>

          {/* Amount pill */}
          <View
            style={{
              backgroundColor: "rgba(34,197,94,0.08)",
              borderRadius: 12,
              paddingHorizontal: 18,
              paddingVertical: 8,
              marginBottom: scenarioLabel || marketTitle ? 14 : 0,
            }}
          >
            <Text style={{ color: GREEN, fontSize: 18, fontFamily: "DMSans_700Bold" }}>
              {amount}
              {scenarioLabel ? (
                <Text style={{ color: TEXT_SUB, fontSize: 14, fontFamily: "DMSans_400Regular" }}>
                  {"  on  "}
                  <Text style={{ color: TEXT, fontFamily: "DMSans_700Bold" }}>{scenarioLabel}</Text>
                </Text>
              ) : null}
            </Text>
          </View>

          {/* Market title preview */}
          {marketTitle ? (
            <Text
              style={{
                color: TEXT_MID,
                fontSize: 11,
                textAlign: "center",
                fontFamily: "DMSans_400Regular",
                lineHeight: 15,
                maxWidth: 280,
              }}
              numberOfLines={2}
            >
              {marketTitle}
            </Text>
          ) : null}
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}
