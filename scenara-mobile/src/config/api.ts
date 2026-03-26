import { Platform } from "react-native";

const USE_LOCAL = false;

const LOCAL_IP = "127.0.0.1";
const PROD_URL = "https://scenara-backend.onrender.com";

export const API_BASE_URL = USE_LOCAL
  ? Platform.OS === "web"
    ? `http://${LOCAL_IP}:8000`
    : `http://${LOCAL_IP}:8000`
  : PROD_URL;
