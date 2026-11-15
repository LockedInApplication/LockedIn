"use client";
import { OwnedInvitationBlocks } from "./InvitationManagerContent";
import { useInvitationList } from "./use-invitation-list";
import type { OwnedInvitationBlock } from "./invitation-management.types";
import managementStyles from "./invitation-management.module.scss";
export default function InvitationBlocks({
  revision = 0,
}: {
  revision?: number;
}) {
  const blocks = useInvitationList<OwnedInvitationBlock>(
    "/api/journey/invitation-blocks",
    revision,
  );
  return (
    <section className={managementStyles.section} aria-labelledby="own-invitation-blocks">
      <h2 id="own-invitation-blocks">People you’ve blocked from invitations</h2>
      <p className={managementStyles.note}>
        These settings are private to you. They only affect invitations, not any
        existing shared space.
      </p>
      {blocks.error ? (
        <div role="alert">
          <p>{blocks.error}</p>
          <button type="button" onClick={blocks.reload}>
            Try again
          </button>
        </div>
      ) : null}
      {blocks.loading && !blocks.items.length ? (
        <p role="status">Loading your settings…</p>
      ) : null}
      {!blocks.loading && !blocks.error && !blocks.items.length ? (
        <p>No invitation blocks added.</p>
      ) : null}
      <OwnedInvitationBlocks
        items={blocks.items}
        busy={blocks.busy}
        onUnblock={(id) => {
          if (
            window.confirm(
              "Remove your invitation block? This will not reconnect you or restore old invitations.",
            )
          )
            void blocks.mutate(
              `/api/journey/invitation-blocks/${encodeURIComponent(id)}`,
              "DELETE",
            );
        }}
      />
      {blocks.nextCursor ? (
        <button
          type="button"
          disabled={blocks.loading || blocks.busy}
          onClick={blocks.more}
        >
          More settings
        </button>
      ) : null}
    </section>
  );
}
