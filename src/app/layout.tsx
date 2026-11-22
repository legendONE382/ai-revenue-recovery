import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { InstallPrompt } from "@/components/install-prompt";

export const metadata: Metadata = {
  title: {
    default: "Inbox Revenue Intelligence — Find Revenue Hiding in Your Inbox",
    template: "%s | Inbox Revenue Intelligence",
  },
  description: "Connect Gmail once. We read your commercial conversations over time and tell you which potential customer, proposal or payment is about to slip through the cracks — with the evidence to prove it. Free to start.",
  keywords: [
    "inbox revenue intelligence",
    "email revenue recovery",
    "Gmail lead tracking",
    "proposal follow-up",
    "invoice overdue detection",
    "sales pipeline from email",
    "email opportunity finder",
    "revenue recovery tool",
    "Gmail business intelligence",
    "automated follow-up",
    "missed revenue detection",
    "client follow-up tracker",
  ],
  authors: [{ name: "Inbox Revenue Intelligence" }],
  creator: "Inbox Revenue Intelligence",
  publisher: "Inbox Revenue Intelligence",
  manifest: "/manifest.json",
  metadataBase: new URL(process.env.APP_URL || "https://ai-revenue-recovery-weld-one.vercel.app"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "Inbox Revenue Intelligence",
    title: "Inbox Revenue Intelligence — Find Revenue Hiding in Your Inbox",
    description: "Connect Gmail once. We read your commercial conversations over time and tell you which potential customer, proposal or payment is about to slip through the cracks — with the evidence to prove it.",
    images: [
      {
        url: "/screenshot.png",
        width: 1280,
        height: 720,
        alt: "Inbox Revenue Intelligence dashboard showing prioritized revenue opportunities",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Inbox Revenue Intelligence — Find Revenue Hiding in Your Inbox",
    description: "Connect Gmail once. We read your commercial conversations over time and tell you which potential customer, proposal or payment is about to slip through the cracks.",
    images: ["/screenshot.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Inbox Revenue Intelligence",
  },
  icons: {
    icon: "/icon.svg",
  },
  other: {
    "google-site-verification": "xbSDnvWUpVwwPQIOFKmeJu-5jykqXZ5RTL8RRe88FfE",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f5132",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-screen font-sans antialiased">
        {children}
        <InstallPrompt />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}

function ServiceWorkerRegistrar() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js').then(function(reg) {
                console.log('SW registered');
              }).catch(function(err) {
                console.log('SW registration failed:', err);
              });
            });
          }
        `,
      }}
    />
  );
}