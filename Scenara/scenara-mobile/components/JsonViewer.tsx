import React from "react";
import { ScrollView, Text } from "react-native";

export function JsonViewer({ data }: { data: any }) {
  return (
    <ScrollView style={{ marginTop: 12, flex: 1 }}>
      <Text selectable style={{ color: "white" }}>
        {data ? JSON.stringify(data, null, 2) : "No result yet."}
      </Text>
    </ScrollView>
  );
}
