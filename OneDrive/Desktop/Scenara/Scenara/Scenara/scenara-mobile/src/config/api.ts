import { Platform } from "react-native";

const USE_LOCAL = true;

const LOCAL_IP = "127.0.0.1";
const PROD_URL = "https://scenara-backend.onrender.com";

export const API_BASE_URL = USE_LOCAL
  ? Platform.OS === "web"
    ? `http://${LOCAL_IP}:8001`
    : `http://${LOCAL_IP}:8001`
  : PROD_URL;
