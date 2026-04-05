import React from "react";
import { View, Text } from "react-native";

export function ErrorCard({ message }: { message: string }) {
  if (!message) return null;
  return (
    <View style={{ marginTop: 12, padding: 10, borderWidth: 1, borderColor: "red", borderRadius: 12 }}>
      <Text selectable style={{ color: "#ff6b6b" }}>{message}</Text>
    </View>
  );
}
