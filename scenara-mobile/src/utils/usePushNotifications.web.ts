/**
 * Web-platform stub for push notification utilities.
 *
 * Metro automatically selects this file for web builds (*.web.ts extension)
 * instead of usePushNotifications.ts, which contains dynamic imports of
 * expo-notifications and expo-device that Metro cannot resolve on web.
 *
 * Native push (expo-notifications) is not available on web — this stub
 * returns null for native-only functions and provides the full web push
 * implementation for web-specific ones.
 */
import { useEffect } from "react";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";

// ── Helpers ──────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

function handleTap(data: any, router: ReturnType<typeof useRouter>): void {
  if (!data || typeof data !== "object") { router.push("/"); return; }
  const route = typeof data.route === "string" ? data.route : "/";
  const params = data.params && typeof data.params === "object" ? data.params : undefined;
  try {
    router.push(params ? { pathname: route as any, params } : (route as any));
  } catch {
    router.push("/");
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────

/** Native-only — always returns null on web. */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  return null;
}

/** Web Push subscription via the PushManager API. */
export async function registerForWebPushAsync(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;

  let publicKey: string | null = null;
  try {
    const res = await api.get<{ public_key: string }>("/notifications/vapid-public-key");
    publicKey = res.data.public_key;
  } catch {
    return null;
  }
  if (!publicKey) return null;

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register("/sw.js");
  } catch (e) {
    console.error("[Push/web] SW registration failed:", e);
    return null;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  try {
    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    return JSON.stringify(sub.toJSON());
  } catch (e) {
    console.error("[Push/web] subscribe failed:", e);
    return null;
  }
}

export async function sendPushTokenToServer(
  token: string,
  platform: "expo" | "web",
): Promise<void> {
  try {
    await api.post("/notifications/register", { token, platform });
    console.log(`[Push] Registered ${platform} token`);
  } catch (e) {
    console.error("[Push] Failed to register token:", e);
  }
}

export async function unregisterPushTokenFromServer(token: string): Promise<void> {
  try {
    await api.delete("/notifications/register", { data: { token } });
  } catch (e) {
    console.error("[Push] Failed to unregister token:", e);
  }
}

/**
 * Web-only push hook — listens for service worker postMessage taps
 * and deep-links into the correct screen.
 */
export function usePushNotifications() {
  const router = useRouter();

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "scenara/push-tap") {
        handleTap({ route: event.data.route, params: event.data.params }, router);
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);
}
