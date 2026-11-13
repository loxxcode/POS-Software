import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CARITAS SHOPPER",
  description: "CARITAS SHOPPER point of sale system.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
