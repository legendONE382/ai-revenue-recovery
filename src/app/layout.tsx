import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { InstallPrompt } from "@/components/install-prompt";

export const metadata: Metadata = {
  title: "Inbox Revenue Intelligence",
  description: "Find the revenue opportunities hiding in your inbox. Never let another potential customer, proposal or payment slip through the cracks.",
  manifest: "/manifest.json",
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