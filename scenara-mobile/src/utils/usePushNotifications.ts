import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";

// Configure how notifications appear when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<
  string | null
> {
  if (Platform.OS === "web") return null;

  // Must be a physical device
  if (!Device.isDevice) {
    console.log("[Push] Push notifications require a physical device");
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request if not already granted
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("[Push] Permission not granted for push notifications");
    return null;
  }

  // Android channel setup
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
  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

  useEffect(() => {
    if (Platform.OS === "web") return;

    // Listen for notifications while app is foregrounded
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log("[Push] Notification received:", notification);
      });

    // Listen for user tapping notification
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as any;
        console.log("[Push] Notification tapped:", data);

        // Navigate to the relevant screen
        if (data?.event_id) {
          router.push({
            pathname: "/market-detail",
            params: { eventId: String(data.event_id) },
          });
        } else if (data?.type === "won" || data?.type === "lost") {
          router.push("/(tabs)/portfolio");
        }
      });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);
}
