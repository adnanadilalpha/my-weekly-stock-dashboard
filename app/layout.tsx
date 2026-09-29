import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "My Weekly Stock",
  description: "My Weekly Stock Dashboard",
  icons: {
    icon: [{ url: "/mws-mark.svg", type: "image/svg+xml" }],
    apple: [{ url: "/mws-mark.svg", type: "image/svg+xml" }],
    shortcut: "/mws-mark.svg",
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
