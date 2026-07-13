import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "DHOP — Digital Hotel Operations Platform",
  description:
    "Replace the WhatsApp-and-phone-calls chaos with one shared live system — guest requests, room service, housekeeping, and MoMo payments, built for Ghana's hotels.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${playfair.variable} ${inter.variable}`}>{children}</body>
    </html>
  );
}
