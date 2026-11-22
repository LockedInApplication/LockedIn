"use client";
import { useCallback, useState } from "react";
import { useInboxUnread } from "@/features/journey/components/MemberChrome";
import { journeyRequest, type JourneyOverview } from "@/lib/journey";
import { messagingRequest } from "@/features/messaging/messaging.client";
import type { ConversationMetadata } from "@/features/messaging/messaging.types";
import ProfileAvatar from "@/features/profile/ProfileAvatar";
import DirectInvite from "@/features/invitations/DirectInvite";
import { useDiscovery } from "./DiscoveryShell";
import { discoveryRequest } from "./discovery.client";
import { useDiscoveryResource } from "./use-discovery-resource";
import type { PageOf, DiscoveryConnectionView } from "./discovery.types";
import { inboxEntries } from "./inbox-entries";
import styles from "./discovery.module.scss";
import inboxStyles from "./inbox.module.scss";

export default function InboxList({ compose }: { compose: boolean }) {
  const { userId, me, chatRevision, leave } = useDiscovery();
  const unread = useInboxUnread();
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const before = cursors.at(-1);
  const load = useCallback((signal: AbortSignal) => discoveryRequest<PageOf<DiscoveryConnectionView>>(userId,
    `/api/discovery/connections${before ? `?before=${encodeURIComponent(before)}` : ""}`, { signal }), [userId, before]);
  const connections = useDiscoveryResource(userId, compose ? "" : `connections:${before ?? ""}`, load, chatRevision);
  const readInvites = useCallback(async (signal: AbortSignal) => {
    const data = await journeyRequest<JourneyOverview>("/api/journey/overview", { signal, cache: "no-store" });
    if (data.user.id !== userId) throw new Error("Your account changed. Reopen Inbox to continue.");
    return { pending: data.pendingInvites, canInvite: data.canInviteToChat ?? !data.relationship, chatFirst: data.canInviteToChat !== undefined,
      directChats: data.directChats, chatId: data.messaging?.enabled ? data.messaging.conversationId : null };
  }, [userId]);
  const direct = useDiscoveryResource(userId, "inbox-invites", readInvites, chatRevision);
  const directChatId = direct.value?.chatId;
  const readChat = useCallback((signal: AbortSignal) => messagingRequest<ConversationMetadata>(userId,
    `/api/messaging/conversations/${encodeURIComponent(directChatId ?? "")}`, { signal }), [userId, directChatId]);
  const linked = useDiscoveryResource(userId, !compose && directChatId ? `inbox-shared-chat:${directChatId}` : "", readChat, chatRevision);
  const { chats, invitations, history, offPageUnread } = inboxEntries(connections.value?.items ?? [], linked.value, unread, !!me.chatEnabled && (me.canChat ?? me.canDiscover), direct.value?.directChats);
  const settled = !!connections.value && !!direct.value && (!directChatId || !!linked.value);
  const pending = !connections.error && !direct.error && !linked.error && !settled;

  if (compose) return <>
    <button onClick={() => void leave("/connections")}>← Inbox</button>
    <h1>Invite someone you know</h1>
    {direct.error ? <p role="alert">{direct.error} <button onClick={direct.retry}>Try again</button></p> :
      !direct.value ? <p role="status">Checking invitation availability…</p> :
      !direct.value.canInvite ? <section className={styles.card}><p>New invitations are unavailable right now. You can keep chatting in Inbox.</p></section> :
      <DirectInvite chatFirst={direct.value.chatFirst}/>}
  </>;

  return <>
    <div className={inboxStyles.heading}>
      <div><h1>Inbox</h1><p>Chat with people you’ve connected with or invited.</p></div>
      <div className={styles.actions}>
        {direct.value?.canInvite ? <button className={styles.primary} onClick={() => void leave("/connections?compose=invite")}>Invite someone</button> : null}
        <button onClick={() => void leave("/journey?invitations=manage")}>Sent invitations</button>
      </div>
    </div>
    {connections.error ? <p role="alert">Discovery conversations couldn’t load. <button onClick={connections.retry}>Try again</button></p> : null}
    {direct.error ? <p role="alert">Direct invitations couldn’t load. <button onClick={direct.retry}>Try again</button></p> : null}
    {linked.error ? <p role="alert">Your shared-space chat couldn’t load. <button onClick={linked.retry}>Try again</button></p> : null}
    {pending ? <p role="status">Loading your conversations…</p> : null}
    {chats.length || offPageUnread ? <section aria-labelledby="inbox-chats">
      <h2 id="inbox-chats">Conversations</h2>
      {chats.length ? <InboxRows rows={chats} onOpen={leave}/> : null}
      {offPageUnread ? <button onClick={() => void leave(offPageUnread)}>Open next unread conversation</button> : null}
    </section> : null}
    {invitations.length || direct.value?.pending.length ? <section aria-labelledby="inbox-invitations" className={inboxStyles.section}>
      <h2 id="inbox-invitations">Invitations</h2>
      <InboxRows rows={[...(direct.value?.pending ?? []).map(invite => ({
        href: `/journey?invitation=${encodeURIComponent(invite.id)}`, partner: { publicName: invite.inviter.name, avatarPreset: "initials" },
        status: "Invitation to review", detail: direct.value?.chatFirst ? "Invited you to chat" : "Invited you to a private shared space", unread: false,
      })), ...invitations]} onOpen={leave}/>
    </section> : null}
    {settled && !before && !chats.length && !offPageUnread && !invitations.length && !direct.value?.pending.length ? <section className={styles.card}>
      <h2>No conversations yet</h2>
      <p>Meet someone new in Discover, or invite someone you already know.</p>
      <button onClick={() => void leave("/discover")}>Go to Discover</button>
    </section> : null}
    {history.length ? <details className={styles.card}>
      <summary>Past or unavailable connections</summary>
      <InboxRows rows={history} onOpen={leave}/>
    </details> : null}
    <div className={styles.actions}>
      {cursors.length > 1 ? <button onClick={() => setCursors(value => value.slice(0, -1))}>Newer connections</button> : null}
      {connections.value?.nextCursor ? <button onClick={() => setCursors(value => [...value, connections.value!.nextCursor])}>Older connections</button> : null}
    </div>
  </>;
}

type InboxRow = Pick<ReturnType<typeof inboxEntries>["chats"][number], "href" | "partner" | "status" | "detail" | "unread">;
export function InboxRows({ rows, onOpen }: { rows: InboxRow[]; onOpen: (href: string) => Promise<boolean> }) {
  return <ul className={inboxStyles.rows} role="list">{rows.map(({ href, partner, status, detail, unread }) =>
    <li key={href}>
      <button type="button" className={`${inboxStyles.row}${unread ? ` ${inboxStyles.unread}` : ""}`} onClick={() => void onOpen(href)}>
        <ProfileAvatar name={partner.publicName} preset={partner.avatarPreset}/>
        <span className={inboxStyles.text}><strong>{partner.publicName}</strong><span>{detail}</span></span>
        <span className={inboxStyles.status}>{unread ? "New message" : status}</span>
      </button>
    </li>
  )}</ul>;
}
