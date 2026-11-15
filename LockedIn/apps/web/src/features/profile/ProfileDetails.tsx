"use client";
import { useEffect, useState } from "react";
import type { Profile, AvatarPreset } from "./profile.types";
import { saveProfileDetails } from "./profile.client";
import ProfileAvatar, { avatarChoices } from "./ProfileAvatar";
import styles from "./profile.module.scss";
export default function ProfileDetails({
  profile,
  onSaved,
  onDirty,
}: {
  profile: Profile;
  onSaved: (profile: Profile) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [name, setName] = useState(profile.displayName);
  const [preset, setPreset] = useState<AvatarPreset>(profile.avatarPreset);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const dirty = name !== profile.displayName || preset !== profile.avatarPreset;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  return (
    <section className={styles.card} aria-labelledby="profile-details">
      <h2 id="profile-details">Your details</h2>
      <p>
        Your profile is private. Your chosen name and avatar appear to your
        partner.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          setMessage("");
          if (!name.trim() || name.trim().length > 80) {
            setError("Enter a name between 1 and 80 characters.");
            return;
          }
          setBusy(true);
          try {
            const saved = await saveProfileDetails(
              { displayName: name.trim(), avatarPreset: preset },
              profile.id,
            );
            setName(saved.displayName);
            onSaved(saved);
            setMessage("Your details are saved.");
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Unable to save details.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <label className={styles.field}>
            Preferred name
            <input
              value={name}
              maxLength={80}
              required
              autoComplete="nickname"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <fieldset className={styles.avatarField}>
            <legend>Choose your avatar</legend>
            <div className={styles.avatarChoices}>
              {avatarChoices.map((choice) => (
                <label key={choice.id} className={styles.avatarChoice}>
                  <input
                    type="radio"
                    name="avatar"
                    value={choice.id}
                    checked={preset === choice.id}
                    onChange={() => setPreset(choice.id)}
                  />
                  <ProfileAvatar name={name} preset={choice.id} />
                  <span>{choice.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className={styles.hint}>
            Choose Initials to reset your avatar. No photo upload is needed.
          </p>
          <button className={styles.primary} disabled={!dirty || busy}>
            {busy ? "Saving…" : "Save details"}
          </button>
        </fieldset>
      </form>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
