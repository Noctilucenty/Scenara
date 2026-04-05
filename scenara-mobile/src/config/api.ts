import { Platform } from "react-native";

const LOCAL_IP = "127.0.0.1";
const PROD_URL = "https://scenara-backend.onrender.com";

const isWeb = Platform.OS === "web";
const isDev = typeof __DEV__ !== "undefined" && __DEV__;

export const API_BASE_URL =
  isDev && !isWeb ? `http://${LOCAL_IP}:8000` : PROD_URL;
