import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RelayOps | Exception Recovery",
  description: "Operational visibility for logistics incidents and shipment recovery.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
