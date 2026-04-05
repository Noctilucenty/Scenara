import { Platform } from "react-native";

const PROD_URL = "https://scenara-backend.onrender.com";

// On web: use EXPO_PUBLIC_API_URL if set, otherwise detect if running on localhost
// On native: use localhost in dev, prod URL in production
function getApiBaseUrl(): string {
  // If an explicit env var is set, always use it (works for both web and native)
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // Web (Vercel or browser)
  if (Platform.OS === "web") {
    // If running in a real browser (not SSR), check the hostname
    if (typeof window !== "undefined" && window.location) {
      const hostname = window.location.hostname;
      // Only hit localhost backend when actually on localhost
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        return "http://localhost:8000";
      }
    }
    // Any other hostname (vercel.app, custom domain, etc.) → production
    return PROD_URL;
  }

  // Native (iOS / Android)
  // __DEV__ is true in Expo Go and debug builds, false in production builds
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    return "http://127.0.0.1:8000";
  }

  return PROD_URL;
}

export const API_BASE_URL = getApiBaseUrl();
