import type { Metadata } from "next";
import "./globals.scss";
import Script from "next/script";
import { profileHistoryBootstrap } from "@/features/profile/profile-history-bootstrap";
import VerifiedMemberGate from "@/features/auth/VerifiedMemberGate";

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
      <body>
        <Script id="profile-history-guard" strategy="beforeInteractive">
          {profileHistoryBootstrap}
        </Script>
        <VerifiedMemberGate>{children}</VerifiedMemberGate>
      </body>
    </html>
  );
}
