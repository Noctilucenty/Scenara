import React, { useState, useCallback } from "react";
import { View, Text, PanResponder, Dimensions, Platform } from "react-native";
import Svg, { Path, Circle, Line, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";

export const SCENARIO_COLORS = ["#22C55E", "#EF4444", "#7C5CFC", "#4F8EF7"];

const BG_CARD  = "#0D1117";
const TEXT_MID = "#64748B";
const PURPLE   = "#7C5CFC";
const PURPLE_D = "#4A3699";

export type HistoryPoint = {
  scenario_id: number; scenario_title: string;
  probability: number; recorded_at: string; source: string;
};

export type ScenarioHistory = {
  scenario_id: number; scenario_title: string;
  points: HistoryPoint[];
};

type TooltipData = {
  x: number;
  points: { title: string; prob: number; color: string }[];
  timeLabel: string;
};

type Props = {
  scenarios: ScenarioHistory[];
  height?: number;
  compact?: boolean;
  width?: number;
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ProbabilityChart({ scenarios, height = 120, compact = true, width: propWidth }: Props) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const screenWidth = Dimensions.get("window").width;
  const WIDTH = propWidth ?? screenWidth - (compact ? 72 : 48);
  const H = height;
  const PAD_LEFT   = compact ? 4 : 8;
  const PAD_RIGHT  = 8;
  const PAD_TOP    = 8;
  const PAD_BOTTOM = compact ? 4 : 20;
  const chartW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOTTOM;

  const allTimes = Array.from(
    new Set(scenarios.flatMap(s => s.points.map(p => p.recorded_at)))
  ).sort();

  const hasData = allTimes.length >= 2;
  const minTime = hasData ? new Date(allTimes[0]).getTime() : 0;
  const maxTime = hasData ? new Date(allTimes[allTimes.length - 1]).getTime() : 1;
  const timeRange = maxTime - minTime || 1;

  // Dynamic Y axis — zoom in to actual data range for dramatic curves
  const allProbs = scenarios.flatMap(s => s.points.map(p => p.probability));
  const dataMin = allProbs.length > 0 ? Math.min(...allProbs) : 0;
  const dataMax = allProbs.length > 0 ? Math.max(...allProbs) : 100;
  const dataRange = dataMax - dataMin || 1;
  // Add 10% padding above and below
  const yPad = dataRange * 0.15;
  const yMin = Math.max(0, dataMin - yPad);
  const yMax = Math.min(100, dataMax + yPad);
  const yRange = yMax - yMin || 1;

  function toX(d: string) { return PAD_LEFT + ((new Date(d).getTime() - minTime) / timeRange) * chartW; }
  function toY(p: number) { return PAD_TOP + chartH - ((p - yMin) / yRange) * chartH; }

  function buildPath(points: HistoryPoint[]) {
    const sorted = [...points].sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
    return sorted.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.recorded_at).toFixed(1)} ${toY(p.probability).toFixed(1)}`).join(" ");
  }

  function buildArea(points: HistoryPoint[], idx: number) {
    const sorted = [...points].sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
    const line = sorted.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.recorded_at).toFixed(1)} ${toY(p.probability).toFixed(1)}`).join(" ");
    const lastX = toX(sorted[sorted.length - 1].recorded_at).toFixed(1);
    const firstX = toX(sorted[0].recorded_at).toFixed(1);
    const bottom = (PAD_TOP + chartH).toFixed(1);
    return `${line} L ${lastX} ${bottom} L ${firstX} ${bottom} Z`;
  }

  const getTooltipForX = useCallback((touchX: number) => {
    if (!hasData) return;
    let closestTime = allTimes[0];
    let minDist = Infinity;
    for (const t of allTimes) {
      const dist = Math.abs(toX(t) - touchX);
      if (dist < minDist) { minDist = dist; closestTime = t; }
    }
    const pts = scenarios.map((s, i) => {
      const sorted = [...s.points].sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
      const match = sorted.reduce((prev, curr) =>
        new Date(curr.recorded_at).getTime() <= new Date(closestTime).getTime() ? curr : prev, sorted[0]);
      return { title: s.scenario_title, prob: match?.probability ?? 0, color: SCENARIO_COLORS[i % SCENARIO_COLORS.length] };
    });
    setTooltip({ x: toX(closestTime), points: pts, timeLabel: formatDate(closestTime) });
  }, [allTimes, scenarios, hasData]);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => getTooltipForX(e.nativeEvent.locationX),
    onPanResponderMove: (e) => getTooltipForX(e.nativeEvent.locationX),
    onPanResponderRelease: () => setTimeout(() => setTooltip(null), 1500),
    onPanResponderTerminate: () => setTooltip(null),
  });

  const handleMouseMove = Platform.OS === "web" ? (e: any) => { const r = e.currentTarget.getBoundingClientRect(); getTooltipForX(e.clientX - r.left); } : undefined;
  const handleMouseLeave = Platform.OS === "web" ? () => setTooltip(null) : undefined;

  if (!hasData) {
    return (
      <View style={{ height: H, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: TEXT_MID, fontSize: 11 }}>Awaiting chart data...</Text>
      </View>
    );
  }

  const tooltipWidth = 140;
  const tooltipLeft = tooltip ? Math.min(Math.max(tooltip.x - tooltipWidth / 2, PAD_LEFT), PAD_LEFT + chartW - tooltipWidth) : 0;

  return (
    <View style={{ position: "relative" }}>
      <View
        {...(Platform.OS !== "web" ? panResponder.panHandlers : {})}
        // @ts-ignore
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: Platform.OS === "web" ? "crosshair" : undefined } as any}
      >
        <Svg width={WIDTH} height={H}>
          <Defs>
            {scenarios.map((_, i) => (
              <SvgGradient key={i} id={`fill${i}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={SCENARIO_COLORS[i % SCENARIO_COLORS.length]} stopOpacity="0.15" />
                <Stop offset="1" stopColor={SCENARIO_COLORS[i % SCENARIO_COLORS.length]} stopOpacity="0.01" />
              </SvgGradient>
            ))}
            {/* Purple crosshair gradient */}
            <SvgGradient id="xhair" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={PURPLE} stopOpacity="0.8" />
              <Stop offset="1" stopColor={PURPLE} stopOpacity="0.1" />
            </SvgGradient>
          </Defs>

          {[25, 50, 75].map(v => (
            <Line key={v} x1={PAD_LEFT} y1={toY(v)} x2={PAD_LEFT + chartW} y2={toY(v)} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          ))}

          {scenarios.map((s, i) => <Path key={`a${i}`} d={buildArea(s.points, i)} fill={`url(#fill${i})`} />)}

          {scenarios.map((s, i) => (
            <Path key={`l${i}`} d={buildPath(s.points)} stroke={SCENARIO_COLORS[i % SCENARIO_COLORS.length]} strokeWidth={compact ? 1.5 : 2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}

          {tooltip && (
            <>
              <Line x1={tooltip.x} y1={PAD_TOP} x2={tooltip.x} y2={PAD_TOP + chartH} stroke="url(#xhair)" strokeWidth="1" strokeDasharray="3,3" />
              {tooltip.points.map((pt, i) => (
                <Circle key={i} cx={tooltip.x} cy={toY(pt.prob)} r={compact ? 3.5 : 5} fill={pt.color} stroke="#08090C" strokeWidth={compact ? 1.5 : 2} />
              ))}
            </>
          )}
        </Svg>
      </View>

      {tooltip && (
        <View pointerEvents="none" style={{
          position: "absolute", left: tooltipLeft, top: PAD_TOP,
          backgroundColor: "#0A0B10", borderRadius: 10, padding: 10,
          borderWidth: 1, borderColor: "rgba(124,92,252,0.3)",
          minWidth: tooltipWidth, zIndex: 99,
        }}>
          <Text style={{ color: "#4A3699", fontSize: 9, fontFamily: "DMSans_700Bold", letterSpacing: 0.8, marginBottom: 7 }}>{tooltip.timeLabel}</Text>
          {tooltip.points.map((pt, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: i < tooltip.points.length - 1 ? 5 : 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: pt.color }} />
                <Text style={{ color: "#94A3B8", fontSize: 10, maxWidth: 80 }} numberOfLines={1}>{pt.title.split("—")[0].trim()}</Text>
              </View>
              <Text style={{ color: "white", fontFamily: "DMSans_700Bold", fontSize: 12, marginLeft: 8 }}>{pt.prob.toFixed(1)}%</Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ flexDirection: "row", gap: 12, marginTop: 6, paddingHorizontal: 4 }}>
        {scenarios.map((s, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 20, height: 2.5, borderRadius: 2, backgroundColor: SCENARIO_COLORS[i % SCENARIO_COLORS.length] }} />
            <Text style={{ color: TEXT_MID, fontSize: 10 }} numberOfLines={1}>{s.scenario_title.split("—")[0].trim()}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}