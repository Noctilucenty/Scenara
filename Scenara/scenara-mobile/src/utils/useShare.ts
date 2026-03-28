import { Share, Platform } from "react-native";

type ShareData = {
  title: string;
  message: string;
  url?: string;
};

export async function shareContent({
  title,
  message,
  url,
}: ShareData): Promise<boolean> {
  try {
    if (Platform.OS === "web") {
      if (navigator.share) {
        await navigator.share({ title, text: message, url });
        return true;
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(
          `${message}\n${url ?? "scenara.vercel.app"}`,
        );
        return true;
      }
    } else {
      const result = await Share.share({
        title,
        message: url ? `${message}\n\n${url}` : message,
      });
      return result.action === Share.sharedAction;
    }
  } catch {
    return false;
  }
}

export function buildMarketShareText(
  eventTitle: string,
  scenarioTitle: string,
  probability: number,
  language: string,
): string {
  if (language === "pt") {
    return `Acabei de apostar em "${scenarioTitle}" no mercado "${eventTitle}" com ${probability}% de chance no Scenara! 🎯\n\nscenara.vercel.app`;
  }
  return `I just bet on "${scenarioTitle}" in the market "${eventTitle}" at ${probability}% odds on Scenara! 🎯\n\nscenara.vercel.app`;
}

export function buildWinShareText(
  eventTitle: string,
  scenarioTitle: string,
  pnl: number,
  multiplier: number,
  language: string,
): string {
  const pnlStr =
    pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
  if (language === "pt") {
    return `Acertei a previsão "${scenarioTitle}" em "${eventTitle}" e ganhei ${pnlStr} (${multiplier}x) no Scenara! 🔥\n\nscenara.vercel.app`;
  }
  return `I called "${scenarioTitle}" in "${eventTitle}" and won ${pnlStr} (${multiplier}x) on Scenara! 🔥\n\nscenara.vercel.app`;
}
