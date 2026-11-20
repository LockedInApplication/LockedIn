"use client";
import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DiscoveryShell, { useDiscovery } from "./DiscoveryShell";
import { discoveryRequest } from "./discovery.client";
import { useDiscoveryResource } from "./use-discovery-resource";
import type { PublicDiscoveryProfile } from "./discovery.types";
import StarterInvitation from "./StarterInvitation";
import InboxList from "./InboxList";

export default function ConnectionsPage() {
  const query = useSearchParams();
  return <DiscoveryShell key={query.toString()}>{query.get("profile") ? <InvitationComposer profileId={query.get("profile")!}/> : <InboxList compose={query.get("compose") === "invite"}/>}</DiscoveryShell>;
}

function InvitationComposer({ profileId }: { profileId: string }) {
  const { userId, me, leave, setDirty, setBusy } = useDiscovery();
  const router = useRouter(), query = useSearchParams();
  const load = useCallback((signal: AbortSignal) => discoveryRequest<PublicDiscoveryProfile>(userId, `/api/discovery/profiles/${encodeURIComponent(profileId)}`, { signal }), [userId, profileId]);
  const profile = useDiscoveryResource(userId, me.canDiscover ? `invite:${profileId}` : "", load);
  return <><button onClick={() => void leave("/connections")}>← Inbox</button>
    {profile.error || !me.canDiscover ? <p role="status">This person is not available for a new invitation.</p> :
      profile.value ? <StarterInvitation userId={userId} profile={profile.value} reply={query.get("reply")} photo={query.get("photo")} topics={me.topics} onDirty={setDirty} onBusy={setBusy}
        onInvited={id => { setDirty(false); router.push(`/connections/${encodeURIComponent(id)}`); }}/> :
        <p role="status">Opening invitation…</p>}
  </>;
}
