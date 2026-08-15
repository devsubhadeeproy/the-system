import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The System",
  description: "A Solo Leveling-inspired self-improvement dashboard.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
