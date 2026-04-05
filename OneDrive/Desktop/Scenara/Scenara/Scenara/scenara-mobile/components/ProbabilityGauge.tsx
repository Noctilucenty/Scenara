import React from "react";
import { View, Text } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

const GOLD = "#C5A052";
const GOLD_DIM = "#3D2E10";

type Props = {
  probability: number; // 0-100
  size?: number;
  label?: string;
};

export function ProbabilityGauge({ probability, size = 52, label }: Props) {
  const prob = Math.max(0, Math.min(100, probability));
  const radius = (size - 6) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  // Arc goes from 135° to 405° (270° sweep = 3/4 circle)
  const sweepAngle = 270;
  const startAngle = 135;
  const filled = (prob / 100) * sweepAngle;

  function polarToCartesian(angle: number): { x: number; y: number } {
    const rad = ((angle - 90) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  }

  function describeArc(startDeg: number, endDeg: number): string {
    const start = polarToCartesian(startDeg);
    const end = polarToCartesian(endDeg);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  }

  // Color based on probability
  function getColor(p: number): string {
    if (p >= 70) return "#22C55E"; // green
    if (p >= 40) return GOLD;      // gold
    return "#EF4444";              // red
  }

  const color = getColor(prob);
  const endAngle = startAngle + filled;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        {/* Background arc */}
        <Path
          d={describeArc(startAngle, startAngle + sweepAngle)}
          stroke={GOLD_DIM}
          strokeWidth={4}
          strokeLinecap="round"
          fill="none"
          opacity={0.3}
        />
        {/* Filled arc */}
        {prob > 1 && (
          <Path
            d={describeArc(startAngle, Math.min(endAngle, startAngle + sweepAngle - 0.1))}
            stroke={color}
            strokeWidth={4}
            strokeLinecap="round"
            fill="none"
          />
        )}
      </Svg>

      {/* Center text */}
      <View style={{ position: "absolute", alignItems: "center" }}>
        <Text style={{ color: color, fontSize: size < 48 ? 10 : 12, fontWeight: "800", lineHeight: 14 }}>
          {prob.toFixed(0)}%
        </Text>
        {label && (
          <Text style={{ color: "#3D4150", fontSize: 7, fontWeight: "700", letterSpacing: 0.3, marginTop: 1 }}>
            {label}
          </Text>
        )}
      </View>
    </View>
  );
}