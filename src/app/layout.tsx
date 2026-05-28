import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LiveAvatar Interview Panel",
  description: "AI avatar moderator for multi-human group interviews",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
