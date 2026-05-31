import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "genova.Ia — Système d'exploitation pour agents IA",
  description: "genova.Ia est la plateforme SaaS qui vous permet de créer, gérer et coordonner vos agents IA.",
  keywords: ["genova.Ia", "Genova", "IA", "agents", "automatisation", "SaaS", "AI Operating System"],
  authors: [{ name: "genova.Ia Team" }],
  icons: {
    icon: ["/favicon-genova.png", "/icon.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
