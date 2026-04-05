import axios from "axios";
import { API_BASE_URL } from "../config/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      return Promise.reject({
        message: "Network error or timeout",
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
