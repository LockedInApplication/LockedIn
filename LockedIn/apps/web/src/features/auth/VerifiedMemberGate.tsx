"use client";

import { Fragment, useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/utils/authCLient";
import { isMemberPath, safeMemberReturnTo, verificationPath } from "./member-entry";
import styles from "./email-verification.module.scss";

export default function VerifiedMemberGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  return isMemberPath(path) ? <Guard>{children}</Guard> : children;
}

function Guard({ children }: { children: ReactNode }) {
  const router = useRouter(), path = usePathname();
  const session = authClient.useSession();
  const verified = session.data?.user.emailVerified === true;
  const signedIn = Boolean(session.data?.user);
  useEffect(() => {
    if (session.isPending || session.error || verified) return;
    const returnTo = safeMemberReturnTo(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    router.replace(signedIn ? verificationPath(returnTo) : `/login?returnTo=${encodeURIComponent(returnTo)}`);
  }, [path, router, session.error, session.isPending, signedIn, verified]);

  if (verified && !session.isPending && !session.error) return <Fragment key={session.data?.user.id}>{children}</Fragment>;
  return <main className={styles.page}>{session.error ? <div role="alert">Couldn’t check your account. <button type="button" onClick={() => window.location.reload()}>Try again</button></div> : <p role="status">Checking your account…</p>}</main>;
}
