import axios from "axios";
import { API_BASE_URL } from "../config/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // 60s — allows Render.com free-tier cold start (can reach 50s+)
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      // Distinguish a true axios timeout (ECONNABORTED) from other failures
      // like CORS, connection refused, or no internet. This lets callers
      // decide whether to retry (timeout = server cold) vs show a real error.
      const isTimeout =
        error.code === "ECONNABORTED" ||
        (error.message ?? "").toLowerCase().includes("timeout");

      return Promise.reject({
        message: isTimeout ? "Request timed out" : "Network error",
        isTimeout,
        originalError: error,
      });
    }

    const { status, data } = error.response;

    return Promise.reject({
      status,
      data,
      message: data?.detail || data?.error || "Backend error",
    });
  },
);
