/**
 * app/+html.tsx — HTML shell for Expo Router web builds
 *
 * This file is rendered on the server during `expo export --platform web`
 * and produces the static HTML document that wraps the React Native Web
 * app.  Everything inside <head> is what crawlers (Google, Twitter,
 * OpenGraph, etc.) see when they fetch scenara.vercel.app.
 *
 * Per-screen meta (dynamic title, canonical, etc.) can be set via the
 * `<Head>` component from `expo-router/head`, but the defaults below are
 * what the home page and the link previews use.
 *
 * Native (iOS/Android) builds ignore this file entirely.
 */
import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

const SITE_URL    = "https://scenara.vercel.app";
const SITE_NAME   = "Scenara";
const SITE_TITLE  = "Scenara — Predict the world. Bet zero risk.";
const SITE_DESC   =
  "Scenara is a zero-risk prediction-market simulation powered by real Polymarket data. " +
  "Place simulated bets on world events — politics, crypto, sports, science — and climb " +
  "the global leaderboard. Free, no wallet, no real money.";
const SITE_KEYWORDS =
  "prediction markets, polymarket, scenara, simulation, sports betting, crypto predictions, " +
  "election betting, virtual trading, paper trading, prediction game";
// Use a stable preview image hosted on the deploy.  Falls back to the app icon
// if og-image.png isn't present.  Recommended size: 1200×630.
const OG_IMAGE    = `${SITE_URL}/og-image.png`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        {/* ── Charset + viewport — first, per HTML standard ──────────────── */}
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/* ── Core SEO ───────────────────────────────────────────────────── */}
        <title>{SITE_TITLE}</title>
        <meta name="description" content={SITE_DESC} />
        <meta name="keywords" content={SITE_KEYWORDS} />
        <meta name="author" content="Scenara" />
        <meta name="robots" content="index, follow, max-image-preview:large" />
        <link rel="canonical" href={SITE_URL} />

        {/* ── Open Graph (Facebook, LinkedIn, Discord, Slack) ────────────── */}
        <meta property="og:type"        content="website" />
        <meta property="og:url"         content={SITE_URL} />
        <meta property="og:title"       content={SITE_TITLE} />
        <meta property="og:description" content={SITE_DESC} />
        <meta property="og:image"       content={OG_IMAGE} />
        <meta property="og:image:width"  content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt"   content="Scenara — Predict the world" />
        <meta property="og:site_name"   content={SITE_NAME} />
        <meta property="og:locale"      content="en_US" />
        <meta property="og:locale:alternate" content="pt_BR" />
        <meta property="og:locale:alternate" content="zh_CN" />

        {/* ── Twitter card ───────────────────────────────────────────────── */}
        <meta name="twitter:card"        content="summary_large_image" />
        <meta name="twitter:url"         content={SITE_URL} />
        <meta name="twitter:title"       content={SITE_TITLE} />
        <meta name="twitter:description" content={SITE_DESC} />
        <meta name="twitter:image"       content={OG_IMAGE} />
        <meta name="twitter:image:alt"   content="Scenara — Predict the world" />

        {/* ── Browser hints ──────────────────────────────────────────────── */}
        <meta name="theme-color"           content="#7C5CFC" />
        <meta name="color-scheme"          content="dark" />
        <meta name="application-name"      content="Scenara" />
        <meta name="apple-mobile-web-app-capable"        content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title"          content="Scenara" />
        <meta name="format-detection"      content="telephone=no" />

        {/* ── Structured data (Schema.org / JSON-LD) — helps Google
            render rich results in search. ────────────────────────────── */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: SITE_NAME,
              url: SITE_URL,
              description: SITE_DESC,
              applicationCategory: "GameApplication",
              operatingSystem: "Web, iOS, Android",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              author: { "@type": "Organization", name: "Scenara" },
            }),
          }}
        />

        {/* ── Favicon + PWA icons ────────────────────────────────────────── */}
        <link rel="icon"          type="image/png" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        {/* ── DNS prefetch for backend so the first XHR is fast ──────────── */}
        <link rel="dns-prefetch" href="https://scenara-backend.onrender.com" />
        <link rel="preconnect"   href="https://scenara-backend.onrender.com" crossOrigin="anonymous" />

        {/* Expo Web stylesheet reset — keep last so app styles apply on top */}
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
