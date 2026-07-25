import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import NightSky from "@/components/NightSky";
import { ToastProvider } from "@/components/ui/Toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Soar - Find and Book Cheap Flights",
  description:
    "Search live fares and book in seconds — direct airline inventory, honest prices, and a refund guarantee.",
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
      <body className="min-h-full flex flex-col">
        <NightSky />
        <ToastProvider>
          <div className="relative z-10 flex min-h-screen flex-col">
            <Header />
            {children}
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
