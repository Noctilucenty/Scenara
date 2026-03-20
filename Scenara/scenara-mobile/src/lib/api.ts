import axios from "axios";
import { API_BASE_URL } from "@/src/config/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: { "Content-Type": "application/json" },
});
