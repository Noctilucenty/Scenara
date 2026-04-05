import React from "react";
import { View, Text } from "react-native";

export function StatusCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <View style={{ backgroundColor: "rgba(255,255,255,0.08)", padding: 12, borderRadius: 12, marginBottom: 12 }}>
      <Text style={{ color: "white", fontWeight: "700", marginBottom: 6 }}>{title}</Text>
      {lines.map((l, idx) => (
        <Text key={idx} style={{ color: "white" }}>{l}</Text>
      ))}
    </View>
  );
}
