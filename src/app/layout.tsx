import type { Metadata } from "next";
import { Cinzel, Manrope } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "MTG Budget — Sealed deals & preorder radar",
  description:
    "Set a Magic: The Gathering sealed-product budget, find the cheapest reputable US total price, and watch preorders go live.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cinzel.variable} ${manrope.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
