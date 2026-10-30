import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { PairingGate } from "@/components/PairingGate";
import { Shell } from "@/components/Shell";
import { WsProvider } from "@/lib/ws";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Jarvis — Operator Console",
  description: "Operator console for the Jarvis personal AI agent gateway.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrumentSans.variable} ${plexMono.variable}`}>
      <body className="font-sans antialiased">
        <div className="grain" aria-hidden="true" />
        <PairingGate>
          <WsProvider>
            <Shell>{children}</Shell>
          </WsProvider>
        </PairingGate>
      </body>
    </html>
  );
}
