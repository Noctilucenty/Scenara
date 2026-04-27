/**
 * Push notification utilities + React hook.
 *
 * Registration (token acquisition) is triggered by TradingContext on
 * login/register — not inside this hook — so the user is always authed
 * before we POST a token to the server.
 *
 * This hook does two things once mounted in _layout.tsx:
 *   1. Listens for notification taps (native) and SW postMessage (web) and
 *      deep-links into the correct screen.
 *   2. Logs foreground notification arrivals for debugging.
 *
 * Server notification payload contract (app/services/notifications.py):
 *   data: { route: string, params: Record<string, string> }
 *
 * Example payloads:
 *   { route: "/market-detail", params: { id: "42" } }
 *   { route: "/user-profile",  params: { id: "7"  } }
 *   { route: "/(tabs)/portfolio", params: {} }
 */
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";

// ── Module-level singletons (survive re-renders) ────────────────────────────

type NotificationModule = {
  AndroidImportance: { MAX: number; HIGH: number };
  setNotificationHandler(config: {
    handleNotification: () => Promise<{
      shouldShowAlert: boolean;
      shouldPlaySound: boolean;
      shouldSetBadge: boolean;
    }>;
  }): void;
  getPermissionsAsync(): Promise<{ status: string }>;
  requestPermissionsAsync(): Promise<{ status: string }>;
  setNotificationChannelAsync(name: string, config: Record<string, unknown>): Promise<void>;
  getExpoPushTokenAsync(): Promise<{ data: string }>;
  addNotificationReceivedListener(callback: (notification: unknown) => void): { remove(): void };
  addNotificationResponseReceivedListener(callback: (response: any) => void): { remove(): void };
};

type DeviceModule = { isDevice: boolean };

let notificationsPromise: Promise<NotificationModule | null> | null = null;
let devicePromise: Promise<DeviceModule | null> | null = null;
let notificationHandlerConfigured = false;

async function loadNotifications(): Promise<NotificationModule | null> {
  if (Platform.OS === "web") return null;
  if (!notificationsPromise) {
    // eslint-disable-next-line import/no-unresolved
    notificationsPromise = import("expo-notifications")
      .then(mod => mod as unknown as NotificationModule)
      .catch(() => null);
  }
  return notificationsPromise;
}

async function loadDevice(): Promise<DeviceModule | null> {
  if (Platform.OS === "web") return null;
  if (!devicePromise) {
    // eslint-disable-next-line import/no-unresolved
    devicePromise = import("expo-device")
      .then(mod => mod as unknown as DeviceModule)
      .catch(() => null);
  }
  return devicePromise;
}

async function ensureNotificationHandler(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications || notificationHandlerConfigured) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
  notificationHandlerConfigured = true;
}

// ── Native registration (called by TradingContext, not the hook) ─────────────

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  const [Notifications, Device] = await Promise.all([loadNotifications(), loadDevice()]);
  if (!Notifications || !Device) return null;

  await ensureNotificationHandler();

  if (!Device.isDevice) {
    console.log("[Push] Push notifications require a physical device");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    console.log("[Push] Permission not granted");
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("scenara-default", {
      name: "Scenara Markets",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#7C5CFC",
      sound: "default",
    });
    await Notifications.setNotificationChannelAsync("scenara-wins", {
      name: "Market Wins",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 500, 100, 500],
      lightColor: "#22C55E",
      sound: "default",
    });
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    console.log("[Push] Expo token acquired");
    return token;
  } catch (e) {
    console.error("[Push] getExpoPushTokenAsync failed:", e);
    return null;
  }
}

// ── Web Push registration (called by TradingContext, not the hook) ───────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export async function registerForWebPushAsync(): Promise<string | null> {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;

  // GET /notifications/vapid-public-key — 404 means web push not configured.
  let publicKey: string | null = null;
  try {
    const res = await api.get<{ public_key: string }>("/notifications/vapid-public-key");
    publicKey = res.data.public_key;
  } catch {
    return null; // silently skip in local dev
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

// ── Server registration / deregistration (called by TradingContext) ──────────

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

// ── Tap-handler ──────────────────────────────────────────────────────────────

/**
 * Route into the app based on the notification data payload.
 * Server shape: { route: string, params: Record<string, string> }
 */
function handleTap(data: any, router: ReturnType<typeof useRouter>): void {
  if (!data || typeof data !== "object") {
    router.push("/");
    return;
  }
  const route = typeof data.route === "string" ? data.route : "/";
  const params = data.params && typeof data.params === "object" ? data.params : undefined;
  try {
    router.push(params ? { pathname: route as any, params } : (route as any));
  } catch {
    router.push("/");
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Mount once in _layout.tsx (inside TradingProvider so router is available).
 * Sets up:
 *   - Native: expo-notifications foreground + tap listeners
 *   - Web:    navigator.serviceWorker "message" relay listener
 */
export function usePushNotifications() {
  const router = useRouter();
  const notificationListener = useRef<{ remove(): void } | null>(null);
  const responseListener = useRef<{ remove(): void } | null>(null);

  useEffect(() => {
    let mounted = true;

    // ── Web: listen for the SW postMessage when user taps a notification ──
    if (Platform.OS === "web" && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const onMessage = (event: MessageEvent) => {
        if (!mounted) return;
        if (event.data?.type === "scenara/push-tap") {
          handleTap({ route: event.data.route, params: event.data.params }, router);
        }
      };
      navigator.serviceWorker.addEventListener("message", onMessage);
      return () => {
        mounted = false;
        navigator.serviceWorker.removeEventListener("message", onMessage);
      };
    }

    // ── Native: expo-notifications listeners ──────────────────────────────
    void (async () => {
      const Notifications = await loadNotifications();
      if (!mounted || !Notifications) return;
      await ensureNotificationHandler();

      notificationListener.current =
        Notifications.addNotificationReceivedListener((notification) => {
          console.log("[Push] Foreground notification:", notification);
        });

      responseListener.current =
        Notifications.addNotificationResponseReceivedListener((response: any) => {
          const data = response?.notification?.request?.content?.data;
          handleTap(data, router);
        });
    })();

    return () => {
      mounted = false;
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
