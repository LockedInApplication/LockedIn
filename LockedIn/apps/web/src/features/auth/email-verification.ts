import { authClient } from "@/utils/authCLient";
import { verificationPath } from "./member-entry";

export type VerificationAccount = { id: string; email: string; emailVerified: boolean };
export async function checkEmailVerification(ownerId: string | null): Promise<VerificationAccount | null> {
  let result;
  try {
    result = await authClient.getSession({ query: { disableCookieCache: true }, fetchOptions: { cache: "no-store" } });
  } catch {
    throw new Error("Could not check verification. Please try again.");
  }
  if (result.error) throw new Error("Could not check verification. Please try again.");
  const user = result.data?.user ?? null;
  if ((user?.id ?? null) !== ownerId) throw new Error("Your account changed. Please reload this page.");
  return user ? { id: user.id, email: user.email, emailVerified: user.emailVerified === true } : null;
}

export async function requestEmailVerification(ownerId: string | null, email: string, origin: string, returnTo?: string): Promise<"requested" | "verified"> {
  const account = await checkEmailVerification(ownerId);
  if (account?.emailVerified) return "verified";
  const address = (account?.email ?? email).trim();
  if (!address) throw new Error("Enter your email to request verification.");
  try {
    const result = await authClient.sendVerificationEmail({ email: address, callbackURL: new URL(returnTo ? verificationPath(returnTo) : "/verify-email?pending=1", origin).href });
    if (result.error) throw new Error("delivery failed");
  } catch {
    throw new Error("Could not send a verification email. Please try again. If this continues, contact support.");
  }
  return "requested";
}
