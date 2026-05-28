
import type { Metadata } from "next";
import { Mona_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const monaSans = Mona_Sans({
  variable: "--font-mona-sans",
  subsets: ["latin"],
});

const monaMono = Mona_Sans({
  variable: "--font-mona-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Prepster",
  description: "An AI-powered platform for preparing for mock interviews",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${monaSans.variable} ${monaMono.variable} antialiased pattern`}
        suppressHydrationWarning
      >
        {children}

        <Toaster/>
      </body>
    </html>
  );
}
