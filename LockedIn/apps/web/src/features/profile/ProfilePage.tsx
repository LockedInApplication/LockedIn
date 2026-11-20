"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/utils/authCLient";
import { useProfile } from "./use-profile";
import ProfileAvatar from "./ProfileAvatar";
import ProfileDetails from "./ProfileDetails";
import ProfileSecurity from "./ProfileSecurity";
import ProfileNotifications from "./ProfileNotifications";
import ProfileMatchingSettings from "./ProfileMatchingSettings";
import ProfileDeletion from "./ProfileDeletion";
import InvitationBlocks from "@/features/invitations/InvitationBlocks";
import styles from "./profile.module.scss";
import { useProfileLeaveGuard } from "./use-profile-leave-guard";
import ConfirmDialog from "@/components/ConfirmDialog";
import MemberChrome from "@/features/journey/components/MemberChrome";
import { notificationDestination } from "@/features/notifications";
import { discoveryRequest } from "@/features/discovery/discovery.client";
import type { DiscoveryMe } from "@/features/discovery/discovery.types";
import { useDiscoveryResource } from "@/features/discovery/use-discovery-resource";
const ignoreActivity = () => {};
export default function ProfilePage() {
  const session = authClient.useSession();
  const router = useRouter();
  useEffect(() => {
    if (!session.isPending && !session.data?.user)
      router.replace("/login?returnTo=%2Fprofile");
  }, [session.isPending, session.data?.user, router]);
  if (session.isPending || !session.data?.user)
    return (
      <main className={styles.page}>
        <p role="status">Loading your profile…</p>
      </main>
    );
  return (
    <AccountProfile key={session.data.user.id} userId={session.data.user.id} name={session.data.user.name || "Your account"} />
  );
}
function AccountProfile({ userId, name }: { userId: string; name: string }) {
  const { profile, setProfile, error, retry } = useProfile(userId);
  const [dirty, setDirty] = useState<Record<string, boolean>>({}),
    [signOutError, setSignOutError] = useState("");
  const router = useRouter();
  const expired = useCallback(() => router.replace("/login?returnTo=%2Fprofile"), [router]);
  const readAccess = useCallback((signal: AbortSignal) => discoveryRequest<DiscoveryMe>(userId, "/api/discovery/me", { signal }), [userId]);
  const access = useDiscoveryResource(userId, "profile-links", readAccess).value;
  const updateDirty = useCallback(
    (section: string, value: boolean) =>
      setDirty((old) =>
        old[section] === value ? old : { ...old, [section]: value },
      ),
    [],
  );
  const hasDirty = Object.values(dirty).some(Boolean);
  const { confirmLeave, resetApproval, allowLeave, dialog } =
    useProfileLeaveGuard(hasDirty);
  const leave = async (path: string) => {
    if (!await confirmLeave()) return false;
    router.push(path);
    return true;
  };
  const signOut = async () => {
    if (!(await confirmLeave())) return;
    setSignOutError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw Error("Unable to sign out. Please try again.");
      router.replace("/login");
    } catch (e) {
      resetApproval();
      setSignOutError(e instanceof Error ? e.message : "Unable to sign out.");
    }
  };
  return (
    <MemberChrome className={styles.page} userId={userId} user={{ name: profile?.displayName || name, avatarPreset: profile?.avatarPreset }}
      onNavigate={leave} onSignOut={signOut} onOpenNotification={item=>leave(notificationDestination(item))} onActivity={ignoreActivity} onExpired={expired}>
      <main className={styles.main}>
        {signOutError ? <p role="alert">{signOutError}</p> : null}
        {error ? (
          <div role="alert">
            <p>{error}</p>
            <button type="button" onClick={retry}>
              Try again
            </button>
          </div>
        ) : null}
        {!profile && !error ? (
          <p role="status">Loading your settings…</p>
        ) : null}
        {profile ? (
          <>
            <div className={styles.intro}>
              <ProfileAvatar
                name={profile.displayName}
                preset={profile.avatarPreset}
              />
              <div>
                <h1>Profile &amp; settings</h1>
                <p>Manage what others see and what you keep to yourself.</p>
              </div>
            </div>
            <section className={styles.card} aria-labelledby="profile-shortcuts">
              <h2 id="profile-shortcuts">Personal settings</h2>
              <p><button type="button" className={styles.textButton} onClick={()=>void leave("/your-space")}>Private reflection</button> · Only you can see what you write.</p>
              {access?.canManageProfile || access?.canDiscover ? <p><button type="button" className={styles.textButton} onClick={()=>void leave("/discover/profile")}>My Discovery profile</button> · Edit what people can see or pause visibility.</p> : null}
              <ProfileMatchingSettings userId={userId} onOpen={() => void leave("/discover/matching")} />
            </section>
            <ProfileDetails
              profile={profile}
              onSaved={setProfile}
              onDirty={(value) => updateDirty("details", value)}
            />
            <ProfileSecurity
              profile={profile}
              onLeave={leave}
              onDirty={(value) => updateDirty("security", value)}
            />
            <ProfileNotifications
              profile={profile}
              onSaved={setProfile}
              onDirty={(value) => updateDirty("notifications", value)}
            />
            <section className={styles.card} aria-labelledby="profile-privacy">
              <h2 id="profile-privacy">Privacy & safety</h2>
              <InvitationBlocks />
              {access?.canModerate?<button type="button" className={styles.textButton} onClick={()=>void leave("/discovery/moderation")}>Moderation</button>:null}
            </section>
            <ProfileDeletion userId={userId} onDeleted={() => {
              // The deletion already revoked all server sessions. A full navigation
              // also discards in-memory account data, regardless of cookie cleanup.
              allowLeave();
              window.location.replace("/login");
            }} />
          </>
        ) : null}
      </main>
      <ConfirmDialog
        {...dialog}
        title="Leave without saving?"
        description="You have unsaved changes. Stay to keep editing, or leave and discard those changes."
        cancelLabel="Keep editing"
        confirmLabel="Leave without saving"
      />
    </MemberChrome>
  );
}
