"use client";

import Link from "next/link";
import { togetherChatHref } from "@/features/messaging/chat-starter";
import styles from "../next-action.module.scss";

export default function TogetherChatActions({ conversationId, partnerName, confirmLeave }: {
  conversationId: string;
  partnerName: string;
  confirmLeave: () => boolean;
}) {
  return <Link className={styles.openChat} href={togetherChatHref(conversationId)} onNavigate={event => { if (!confirmLeave()) event.preventDefault(); }}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round">
        <path d="M20.3 11.7a8.4 8.4 0 0 1-8.5 8.3c-1.2 0-2.4-.2-3.5-.7L4 20.5l1.2-4a8.2 8.2 0 0 1-1.5-4.8 8.3 8.3 0 0 1 16.6 0Z"/>
      </svg>
      <span>Message {partnerName}</span>
  </Link>;
}
