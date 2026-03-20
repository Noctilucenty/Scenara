import { Platform } from "react-native";

const USE_LOCAL = true;

// iOS simulator on your Mac can use 127.0.0.1
// If you test on a real phone, replace with your Mac's LAN IP.
const LOCAL_IP = "127.0.0.1";
const PROD_URL = "https://web-production-343a.up.railway.app";

export const API_BASE_URL = USE_LOCAL
  ? Platform.OS === "web"
    ? `http://${LOCAL_IP}:8000`
    : `http://${LOCAL_IP}:8000`
  : PROD_URL;
