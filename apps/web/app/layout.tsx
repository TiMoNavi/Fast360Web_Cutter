import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Invisible Director",
  description: "WebXR 360 video reframing scaffold"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
