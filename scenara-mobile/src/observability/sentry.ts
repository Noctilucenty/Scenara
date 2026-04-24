/**
 * Sentry initialization + thin wrapper for the Expo app.
 *
 * Why a wrapper instead of calling sentry-sdk directly:
 * - Centralizes the "is Sentry actually installed?" check so consumer code
 *   doesn't need to try/catch around every call.
 * - Scrubs the Authorization header and password fields BEFORE transmit,
 *   matching the backend scrub logic in app/observability.py.
 * - Gives us a single place to toggle sampling / release tagging when we
 *   learn what our production volume looks like.
 *
 * The module is safe to import even when Sentry is not configured — every
 * function no-ops gracefully if EXPO_PUBLIC_SENTRY_DSN is missing.
 *
 * Platform notes:
 * - On native, @sentry/react-native captures JS errors + native crashes
 *   + session tracking + performance traces out of the box.
 * - On web, it falls back to @sentry/browser under the hood.
 */
import Constants from "expo-constants";
import { Platform } from "react-native";

// We import Sentry lazily so the app starts even if the package failed to
// install. The initSentry() call resolves the module once at startup.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Sentry: any = null;
let isInitialized = false;

// Pull DSN from Expo public env vars. EXPO_PUBLIC_* is the convention
// that ships to both native binaries and the web bundle.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
const SENTRY_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? "production";

// Scrub sensitive fields before transmit. Runs in the Sentry pipeline,
// not in a request interceptor, so it catches both request and breadcrumb
// captures consistently.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scrubBeforeSend(event: any): any {
  try {
    // Strip Authorization from request headers
    const headers = event?.request?.headers;
    if (headers && typeof headers === "object") {
      for (const key of Object.keys(headers)) {
        if (["authorization", "cookie", "x-api-key"].includes(key.toLowerCase())) {
          headers[key] = "[redacted]";
        }
      }
    }
    // Strip password-like fields from POST bodies
    const data = event?.request?.data;
    if (data && typeof data === "object") {
      for (const key of Object.keys(data)) {
        const k = key.toLowerCase();
        if (k.includes("password") || k.includes("secret") || k.includes("token")) {
          data[key] = "[redacted]";
        }
      }
    }
  } catch {
    // Never let scrubbing errors block the event from being sent
  }
  return event;
}

export function initSentry(): boolean {
  if (isInitialized) return true;
  if (!SENTRY_DSN) {
    // Not configured — run as no-op. Silent by design; logging this on
    // every launch would be noise.
    return false;
  }

  try {
    // Dynamic require so missing dep doesn't crash app launch
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Sentry = require("@sentry/react-native");
  } catch {
    // Module not installed yet — fail closed but keep app alive
    return false;
  }

  const release =
    (Constants.expoConfig?.extra as { gitCommit?: string } | undefined)?.gitCommit ??
    Constants.expoConfig?.version ??
    "local";

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENV,
    release,
    // Performance: sample 10% of transactions. Same rate as backend so
    // the two halves of a distributed trace are captured together.
    tracesSampleRate: 0.1,
    // Attach the device + app context automatically
    enableAutoSessionTracking: true,
    enableNativeCrashHandling: Platform.OS !== "web",
    // Breadcrumbs for navigation, console, and XHR — bounded so Sentry
    // payloads stay small.
    maxBreadcrumbs: 25,
    beforeSend: scrubBeforeSend,
    // Don't automatically attach screenshots; a user screenshot could
    // contain PII from other apps. We'd need explicit consent first.
    attachScreenshot: false,
  });

  isInitialized = true;
  return true;
}

/** Tag the current scope with the authenticated user. Pass null on logout. */
export function setSentryUser(
  id: number | null,
  email: string | null = null
): void {
  if (!Sentry) return;
  if (id === null) {
    Sentry.setUser(null);
  } else {
    Sentry.setUser(email ? { id: String(id), email } : { id: String(id) });
  }
}

/** Explicit capture for caught exceptions that should still be reported. */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!Sentry) return;
  if (context) {
    Sentry.withScope((scope: { setContext: (name: string, ctx: Record<string, unknown>) => void }) => {
      scope.setContext("extra", context);
      Sentry.captureException(err);
    });
  } else {
    Sentry.captureException(err);
  }
}

/**
 * Wrap the React root in Sentry's ErrorBoundary so render-phase throws
 * (like the TDZ login bug) are captured instead of showing a blank screen.
 *
 * Returns a passthrough wrapper when Sentry is disabled so callers don't
 * need to branch on initialization state.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapRootComponent<T extends React.ComponentType<any>>(Component: T): T {
  if (!Sentry) return Component;
  return Sentry.wrap(Component) as T;
}
