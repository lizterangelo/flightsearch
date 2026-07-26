import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import AccountModal from "@/components/account/AccountModal";
import { MeProvider } from "@/components/auth/MeProvider";
import AppLoader from "@/components/AppLoader";
import { CurrencyProvider } from "@/components/CurrencyProvider";
import Header from "@/components/Header";
import NightSky from "@/components/NightSky";
import ThemeApplier from "@/components/ThemeApplier";
import { ToastProvider } from "@/components/ui/Toast";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Soar - Find and Book Cheap Flights",
  description:
    "Find and book cheap flights instantly with live airfare search, deal alerts, and booked trip management.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "Soar - Find and Book Cheap Flights",
    description:
      "Find and book cheap flights instantly with live airfare search, deal alerts, and booked trip management.",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Soar" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppLoader />
        <ToastProvider>
          <MeProvider>
            <CurrencyProvider>
              <ThemeApplier />
              <NightSky />
              <div className="relative z-10 flex min-h-screen flex-col">
                <Header />
                {children}
              </div>
              <AccountModal />
            </CurrencyProvider>
          </MeProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
