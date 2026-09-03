import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "500", "600", "700"] });
const mono = Roboto_Mono({ subsets: ["latin"], variable: "--font-technical" });

export const metadata: Metadata = {
  title: "Agroposta",
  description: "Tu consejero agropecuario sobre Margenes Agropecuarios",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
