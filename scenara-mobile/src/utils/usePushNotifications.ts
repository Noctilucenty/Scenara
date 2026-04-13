import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";

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

type DeviceModule = {
  isDevice: boolean;
};

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
    console.log("[Push] Permission not granted for push notifications");
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
    console.log("[Push] Expo push token:", token);
    return token;
  } catch (e) {
    console.error("[Push] Failed to get push token:", e);
    return null;
  }
}

export async function sendPushTokenToServer(token: string): Promise<void> {
  try {
    await api.post("/push/register-token", { token });
    console.log("[Push] Token registered with server");
  } catch (e) {
    console.error("[Push] Failed to register token:", e);
  }
}

export function usePushNotifications() {
  const router = useRouter();
  const notificationListener = useRef<{ remove(): void } | null>(null);
  const responseListener = useRef<{ remove(): void } | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;

    let mounted = true;

    void (async () => {
      const Notifications = await loadNotifications();
      if (!mounted || !Notifications) return;

      await ensureNotificationHandler();

      notificationListener.current =
        Notifications.addNotificationReceivedListener((notification) => {
          console.log("[Push] Notification received:", notification);
        });

      responseListener.current =
        Notifications.addNotificationResponseReceivedListener((response: any) => {
          const data = response.notification.request.content.data as any;
          console.log("[Push] Notification tapped:", data);

          if (data?.event_id) {
            router.push({
              pathname: "/market-detail",
              params: { eventId: String(data.event_id) },
            });
          } else if (data?.type === "won" || data?.type === "lost") {
            router.push("/(tabs)/portfolio");
          }
        });
    })();

    return () => {
      mounted = false;
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [router]);
}
