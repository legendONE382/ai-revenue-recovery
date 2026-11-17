import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inbox Revenue Intelligence",
  description: "Find the revenue opportunities hiding in your inbox. Never let another potential customer, proposal or payment slip through the cracks.",
  other: {
    "google-site-verification": "xbSDnvWUpVwwPQIOFKmeJu-5jykqXZ5RTL8RRe88FfE",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
