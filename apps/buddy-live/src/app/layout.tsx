import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = "https://buddy-live-indol.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Buddy Live · Hockey coaching at home",
  description:
    "Practice your shot with Coach Buddy. Warm up, shoot, and see your score — right from your webcam.",
  openGraph: {
    title: "Buddy Live · Hockey coaching at home",
    description:
      "Practice your shot with Coach Buddy. Warm up, shoot, and see your score — right from your webcam.",
    url: siteUrl,
    siteName: "Buddy Live",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Buddy Live · Hockey coaching at home",
    description:
      "Practice your shot with Coach Buddy. Warm up, shoot, and see your score — right from your webcam.",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-black text-zinc-50">{children}</body>
    </html>
  );
}
