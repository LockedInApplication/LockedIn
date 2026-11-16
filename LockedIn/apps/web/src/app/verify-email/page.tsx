import { Suspense } from "react";
import EmailVerificationPage from "@/features/auth/EmailVerificationPage";

export default function VerifyEmailPage() {
  return <Suspense fallback={<main><p role="status">Opening email verification…</p></main>}><EmailVerificationPage /></Suspense>;
}
