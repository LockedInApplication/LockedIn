"use client";

import { useState } from "react";
import styles from "@/app/journey/journey.module.scss";
import { journeyRequest } from "@/features/journey/journey.client";
import { getAtlasChoiceState } from "./atlas.state";
import type { AtlasChapter, AtlasWord } from "./atlas.types";

export type AtlasDefinitionConvergenceProps = {
  word: AtlasWord;
  chapter: AtlasChapter;
  partnerName: string;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
};

export default function AtlasDefinitionConvergence({
  word,
  chapter,
  partnerName,
  busy,
  runAction,
}: AtlasDefinitionConvergenceProps) {
  const [personalDraft, setPersonalDraft] = useState("");
  const [bridgeDraft, setBridgeDraft] = useState("");
  const [revisionDraft, setRevisionDraft] = useState(chapter.sharedDefinition ?? "");
  const ownProposal = chapter.proposals.find((proposal) => proposal.proposedByCurrentUser);
  const partnerProposal = chapter.proposals.find((proposal) => !proposal.proposedByCurrentUser);
  const choiceState = getAtlasChoiceState(chapter);
  const bothProposals = Boolean(ownProposal && partnerProposal);

  const choose = (mode: "PROPOSAL" | "BLEND" | "KEEP_BOTH", proposalId?: string) =>
    runAction(
      () => journeyRequest(`/api/journey/atlas/${chapter.id}/shared-definition/select`, {
        method: "POST",
        body: JSON.stringify({ mode, proposalId: proposalId ?? null }),
      }),
      "Your preference is saved. The next step opens after both people choose.",
    );

  const resolve = (definition: string, kind: "BLEND" | "REVISION" | "PAIRED") =>
    runAction(
      () => journeyRequest(`/api/journey/atlas/${chapter.id}/shared-definition/resolve`, {
        method: "PUT",
        body: JSON.stringify({
          definition,
          kind,
          expectedVersion: chapter.candidateVersion,
        }),
      }),
      "A new shared draft is ready for both people to review.",
    );

  if (!bothProposals) {
    if (ownProposal) {
      return (
        <section className={styles.atlasSharedBuilder}>
          <span className={styles.atlasStageLabel}>YOUR WORDING IS PRESERVED</span>
          <h3>Your proposal is waiting beside an empty space.</h3>
          <blockquote>“{ownProposal.definition}”</blockquote>
          <p>
            {partnerName} will write independently. Neither proposal replaces the other, and
            you will see both only after both are ready.
          </p>
          <div className={styles.atlasProposalWait}><span>You ✓</span><i>＋</i><span>{partnerName} …</span></div>
        </section>
      );
    }

    return (
      <form
        className={styles.atlasSharedBuilder}
        onSubmit={(event) => {
          event.preventDefault();
          if (personalDraft.trim().length < 8) return;
          runAction(
            () => journeyRequest(`/api/journey/atlas/${chapter.id}/shared-definition`, {
              method: "PUT",
              body: JSON.stringify({ definition: personalDraft }),
            }),
            "Your proposal is preserved privately until both proposals are ready.",
          );
        }}
      >
        <span className={styles.atlasStageLabel}>YOUR PROPOSAL · WRITTEN INDEPENDENTLY</span>
        <h3>How would you describe “{word.title}” for the two of you?</h3>
        <p>
          Offer one possible shared definition. {partnerName} will create theirs separately;
          both originals will remain visible during the choice.
        </p>
        <textarea value={personalDraft} onChange={(event) => setPersonalDraft(event.target.value)} maxLength={500} placeholder={`For us, ${word.title.toLowerCase()} could mean…`} />
        <button className={styles.atlasPrimary} disabled={busy || personalDraft.trim().length < 8}>
          {busy ? "Preserving..." : "Preserve my proposal"}
        </button>
      </form>
    );
  }

  const settledOwnProposal = ownProposal as NonNullable<typeof ownProposal>;
  const settledPartnerProposal = partnerProposal as NonNullable<typeof partnerProposal>;
  const crossedChoice = choiceState === "crossed";
  const separateChoice = choiceState === "separate";

  return (
    <section className={styles.atlasConvergence}>
      <header>
        <span className={styles.atlasStageLabel}>TWO PROPOSALS · NEITHER IS THE DEFAULT</span>
        <h3>Two ways to say what “{word.title}” could mean.</h3>
        <p>Choose a wording, ask to blend them, or keep both. Your choice is not a vote against your partner.</p>
      </header>

      <div className={styles.atlasProposalPair}>
        {[settledOwnProposal, settledPartnerProposal].map((proposal) => (
          <article key={proposal.id}>
            <span>{proposal.proposedByCurrentUser ? "Your wording" : `${proposal.proposedByName}’s wording`}</span>
            <blockquote>“{proposal.definition}”</blockquote>
            {chapter.status === "CHOOSING" && !chapter.ownSelection ? (
              <button disabled={busy} onClick={() => choose("PROPOSAL", proposal.id)}>
                Choose this wording
              </button>
            ) : null}
          </article>
        ))}
      </div>

      {chapter.status === "CHOOSING" ? (
        chapter.ownSelection ? (
          <div className={styles.atlasChoiceWaiting}>
            <span>✓</span>
            <div><strong>Your choice is saved privately.</strong><p>Waiting for {partnerName}; neither selection is treated as the winner yet.</p></div>
          </div>
        ) : (
          <div className={styles.atlasChoiceAlternatives}>
            <button disabled={busy} onClick={() => choose("BLEND")}>◇ Build a blended version</button>
            <button disabled={busy} onClick={() => choose("KEEP_BOTH")}>↔ Keep both meanings together</button>
          </div>
        )
      ) : null}

      {chapter.status === "RESOLVING" ? (
        <div className={styles.atlasBlendStudio}>
          <div className={styles.atlasBlendMessage}>
            <span>{crossedChoice ? "♥" : separateChoice ? "↔" : "◇"}</span>
            <div>
              <strong>
                {crossedChoice
                  ? "You chose each other’s words."
                  : separateChoice
                    ? "You each chose your own wording."
                    : "You chose different paths forward."}
              </strong>
              <p>
                {crossedChoice
                  ? "That is mutual recognition—not a tie. No winner is selected; build the bridge explicitly."
                  : "Nothing is overwritten. Create a bridge or preserve both meanings side by side."}
              </p>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (bridgeDraft.trim().length >= 8) resolve(bridgeDraft, "BLEND");
            }}
          >
            <label htmlFor={`blend-${chapter.id}`}>Blend Studio</label>
            <textarea id={`blend-${chapter.id}`} value={bridgeDraft} onChange={(event) => setBridgeDraft(event.target.value)} maxLength={800} placeholder="A version that carries something true from both could be…" />
            <button className={styles.atlasPrimary} disabled={busy || bridgeDraft.trim().length < 8}>Offer this blend</button>
          </form>
          <button
            className={styles.atlasKeepBoth}
            disabled={busy}
            onClick={() => resolve(`${settledOwnProposal.definition}\n\n—and—\n\n${settledPartnerProposal.definition}`, "PAIRED")}
          >
            Keep both as a paired definition
          </button>
        </div>
      ) : null}

      {chapter.status === "PROPOSED" && chapter.sharedDefinition ? (
        <div className={styles.atlasFinalDraft}>
          <span className={styles.atlasStageLabel}>FINAL DRAFT · VERSION {chapter.candidateVersion}</span>
          <h3>Does this exact wording belong to both of you?</h3>
          <blockquote>“{chapter.sharedDefinition}”</blockquote>
          <div className={styles.atlasApprovalKeys}>
            <span className={chapter.ownFinalApproval ? styles.atlasApprovalReady : ""}>You {chapter.ownFinalApproval ? "✓" : "○"}</span>
            <i>＋</i>
            <span className={chapter.partnerFinalApproval ? styles.atlasApprovalReady : ""}>{partnerName} {chapter.partnerFinalApproval ? "✓" : "○"}</span>
          </div>
          {!chapter.ownFinalApproval ? (
            <button
              className={styles.atlasPrimary}
              disabled={busy}
              onClick={() => runAction(
                () => journeyRequest(`/api/journey/atlas/${chapter.id}/shared-definition/approve`, {
                  method: "POST",
                  body: JSON.stringify({ candidateVersion: chapter.candidateVersion }),
                }),
                "Your approval is saved on this exact version.",
              )}
            >
              Approve this exact wording
            </button>
          ) : <p className={styles.atlasApprovalWait}>Your key is in. Waiting for {partnerName}.</p>}

          <details className={styles.atlasRevisionStudio}>
            <summary>Almost—suggest a change instead</summary>
            <p>A revision creates a new version and asks both people to approve again.</p>
            <textarea value={revisionDraft} onChange={(event) => setRevisionDraft(event.target.value)} maxLength={800} />
            <button disabled={busy || revisionDraft.trim().length < 8 || revisionDraft.trim() === chapter.sharedDefinition.trim()} onClick={() => resolve(revisionDraft, "REVISION")}>
              Offer revised wording
            </button>
          </details>
        </div>
      ) : null}
    </section>
  );
}
