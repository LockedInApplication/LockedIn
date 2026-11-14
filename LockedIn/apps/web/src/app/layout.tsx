import type { Metadata } from "next";
import "./globals.scss";

export const metadata: Metadata = {
  title: "LockedIn | Build the relationship you both choose",
  description:
    "A private relationship roadmap that turns individual intentions into mutually chosen next steps.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
