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
    <AccountProfile key={session.data.user.id} userId={session.data.user.id} />
  );
}
function AccountProfile({ userId }: { userId: string }) {
  const { profile, setProfile, error, retry } = useProfile(userId);
  const [dirty, setDirty] = useState<Record<string, boolean>>({}),
    [signOutError, setSignOutError] = useState("");
  const router = useRouter();
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
    if (await confirmLeave()) router.push(path);
  };
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <strong>LockedIn · Just for you</strong>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => leave("/journey")}
          >
            ← Back to our space
          </button>
        </header>
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
                <h1>Profile & settings</h1>
                <p>A little space that’s just yours.</p>
              </div>
            </div>
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
              <ProfileMatchingSettings userId={userId} onOpen={() => void leave("/discover/matching")} />
              <InvitationBlocks />
            </section>
            <section className={styles.card}>
              <h2>Your account</h2>
              <p>
                Signing out does not delete your account or your conversations.
              </p>
              <button
                type="button"
                className={styles.textButton}
                onClick={async () => {
                  if (!(await confirmLeave())) return;
                  setSignOutError("");
                  try {
                    const result = await authClient.signOut();
                    if (result.error)
                      throw Error("Unable to sign out. Please try again.");
                    router.replace("/login");
                  } catch (e) {
                    resetApproval();
                    setSignOutError(
                      e instanceof Error ? e.message : "Unable to sign out.",
                    );
                  }
                }}
              >
                Sign out
              </button>
              {signOutError ? <p role="alert">{signOutError}</p> : null}
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
    </div>
  );
}
