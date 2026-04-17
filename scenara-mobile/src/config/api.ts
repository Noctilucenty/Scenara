import { Platform } from "react-native";

const PROD_URL = "https://scenara-backend.onrender.com";

function getApiBaseUrl(): string {
  // Explicit env var always wins (set EXPO_PUBLIC_API_URL to override)
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // Native dev builds: hit a local backend if __DEV__ is true.
  // Web always uses production — there is no local Python backend to route to.
  if (Platform.OS !== "web" && typeof __DEV__ !== "undefined" && __DEV__) {
    return "http://127.0.0.1:8000";
  }

  return PROD_URL;
}

export const API_BASE_URL = getApiBaseUrl();
