"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import BrandLogo from "@/components/brandLogo";
import { authClient } from "@/utils/authCLient";
import {
  AlignmentItem,
  AtlasChapter,
  AtlasWord,
  ConversationPack,
  JourneyApiError,
  JourneyNextStep,
  JourneyOverview,
  JourneySession,
  journeyRequest,
} from "@/lib/journey";
import {
  addDays,
  daysUntil,
  formatDate,
  getProgress,
  initials,
} from "@/features/journey/journey.utils";
import styles from "./journey.module.scss";

type Notice = { tone: "success" | "error"; message: string } | null;
type WorkspaceView = "home" | "conversations" | "atlas" | "roadmap" | "chapters";

export default function JourneyWorkspace() {
  const router = useRouter();
  const [overview, setOverview] = useState<JourneyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [inviteLink, setInviteLink] = useState("");
  const [activeView, setActiveView] = useState<WorkspaceView>("home");
  const inviteHandled = useRef(false);

  const loadOverview = useCallback(async () => {
    try {
      const data = await journeyRequest<JourneyOverview>("/api/journey/overview");
      setOverview(data);
    } catch (error) {
      if (error instanceof JourneyApiError && error.status === 401) {
        router.replace("/login?returnTo=/journey");
        return;
      }
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to load your journey.",
      });
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const token = new URLSearchParams(window.location.search).get("invite");
      if (token && !inviteHandled.current) {
        inviteHandled.current = true;
        try {
          await journeyRequest(`/api/journey/invites/${encodeURIComponent(token)}/accept`, {
            method: "POST",
          });
          window.history.replaceState({}, "", "/journey");
          if (!cancelled) {
            setNotice({ tone: "success", message: "You are connected. Your shared space is ready." });
          }
        } catch (error) {
          if (error instanceof JourneyApiError && error.status === 401) {
            router.replace(`/login?returnTo=${encodeURIComponent(`/journey?invite=${token}`)}`);
            return;
          }
          if (!cancelled) {
            setNotice({
              tone: "error",
              message: error instanceof Error ? error.message : "Unable to accept this invitation.",
            });
          }
        }
      }

      if (!cancelled) await loadOverview();
    }

    initialize();
    return () => {
      cancelled = true;
    };
  }, [loadOverview, router]);

  const runAction = useCallback(
    async (action: () => Promise<unknown>, successMessage?: string) => {
      setBusy(true);
      setNotice(null);
      try {
        await action();
        if (successMessage) setNotice({ tone: "success", message: successMessage });
        await loadOverview();
      } catch (error) {
        setNotice({
          tone: "error",
          message: error instanceof Error ? error.message : "Something went wrong.",
        });
      } finally {
        setBusy(false);
      }
    },
    [loadOverview],
  );

  async function handleInvite(email: string) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await journeyRequest<{ token: string }>("/api/journey/invites", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      const link = `${window.location.origin}/journey?invite=${result.token}`;
      setInviteLink(link);
      await navigator.clipboard?.writeText(link).catch(() => undefined);
      setNotice({
        tone: "success",
        message: "Invitation created. The private link is ready to share with your partner.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to create the invitation.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <main className={styles.loadingPage}>
        <div className={styles.loadingMark}><BrandLogo /></div>
        <p>Preparing your private space...</p>
      </main>
    );
  }

  if (!overview) {
    return (
      <main className={styles.loadingPage}>
        <h1>We could not open your journey.</h1>
        <button onClick={loadOverview}>Try again</button>
      </main>
    );
  }

  const progress = getProgress(overview);
  const startConversation = (packKey: string | null) => {
    if (!overview.relationship) return;
    runAction(
      async () => {
        const result = await journeyRequest<{ started: boolean }>(
          `/api/journey/relationships/${overview.relationship?.id}/conversation-choice`,
          {
          method: "POST",
            body: JSON.stringify({ packKey }),
          },
        );
        if (result.started) setActiveView("home");
        return result;
      },
      "Your choice is saved. A check-in begins only when you both choose the same conversation.",
    );
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="LockedIn home">
          <span className={styles.brandMark}><BrandLogo /></span>
          <span>LockedIn</span>
        </Link>
        <div className={styles.headerActions}>
          <span className={styles.privacyPill}>Private by default</span>
          <button className={styles.textButton} onClick={signOut}>Sign out</button>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.intro}>
          <div>
            <span className={styles.eyebrow}>YOUR SHARED ROADMAP</span>
            <h1>Build the relationship you both choose.</h1>
            <p>
              Reflect privately, reveal only what feels right, and turn one important
              conversation into an evolving roadmap you both accept.
            </p>
          </div>
          <div className={styles.memberCard}>
            <span className={styles.avatar}>{initials(overview.user.name || overview.user.email)}</span>
            <div>
              <strong>{overview.user.name || "Your space"}</strong>
              <span>{overview.relationship ? `Connected with ${overview.relationship.partner.name}` : "Start privately"}</span>
            </div>
          </div>
        </section>

        {overview.relationship ? (
          <WorkspaceNav active={activeView} onChange={setActiveView} />
        ) : (
          <ProgressRail current={progress} />
        )}

        {notice ? (
          <div className={`${styles.notice} ${notice.tone === "error" ? styles.noticeError : ""}`}>
            {notice.message}
          </div>
        ) : null}

        {!overview.relationship ? (
          <ConnectionStage
            pendingInvites={overview.pendingInvites}
            inviteLink={inviteLink}
            busy={busy}
            onInvite={handleInvite}
            onAccept={(token) =>
              runAction(
                () => journeyRequest(`/api/journey/invites/${token}/accept`, { method: "POST" }),
                "You are connected. Your shared space is ready.",
              )
            }
          />
        ) : activeView === "conversations" ? (
          <ConversationLibrary
            packs={overview.conversationPacks}
            selection={overview.conversationSelection}
            currentPackKey={overview.session?.packKey ?? null}
            canStart={!overview.session || overview.session.bothRevealed}
            busy={busy}
            onStart={startConversation}
            onWithdraw={() =>
              runAction(
                () =>
                  journeyRequest(
                    `/api/journey/relationships/${overview.relationship?.id}/conversation-choice`,
                    { method: "DELETE" },
                  ),
                "Your conversation suggestion was withdrawn.",
              )
            }
          />
        ) : activeView === "atlas" ? (
          <AtlasView
            words={overview.atlas.words}
            relationshipId={overview.relationship.id}
            partnerName={overview.relationship.partner.name}
            busy={busy}
            runAction={runAction}
          />
        ) : activeView === "roadmap" ? (
          <RoadmapView session={overview.session} busy={busy} runAction={runAction} />
        ) : activeView === "chapters" ? (
          overview.session ? (
            <CheckInTimeline
              partnerName={overview.relationship.partner.name}
              session={overview.session}
              history={overview.checkInHistory}
              onChooseConversation={() => setActiveView("conversations")}
            />
          ) : (
            <EmptyWorkspace title="Your first chapter begins with a conversation." detail="Choose a guided conversation to start answering privately." onAction={() => setActiveView("conversations")} />
          )
        ) : (
          <>
            <SharedJourneyPath
              session={overview.session}
              historyCount={overview.checkInHistory.length}
              partnerName={overview.relationship.partner.name}
              onNavigate={setActiveView}
              onFocusCurrent={() =>
                document.getElementById("current-action")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
              }
            />
            {overview.session ? (
              <div id="current-action" className={styles.currentActionStage}>
                <SessionStage session={overview.session} busy={busy} runAction={runAction} />
              </div>
            ) : null}
          </>
        )}

        {overview.relationship ? (
          <section className={styles.safetyBar}>
            <div>
              <strong>Your participation is always voluntary.</strong>
              <span>You can leave this shared space without completing the roadmap.</span>
            </div>
            <button
              disabled={busy}
              onClick={() => {
                if (!window.confirm("Leave this shared relationship space? This ends the space for both people.")) return;
                runAction(
                  () =>
                    journeyRequest(`/api/journey/relationships/${overview.relationship?.id}/leave`, {
                      method: "POST",
                    }),
                  "You have left the shared space.",
                );
              }}
            >
              Leave shared space
            </button>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function ProgressRail({ current }: { current: number }) {
  const steps = ["Connect", "Reflect", "Reveal", "Choose", "Revisit"];
  return (
    <ol className={styles.progressRail} aria-label="Journey progress">
      {steps.map((step, index) => (
        <li key={step} className={index < current ? styles.progressDone : index === current ? styles.progressCurrent : ""}>
          <span>{index < current ? "✓" : index + 1}</span>
          <small>{step}</small>
        </li>
      ))}
    </ol>
  );
}

function WorkspaceNav({
  active,
  onChange,
}: {
  active: WorkspaceView;
  onChange: (view: WorkspaceView) => void;
}) {
  const items: Array<{ key: WorkspaceView; label: string; icon: string }> = [
    { key: "home", label: "Home", icon: "⌂" },
    { key: "conversations", label: "Conversations", icon: "◎" },
    { key: "atlas", label: "Atlas", icon: "✦" },
    { key: "roadmap", label: "Roadmap", icon: "↗" },
    { key: "chapters", label: "Chapters", icon: "◌" },
  ];

  return (
    <nav className={styles.workspaceNav} aria-label="Relationship workspace">
      {items.map((item) => (
        <button
          key={item.key}
          className={active === item.key ? styles.workspaceNavActive : ""}
          onClick={() => onChange(item.key)}
        >
          <span>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </nav>
  );
}

type JourneyMilestoneState = "complete" | "current" | "waiting" | "upcoming";

function SharedJourneyPath({
  session,
  historyCount,
  partnerName,
  onNavigate,
  onFocusCurrent,
}: {
  session: JourneySession | null;
  historyCount: number;
  partnerName: string;
  onNavigate: (view: WorkspaceView) => void;
  onFocusCurrent: () => void;
}) {
  const reflectionComplete = Boolean(
    session?.ownResponse && session.partnerState.submitted,
  );
  const revealComplete = Boolean(session?.bothRevealed);
  const planChosen = Boolean(session?.nextSteps.length);
  const revisitComplete = Boolean(
    session?.nextSteps.length &&
      session.nextSteps.every(
        (step) => step.ownReflection && step.partnerReflection.submitted,
      ),
  );

  const reflectionState: JourneyMilestoneState = !session
    ? "upcoming"
    : reflectionComplete
      ? "complete"
      : session.ownResponse
        ? "waiting"
        : "current";
  const revealState: JourneyMilestoneState = !reflectionComplete
    ? "upcoming"
    : revealComplete
      ? "complete"
      : session?.ownResponse?.revealConsented
        ? "waiting"
        : "current";
  const planState: JourneyMilestoneState = !revealComplete
    ? "upcoming"
    : planChosen
      ? "complete"
      : "current";
  const revisitState: JourneyMilestoneState = !planChosen
    ? "upcoming"
    : revisitComplete
      ? "complete"
      : "current";

  const milestones: Array<{
    title: string;
    detail: string;
    action: string;
    icon: string;
    state: JourneyMilestoneState;
    onClick: () => void;
  }> = [
    {
      title: "Connected",
      detail: `Your private space with ${partnerName}`,
      action: "Together",
      icon: "✓",
      state: "complete",
      onClick: () => undefined,
    },
    {
      title: session ? session.topic : "Choose a conversation",
      detail: session ? "Your shared topic is set" : "Pick what matters to both of you",
      action: session ? "Change topic" : "Choose a topic",
      icon: "◎",
      state: session ? "complete" : "current",
      onClick: () => onNavigate("conversations"),
    },
    {
      title: "Reflect privately",
      detail:
        reflectionState === "waiting"
          ? `Waiting for ${partnerName}`
          : reflectionState === "complete"
            ? "Both private reflections are ready"
            : "Answer without seeing each other",
      action: reflectionState === "waiting" ? "Your part is done" : "Open reflection",
      icon: "✎",
      state: reflectionState,
      onClick: session ? onFocusCurrent : () => onNavigate("conversations"),
    },
    {
      title: "Reveal by choice",
      detail:
        revealState === "waiting"
          ? `${partnerName} still has full privacy`
          : revealState === "complete"
            ? "Shared ground is now visible"
            : "Open only what you both consent to",
      action: revealState === "complete" ? "View shared ground" : "Continue",
      icon: "↗",
      state: revealState,
      onClick: session ? onFocusCurrent : () => onNavigate("conversations"),
    },
    {
      title: "Choose a next step",
      detail: planChosen
        ? `${session?.nextSteps.length} shared step${session?.nextSteps.length === 1 ? "" : "s"} in motion`
        : "Turn clarity into something you both accept",
      action: planChosen ? "See your roadmap" : "Choose together",
      icon: "◇",
      state: planState,
      onClick: () => onNavigate("roadmap"),
    },
    {
      title: "Revisit together",
      detail: revisitComplete
        ? "You both reflected on every step"
        : planChosen
          ? "Return when the moment you chose arrives"
          : "Your path will keep growing here",
      action: planChosen ? "Open next steps" : "Later",
      icon: "↻",
      state: revisitState,
      onClick: () => onNavigate("roadmap"),
    },
  ];

  const activeMilestoneIndex = milestones.findIndex(
    (milestone) =>
      milestone.state === "current" || milestone.state === "waiting",
  );
  const currentIndex =
    activeMilestoneIndex === -1 ? milestones.length - 1 : activeMilestoneIndex;
  const pathProgress = Math.max(0, Math.min(100, (currentIndex / 5) * 100));
  const currentMilestone = milestones[currentIndex];

  return (
    <section className={styles.journeyMap} aria-labelledby="journey-map-title">
      <header className={styles.journeyMapHeader}>
        <div>
          <span className={styles.eyebrow}>YOUR SHARED PATH</span>
          <h2 id="journey-map-title">One step at a time.</h2>
          <p>The path moves only when both voices are ready.</p>
        </div>
        <div className={styles.mapStatus}>
          <div className={styles.mapPair} aria-label={`You and ${partnerName}`}>
            <span className={styles.mapYou}>You</span>
            <i />
            <span className={styles.mapPartner}>{initials(partnerName)}</span>
          </div>
          <strong>{currentMilestone?.title}</strong>
          <small>{historyCount + (revealComplete ? 1 : 0)} chapter{historyCount + (revealComplete ? 1 : 0) === 1 ? "" : "s"} so far</small>
        </div>
      </header>

      <div
        className={styles.pathCanvas}
        style={{ "--mobile-progress": `${pathProgress}%` } as CSSProperties}
      >
        <div className={styles.pathGlowOne} aria-hidden />
        <div className={styles.pathGlowTwo} aria-hidden />
        <svg
          className={styles.pathSvg}
          viewBox="0 0 600 760"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
        >
          <path
            className={styles.pathBase}
            d="M300 52 C300 105 178 96 178 174 C178 256 422 240 422 326 C422 410 178 390 178 478 C178 562 422 548 422 630 C422 690 344 704 300 724"
            pathLength="100"
          />
          <path
            className={styles.pathProgress}
            d="M300 52 C300 105 178 96 178 174 C178 256 422 240 422 326 C422 410 178 390 178 478 C178 562 422 548 422 630 C422 690 344 704 300 724"
            pathLength="100"
            style={{ strokeDashoffset: 100 - pathProgress }}
          />
        </svg>

        <ol className={styles.milestoneList}>
          {milestones.map((milestone, index) => (
            <li
              key={milestone.title}
              className={`${styles.milestone} ${styles[`milestone_${index}`]} ${styles[`milestone_${milestone.state}`]}`}
            >
              <button
                className={styles.milestoneButton}
                onClick={milestone.onClick}
                aria-current={milestone.state === "current" ? "step" : undefined}
              >
                <span className={styles.milestoneNode}>
                  <span>{milestone.state === "complete" ? "✓" : milestone.icon}</span>
                </span>
                <span className={styles.milestoneCard}>
                  <small>
                    {milestone.state === "complete"
                      ? "Complete"
                      : milestone.state === "waiting"
                        ? "Waiting together"
                        : milestone.state === "current"
                          ? "You are here"
                          : "Coming up"}
                  </small>
                  <strong>{milestone.title}</strong>
                  <span>{milestone.detail}</span>
                  <em>{milestone.action} <b>→</b></em>
                  {milestone.state === "waiting" ? (
                    <span className={styles.waitingPair} aria-hidden>
                      <i className={styles.waitingYou}>Y</i>
                      <i className={styles.waitingPartner}>{initials(partnerName)}</i>
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ConversationLibrary({
  packs,
  selection,
  currentPackKey,
  canStart,
  busy,
  onStart,
  onWithdraw,
}: {
  packs: ConversationPack[];
  selection: JourneyOverview["conversationSelection"];
  currentPackKey: string | null;
  canStart: boolean;
  busy: boolean;
  onStart: (packKey: string | null) => void;
  onWithdraw: () => void;
}) {
  const packName = (packKey: string | null) =>
    packKey === null
      ? "Either conversation"
      : packs.find((pack) => pack.key === packKey)?.title ?? "A conversation";

  return (
    <section className={styles.librarySection}>
      <div className={styles.libraryHeader}>
        <div>
          <span className={styles.eyebrow}>GUIDED CONVERSATIONS</span>
          <h2>Choose what matters now.</h2>
          <p>Each topic starts privately. Answers and written context are shared only with fresh consent.</p>
        </div>
        {!canStart ? <span className={styles.inProgressPill}>Finish your current check-in first</span> : null}
      </div>
      {canStart ? (
        <div className={styles.choiceBoard}>
          <div>
            <span className={styles.eyebrow}>CHOOSE TOGETHER</span>
            <h3>No conversation begins until both choices meet.</h3>
            <p>
              Suggest a topic, accept your partner&apos;s suggestion, choose another, or say
              that either works for you.
            </p>
          </div>
          <div className={styles.choiceStates}>
            <div>
              <span>You</span>
              <strong>{selection?.ownChoice.submitted ? packName(selection.ownChoice.packKey) : "No choice yet"}</strong>
              {selection?.ownChoice.submitted ? <button onClick={onWithdraw} disabled={busy}>Withdraw</button> : null}
            </div>
            <div>
              <span>{selection?.partnerChoice.name ?? "Your partner"}</span>
              <strong>{selection?.partnerChoice.submitted ? packName(selection.partnerChoice.packKey) : "Waiting for their choice"}</strong>
            </div>
          </div>
          <button
            className={selection?.ownChoice.submitted && selection.ownChoice.packKey === null ? styles.eitherSelected : ""}
            disabled={busy}
            onClick={() => onStart(null)}
          >
            Either works for me
          </button>
        </div>
      ) : null}
      <div className={styles.packGrid}>
        {packs.map((pack) => (
          <article className={`${styles.packCard} ${styles[`pack_${pack.accent}`] ?? ""}`} key={pack.key}>
            <div className={styles.packIcon}>{pack.icon}</div>
            <div className={styles.packChoiceBadges}>
              {selection?.ownChoice.submitted && selection.ownChoice.packKey === pack.key ? <span>Your suggestion</span> : null}
              {selection?.partnerChoice.submitted && selection.partnerChoice.packKey === pack.key ? <span>{selection.partnerChoice.name}&apos;s suggestion</span> : null}
            </div>
            <span>{pack.questionCount} private prompts</span>
            <h3>{pack.title}</h3>
            <p>{pack.description}</p>
            <button
              disabled={busy || !canStart}
              onClick={() => onStart(pack.key)}
            >
              {currentPackKey === pack.key && !canStart
                ? "Current conversation"
                : selection?.partnerChoice.submitted &&
                    selection.partnerChoice.packKey === pack.key &&
                    selection.ownChoice.packKey !== pack.key
                  ? "Accept this suggestion"
                  : selection?.ownChoice.submitted && selection.ownChoice.packKey === pack.key
                    ? "Your suggestion"
                : busy
                  ? "Preparing..."
                  : "Suggest this conversation"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function AtlasView({
  words,
  relationshipId,
  partnerName,
  busy,
  runAction,
}: {
  words: AtlasWord[];
  relationshipId: string;
  partnerName: string;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
}) {
  const suggestedWord = words.find((word) => word.chapter && word.chapter.status !== "SHARED") ?? words[0];
  const [selectedKey, setSelectedKey] = useState(suggestedWord?.key ?? "support");
  const selectedWord = words.find((word) => word.key === selectedKey) ?? words[0];
  const completedCount = words.filter((word) => word.versionCount > 0).length;

  if (!selectedWord) return null;

  return (
    <section className={styles.atlasShell} aria-labelledby="atlas-title">
      <header className={styles.atlasHero}>
        <div>
          <span className={styles.atlasKicker}>THE ATLAS OF US</span>
          <h2 id="atlas-title">Same word. Two worlds. One meaning you build together.</h2>
          <p>
            Explore the everyday words that quietly shape a relationship. Each landmark opens
            privately and completes only when you both feel accurately understood.
          </p>
        </div>
        <div className={styles.atlasCompass} aria-label={`${completedCount} of ${words.length} landmarks explored`}>
          <span>✦</span>
          <strong>{completedCount}/{words.length}</strong>
          <small>shared landmarks</small>
        </div>
      </header>

      <div className={styles.atlasMap}>
        <svg className={styles.atlasTrail} viewBox="0 0 900 310" preserveAspectRatio="none" aria-hidden>
          <path d="M92 232 C215 52 330 56 443 166 C552 274 672 269 808 72" pathLength="100" />
          <path
            className={styles.atlasTrailProgress}
            d="M92 232 C215 52 330 56 443 166 C552 274 672 269 808 72"
            pathLength="100"
            style={{ strokeDashoffset: 100 - (completedCount / Math.max(words.length, 1)) * 100 }}
          />
        </svg>
        <div className={styles.atlasCloudOne} aria-hidden>☁</div>
        <div className={styles.atlasCloudTwo} aria-hidden>☁</div>
        {words.map((word, index) => {
          const active = word.key === selectedWord.key;
          const complete = word.chapter?.status === "SHARED";
          const inProgress = Boolean(word.chapter && !complete);
          return (
            <button
              key={word.key}
              className={`${styles.atlasLandmark} ${styles[`atlasLandmark_${index}`]} ${active ? styles.atlasLandmarkActive : ""} ${complete ? styles.atlasLandmarkComplete : ""}`}
              onClick={() => setSelectedKey(word.key)}
              aria-current={active ? "step" : undefined}
            >
              <span className={`${styles.atlasLandmarkNode} ${styles[`atlasColor_${word.color}`]}`}>
                <i>{complete ? "✓" : word.icon}</i>
                {inProgress ? <b className={styles.atlasPulse} aria-hidden /> : null}
              </span>
              <strong>{word.title}</strong>
              <small>{complete ? "Shared" : inProgress ? "In progress" : "Unexplored"}</small>
            </button>
          );
        })}
        <div className={styles.atlasPairToken} aria-hidden>
          <span>Y</span><span>{initials(partnerName)}</span>
        </div>
      </div>

      <AtlasLandmarkStage
        key={`${selectedWord.key}-${selectedWord.chapter?.id ?? "new"}-${selectedWord.chapter?.status ?? "empty"}-${selectedWord.chapter?.candidateVersion ?? 0}`}
        word={selectedWord}
        relationshipId={relationshipId}
        partnerName={partnerName}
        busy={busy}
        runAction={runAction}
      />
    </section>
  );
}

function AtlasLandmarkStage({
  word,
  relationshipId,
  partnerName,
  busy,
  runAction,
}: {
  word: AtlasWord;
  relationshipId: string;
  partnerName: string;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
}) {
  const chapter = word.chapter;
  const startChapter = () =>
    runAction(
      () => journeyRequest(`/api/journey/relationships/${relationshipId}/atlas/${encodeURIComponent(word.key)}`, { method: "POST" }),
      `Your ${word.title.toLowerCase()} landmark is open. Begin privately.`,
    );

  if (!chapter) {
    return (
      <article className={`${styles.atlasStage} ${styles[`atlasStage_${word.color}`]}`}>
        <div className={styles.atlasStageIcon}>{word.icon}</div>
        <div className={styles.atlasStageIntro}>
          <span>LANDMARK · {word.title.toUpperCase()}</span>
          <h3>{word.description}</h3>
          <p>
            You will each define this privately. Neither answer opens until both are ready,
            and no shared meaning is saved without two yeses.
          </p>
          <div className={styles.atlasMiniSteps}>
            <span><b>1</b> Define</span><i />
            <span><b>2</b> Discover</span><i />
            <span><b>3</b> Confirm</span><i />
            <span><b>4</b> Share</span>
          </div>
          <button className={styles.atlasPrimary} disabled={busy} onClick={startChapter}>
            {busy ? "Opening..." : `Explore “${word.title}”`}
          </button>
        </div>
      </article>
    );
  }

  if (!chapter.ownResponse) {
    return <AtlasPrivateForm word={word} chapter={chapter} busy={busy} runAction={runAction} />;
  }

  if (!chapter.partnerResponse.submitted) {
    return (
      <article className={styles.atlasStage}>
        <div className={styles.atlasWaitingOrb}><span>✓</span><i /></div>
        <div className={styles.atlasWaitingCopy}>
          <span className={styles.atlasStageLabel}>YOUR MEANING IS SAFE</span>
          <h3>Your side of “{word.title}” is ready.</h3>
          <p>
            The discovery stays locked until {partnerName} adds their private meaning. They
            cannot see yours yet—and you cannot see theirs.
          </p>
          <div className={styles.atlasDualKey}>
            <span className={styles.atlasKeyReady}>You <b>✓</b></span>
            <i>＋</i>
            <span>{partnerName} <b>…</b></span>
          </div>
        </div>
      </article>
    );
  }

  return (
    <AtlasDiscovery
      word={word}
      chapter={chapter}
      partnerName={partnerName}
      busy={busy}
      runAction={runAction}
      onStartAgain={startChapter}
    />
  );
}

function AtlasPrivateForm({
  word,
  chapter,
  busy,
  runAction,
}: {
  word: AtlasWord;
  chapter: AtlasChapter;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
}) {
  const [definition, setDefinition] = useState("");
  const [example, setExample] = useState("");
  const [notMeaning, setNotMeaning] = useState("");
  const complete = [definition, example, notMeaning].every((value) => value.trim().length >= 8);

  return (
    <form
      className={styles.atlasPrivateForm}
      onSubmit={(event) => {
        event.preventDefault();
        if (!complete) return;
        runAction(
          () => journeyRequest(`/api/journey/atlas/${chapter.id}/response`, {
            method: "PUT",
            body: JSON.stringify({ definition, example, notMeaning }),
          }),
          "Your meaning is saved privately.",
        );
      }}
    >
      <div className={styles.atlasFormHeader}>
        <span className={`${styles.atlasStageIcon} ${styles[`atlasColor_${word.color}`]}`}>{word.icon}</span>
        <div>
          <span className={styles.atlasStageLabel}>PRIVATE TRAIL · ONLY YOU CAN SEE THIS</span>
          <h3>What does “{word.title}” mean in your world?</h3>
          <p>Write naturally. This is a map of lived meaning, not a test or compatibility score.</p>
        </div>
      </div>
      <div className={styles.atlasPromptGrid}>
        <label>
          <span><b>1</b> In my words</span>
          <textarea value={definition} onChange={(event) => setDefinition(event.target.value)} maxLength={500} placeholder={`${word.title} means…`} />
        </label>
        <label>
          <span><b>2</b> A moment that shows it</span>
          <small>{word.mysteryPrompt}</small>
          <textarea value={example} onChange={(event) => setExample(event.target.value)} maxLength={500} placeholder="One real moment was…" />
        </label>
        <label>
          <span><b>3</b> What it is not</span>
          <textarea value={notMeaning} onChange={(event) => setNotMeaning(event.target.value)} maxLength={500} placeholder={`${word.title} does not mean…`} />
        </label>
      </div>
      <button className={styles.atlasPrimary} disabled={busy || !complete}>
        {busy ? "Saving privately..." : "Lock in my meaning"}
      </button>
      <small className={styles.atlasPrivacyNote}>🔒 Your answers stay closed until both private keys are ready.</small>
    </form>
  );
}

function AtlasDiscovery({
  word,
  chapter,
  partnerName,
  busy,
  runAction,
  onStartAgain,
}: {
  word: AtlasWord;
  chapter: AtlasChapter;
  partnerName: string;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
  onStartAgain: () => void;
}) {
  const own = chapter.ownResponse!;
  const partner = chapter.partnerResponse;
  const [summary, setSummary] = useState(own.heardSummary ?? "");
  const bothConfirmed = own.heardStatus === "CONFIRMED" && partner.heardStatus === "CONFIRMED";
  const summaryNeedsWork = !own.heardSummary || own.heardStatus === "ALMOST" || own.heardStatus === "MISSING";

  return (
    <div className={styles.atlasDiscovery}>
      <section className={styles.atlasRevealHeader}>
        <span className={styles.atlasBurst}>{word.icon}</span>
        <div>
          <span className={styles.atlasStageLabel}>DUAL KEY UNLOCKED</span>
          <h3>Two meanings discovered.</h3>
          <p>Notice the shape of each answer before trying to merge them.</p>
        </div>
        <span className={styles.atlasChapterTag}>Chapter {Math.max(1, word.versionCount + (chapter.status === "SHARED" ? 0 : 1))}</span>
      </section>

      <div className={styles.atlasMeaningCards}>
        <article>
          <span>You mean</span>
          <h4>“{own.definition}”</h4>
          <div><b>Moment</b><p>{own.example}</p></div>
          <div><b>Not this</b><p>{own.notMeaning}</p></div>
        </article>
        <div className={styles.atlasBridge} aria-hidden><span>↔</span></div>
        <article>
          <span>{partnerName} means</span>
          <h4>“{partner.definition}”</h4>
          <div className={styles.atlasMysteryMoment}><b>Clue from their world</b><p>{partner.example}</p></div>
          <div><b>Not this</b><p>{partner.notMeaning}</p></div>
        </article>
      </div>

      <section className={styles.atlasChecksum}>
        <div className={styles.atlasChecksumHeader}>
          <span>◎</span>
          <div>
            <span className={styles.atlasStageLabel}>RELATIONSHIP CHECKSUM</span>
            <h3>Did the meaning arrive intact?</h3>
            <p>Understanding is complete only when the person who spoke recognizes what came back.</p>
          </div>
        </div>

        <div className={styles.atlasChecksumGrid}>
          <article>
            <span className={styles.atlasPersonLabel}>WHAT YOU HEARD FROM {partnerName.toUpperCase()}</span>
            {summaryNeedsWork ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (summary.trim().length < 8) return;
                  runAction(
                    () => journeyRequest(`/api/journey/atlas/${chapter.id}/heard`, {
                      method: "PUT",
                      body: JSON.stringify({ summary }),
                    }),
                    `Sent to ${partnerName} for a meaning check.`,
                  );
                }}
              >
                {own.heardStatus === "ALMOST" || own.heardStatus === "MISSING" ? (
                  <div className={styles.atlasGentleNudge}>
                    {own.heardStatus === "ALMOST" ? "Almost there—try one small adjustment." : "Something important was missing. Try listening for the center of it."}
                  </div>
                ) : null}
                <textarea value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={500} placeholder={`What I heard ${partnerName} say is…`} />
                <button disabled={busy || summary.trim().length < 8}>{busy ? "Sending..." : "Check what I heard"}</button>
              </form>
            ) : (
              <div className={styles.atlasSummaryState}>
                <blockquote>“{own.heardSummary}”</blockquote>
                <span className={own.heardStatus === "CONFIRMED" ? styles.atlasConfirmed : ""}>
                  {own.heardStatus === "CONFIRMED" ? `✓ ${partnerName} felt understood` : `Waiting for ${partnerName} to check this`}
                </span>
              </div>
            )}
          </article>

          <article>
            <span className={styles.atlasPersonLabel}>WHAT {partnerName.toUpperCase()} HEARD FROM YOU</span>
            {!partner.heardSummary ? (
              <div className={styles.atlasListeningWait}><span>◌</span><p>{partnerName} is still putting what they heard into their own words.</p></div>
            ) : partner.heardStatus === "PENDING" ? (
              <div className={styles.atlasConfirmSummary}>
                <blockquote>“{partner.heardSummary}”</blockquote>
                <p>Does this carry the center of what you meant?</p>
                <div>
                  {(["CONFIRMED", "ALMOST", "MISSING"] as const).map((status) => (
                    <button
                      key={status}
                      disabled={busy}
                      onClick={() => runAction(
                        () => journeyRequest(`/api/journey/atlas/${chapter.id}/heard/${partner.id}/confirm`, {
                          method: "POST",
                          body: JSON.stringify({ status }),
                        }),
                        status === "CONFIRMED" ? "You confirmed that you feel understood." : "Your gentle correction was saved.",
                      )}
                    >
                      {status === "CONFIRMED" ? "Yes, that’s it" : status === "ALMOST" ? "Almost" : "Something’s missing"}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className={styles.atlasSummaryState}>
                <blockquote>“{partner.heardSummary}”</blockquote>
                <span className={partner.heardStatus === "CONFIRMED" ? styles.atlasConfirmed : ""}>
                  {partner.heardStatus === "CONFIRMED" ? "✓ You confirmed this" : `You asked ${partnerName} to try again`}
                </span>
              </div>
            )}
          </article>
        </div>
      </section>

      {chapter.status === "SHARED" ? (
        <section className={styles.atlasSharedMoment}>
          <div className={styles.atlasConfetti} aria-hidden><i>✦</i><i>●</i><i>◆</i><i>✦</i><i>●</i></div>
          <span className={styles.atlasSharedSeal}>✓</span>
          <span className={styles.atlasStageLabel}>A SHARED LANDMARK</span>
          <h3>For us, “{word.title}” means…</h3>
          <blockquote>“{chapter.sharedDefinition}”</blockquote>
          <p>This is a living definition, not a permanent verdict. You can explore it again when life changes.</p>
          <button onClick={onStartAgain} disabled={busy}>Explore a new chapter</button>
        </section>
      ) : bothConfirmed ? (
        <AtlasDefinitionConvergence
          word={word}
          chapter={chapter}
          partnerName={partnerName}
          busy={busy}
          runAction={runAction}
        />
      ) : (
        <div className={styles.atlasNotReadyYet}>
          <span>✦</span>
          <div><strong>The shared definition is still hidden.</strong><p>It opens after both people confirm they feel accurately understood.</p></div>
        </div>
      )}

      {word.previousDefinitions?.length ? (
        <details className={styles.atlasHistory}>
          <summary>Earlier meanings of “{word.title}” ({word.previousDefinitions.length})</summary>
          {word.previousDefinitions.map((item) => (
            <div key={item.id}><span>{formatDate(item.sharedAt)}</span><p>{item.definition}</p></div>
          ))}
        </details>
      ) : null}
    </div>
  );
}

function AtlasDefinitionConvergence({
  word,
  chapter,
  partnerName,
  busy,
  runAction,
}: {
  word: AtlasWord;
  chapter: AtlasChapter;
  partnerName: string;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
}) {
  const [personalDraft, setPersonalDraft] = useState("");
  const [bridgeDraft, setBridgeDraft] = useState("");
  const [revisionDraft, setRevisionDraft] = useState(chapter.sharedDefinition ?? "");
  const ownProposal = chapter.proposals.find((proposal) => proposal.proposedByCurrentUser);
  const partnerProposal = chapter.proposals.find((proposal) => !proposal.proposedByCurrentUser);
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

  const ownSelectionProposal = chapter.proposals.find(
    (proposal) => proposal.id === chapter.ownSelection?.proposalId,
  );
  const partnerSelectionProposal = chapter.proposals.find(
    (proposal) => proposal.id === chapter.partnerSelection?.proposalId,
  );
  const crossedChoice = Boolean(
    chapter.ownSelection?.mode === "PROPOSAL" &&
      chapter.partnerSelection?.mode === "PROPOSAL" &&
      ownSelectionProposal &&
      partnerSelectionProposal &&
      !ownSelectionProposal.proposedByCurrentUser &&
      partnerSelectionProposal.proposedByCurrentUser,
  );
  const separateChoice = Boolean(
    chapter.ownSelection?.mode === "PROPOSAL" &&
      chapter.partnerSelection?.mode === "PROPOSAL" &&
      ownSelectionProposal?.proposedByCurrentUser &&
      partnerSelectionProposal &&
      !partnerSelectionProposal.proposedByCurrentUser,
  );

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

function RoadmapView({
  session,
  busy,
  runAction,
}: {
  session: JourneySession | null;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
}) {
  if (!session) {
    return <EmptyWorkspace title="Your roadmap is still open." detail="Complete a guided conversation, then propose the first next step you both want to take." />;
  }

  return (
    <div className={styles.roadmapPage}>
      <section className={styles.sectionHero}>
        <span className={styles.eyebrow}>YOUR SHARED ROADMAP</span>
        <h2>Agreements with room to change.</h2>
        <p>Every accepted step keeps its own timing and private reflection. One plan never silently replaces another.</p>
      </section>
      {session.nextSteps.length ? <RoadmapSteps session={session} busy={busy} runAction={runAction} /> : null}
      {session.proposals.length ? <ProposalChoices session={session} busy={busy} runAction={runAction} /> : null}
      {session.bothRevealed ? <NextStepForm session={session} busy={busy} runAction={runAction} /> : (
        <div className={styles.noComparison}>Finish the current check-in together before proposing a new roadmap step.</div>
      )}
      {session.proposalHistory.length ? <ProposalHistory session={session} /> : null}
    </div>
  );
}

function EmptyWorkspace({
  title,
  detail,
  onAction,
}: {
  title: string;
  detail: string;
  onAction?: () => void;
}) {
  return (
    <section className={styles.emptyWorkspace}>
      <span>✦</span>
      <h2>{title}</h2>
      <p>{detail}</p>
      {onAction ? <button className={styles.primaryAction} onClick={onAction}>Choose a conversation</button> : null}
    </section>
  );
}

function ConnectionStage({
  pendingInvites,
  inviteLink,
  busy,
  onInvite,
  onAccept,
}: {
  pendingInvites: JourneyOverview["pendingInvites"];
  inviteLink: string;
  busy: boolean;
  onInvite: (email: string) => Promise<void>;
  onAccept: (token: string) => void;
}) {
  const [email, setEmail] = useState("");

  return (
    <section className={styles.stageGrid}>
      <article className={styles.primaryCard}>
        <span className={styles.cardNumber}>01</span>
        <span className={styles.eyebrow}>CONNECT BY CHOICE</span>
        <h2>Create a private space for two.</h2>
        <p>
          Invite the person you want to build with. Nothing is shared until they
          independently accept and decide what they want to reveal.
        </p>
        <form
          className={styles.inviteForm}
          onSubmit={(event) => {
            event.preventDefault();
            onInvite(email);
          }}
        >
          <label htmlFor="partner-email">Partner&apos;s email</label>
          <div>
            <input
              id="partner-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="partner@example.com"
              required
            />
            <button disabled={busy}>{busy ? "Creating..." : "Create private invite"}</button>
          </div>
        </form>
        {inviteLink ? (
          <div className={styles.inviteLink}>
            <span>Private invitation link</span>
            <code>{inviteLink}</code>
            <button onClick={() => navigator.clipboard?.writeText(inviteLink)}>Copy link</button>
          </div>
        ) : null}
      </article>

      <aside className={styles.sideCard}>
        <span className={styles.eyebrow}>INVITATIONS FOR YOU</span>
        {pendingInvites.length ? (
          pendingInvites.map((invite) => (
            <div className={styles.pendingInvite} key={invite.id}>
              <span className={styles.avatar}>{initials(invite.inviter.name)}</span>
              <div>
                <strong>{invite.inviter.name}</strong>
                <p>invited you to build a shared roadmap.</p>
              </div>
              <button disabled={busy} onClick={() => onAccept(invite.token)}>Accept</button>
            </div>
          ))
        ) : (
          <div className={styles.emptyState}>
            <span>✦</span>
            <p>No pending invitations. You can begin with your own invitation when you are ready.</p>
          </div>
        )}
      </aside>
    </section>
  );
}

function SessionStage({
  session,
  busy,
  runAction,
}: {
  session: JourneySession;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
}) {
  if (!session.ownResponse) {
    return (
      <IntentionForm
        session={session}
        busy={busy}
        onSubmit={(answers, shareKeys, contextNotes, contextShareKeys) =>
          runAction(
            () =>
              journeyRequest(`/api/journey/sessions/${session.id}/responses`, {
                method: "PUT",
                body: JSON.stringify({ answers, shareKeys, contextNotes, contextShareKeys }),
              }),
            "Your intentions are saved privately.",
          )
        }
      />
    );
  }

  if (!session.partnerState.submitted) {
    return <WaitingCard title="Your reflection is saved." name={session.partnerState.name} detail="They can answer independently when they are ready. Your answers are still private." />;
  }

  if (!session.ownResponse.revealConsented) {
    return (
      <RevealStage
        session={session}
        busy={busy}
        onReveal={() =>
          runAction(
            () => journeyRequest(`/api/journey/sessions/${session.id}/reveal`, { method: "POST" }),
            "Your reveal consent is saved.",
          )
        }
      />
    );
  }

  if (!session.partnerState.revealConsented) {
    return <WaitingCard title="You chose what to reveal." name={session.partnerState.name} detail="The comparison will open only after both people consent. You cannot see their answers yet." />;
  }

  return <AlignmentStage session={session} />;
}

function IntentionForm({
  session,
  busy,
  onSubmit,
}: {
  session: JourneySession;
  busy: boolean;
  onSubmit: (
    answers: Record<string, string>,
    shareKeys: string[],
    contextNotes: Record<string, string>,
    contextShareKeys: string[],
  ) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [shareKeys, setShareKeys] = useState<string[]>([]);
  const [contextNotes, setContextNotes] = useState<Record<string, string>>({});
  const [contextShareKeys, setContextShareKeys] = useState<string[]>([]);
  const complete = session.questions.every((question) => Boolean(answers[question.key]));

  return (
    <section className={styles.formCard}>
      <span className={styles.eyebrow}>MY INTENTIONS · PRIVATE</span>
      <h2>{session.topic}</h2>
      <p className={styles.formIntro}>
        Answer for yourself. Sharing is off by default and can be enabled separately for each response.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (complete) onSubmit(answers, shareKeys, contextNotes, contextShareKeys);
        }}
      >
        <div className={styles.questionList}>
          {session.questions.map((question, index) => (
            <fieldset className={styles.question} key={question.key}>
              <legend><span>{String(index + 1).padStart(2, "0")}</span>{question.label}</legend>
              <p>{question.helper}</p>
              <div className={styles.optionGrid}>
                {question.options.map((option) => (
                  <label key={option.value} className={answers[question.key] === option.value ? styles.optionSelected : ""}>
                    <input
                      type="radio"
                      name={question.key}
                      value={option.value}
                      checked={answers[question.key] === option.value}
                      onChange={() => setAnswers((current) => ({ ...current, [question.key]: option.value }))}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <label className={styles.shareControl}>
                <input
                  type="checkbox"
                  checked={shareKeys.includes(question.key)}
                  onChange={(event) =>
                    {
                      setShareKeys((current) =>
                        event.target.checked
                          ? [...current, question.key]
                          : current.filter((key) => key !== question.key),
                      );
                      if (!event.target.checked) {
                        setContextShareKeys((current) =>
                          current.filter((key) => key !== question.key),
                        );
                      }
                    }
                  }
                />
                <span>Allow this answer to be compared after both of us consent</span>
              </label>
              <div className={styles.contextComposer}>
                <label htmlFor={`context-${question.key}`}>What I hope you understand <span>optional</span></label>
                <textarea
                  id={`context-${question.key}`}
                  value={contextNotes[question.key] ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setContextNotes((current) => ({ ...current, [question.key]: value }));
                    if (!value.trim()) {
                      setContextShareKeys((current) => current.filter((key) => key !== question.key));
                    }
                  }}
                  placeholder="Add context for yourself first. It stays private unless you explicitly share it."
                  maxLength={600}
                />
                <label className={styles.shareControl}>
                  <input
                    type="checkbox"
                    checked={contextShareKeys.includes(question.key)}
                    disabled={!shareKeys.includes(question.key) || !contextNotes[question.key]?.trim()}
                    onChange={(event) =>
                      setContextShareKeys((current) =>
                        event.target.checked
                          ? [...current, question.key]
                          : current.filter((key) => key !== question.key),
                      )
                    }
                  />
                  <span>Also reveal this written context with my answer</span>
                </label>
              </div>
            </fieldset>
          ))}
        </div>
        <div className={styles.formFooter}>
          <span>{shareKeys.length} of {session.questions.length} answers selected to share</span>
          <button className={styles.primaryAction} disabled={!complete || busy}>
            {busy ? "Saving privately..." : "Save my intentions"}
          </button>
        </div>
      </form>
    </section>
  );
}

function RevealStage({ session, busy, onReveal }: { session: JourneySession; busy: boolean; onReveal: () => void }) {
  const shared = session.questions.filter((question) => session.ownResponse?.shareKeys.includes(question.key));
  return (
    <section className={styles.focusCard}>
      <div className={styles.focusCopy}>
        <span className={styles.eyebrow}>REVEAL BY CHOICE</span>
        <h2>Both reflections are ready.</h2>
        <p>
          You selected {shared.length} answer{shared.length === 1 ? "" : "s"} for comparison.
          Unselected answers remain private. Once you continue, submitted answers can no longer be edited.
        </p>
        <ul className={styles.revealList}>
          {shared.length ? shared.map((question) => <li key={question.key}>✓ {question.label}</li>) : <li>No answers selected. You may still continue without a comparison.</li>}
        </ul>
      </div>
      <button className={styles.primaryAction} disabled={busy} onClick={onReveal}>
        {busy ? "Saving consent..." : "Consent and continue"}
      </button>
    </section>
  );
}

function WaitingCard({ title, name, detail }: { title: string; name: string; detail: string }) {
  return (
    <section className={styles.waitingCard}>
      <span className={styles.waitingIcon}>◌</span>
      <span className={styles.eyebrow}>WAITING WITHOUT PRESSURE</span>
      <h2>{title}</h2>
      <p>{detail}</p>
      <div className={styles.waitingPerson}>
        <span className={styles.avatar}>{initials(name)}</span>
        <span>{name} will continue in their own time.</span>
      </div>
    </section>
  );
}

function AlignmentStage({
  session,
}: {
  session: JourneySession;
}) {
  return (
    <div className={styles.alignmentStack}>
      <section className={styles.alignmentHeader}>
        <div>
          <span className={styles.eyebrow}>WHAT YOU BOTH CHOSE TO SHARE</span>
          <h2>Where you are now.</h2>
          <p>
            This is a dated snapshot, not a score. Shared ground and differences can both
            change as your relationship changes.
          </p>
        </div>
        <span className={styles.alignmentMark}>↗</span>
      </section>

      {session.alignment.length ? (
        <div className={styles.alignmentGrid}>
          {session.alignment.map((item) => (
            <article className={styles.alignmentCard} key={item.key}>
              <span className={alignmentBadge(item).className}>
                {alignmentBadge(item).label}
              </span>
              <h3>{item.label}</h3>
              <div><span>You</span><strong>{item.ownAnswer}</strong></div>
              <div><span>{session.partnerState.name}</span><strong>{item.partnerAnswer}</strong></div>
              {item.ownContext || item.partnerContext ? (
                <div className={styles.sharedContext}>
                  {item.ownContext ? <p><span>You added</span>{item.ownContext}</p> : null}
                  {item.partnerContext ? <p><span>{session.partnerState.name} added</span>{item.partnerContext}</p> : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.noComparison}>
          You both kept your answers private. You can still choose a next conversation together.
        </div>
      )}

      <section className={styles.alignmentNextPrompt}>
        <div>
          <span className={styles.eyebrow}>NEXT</span>
          <h3>Turn insight into something you both choose.</h3>
          <p>Open the Roadmap to propose practical next steps, dates, and private follow-up reflections.</p>
        </div>
      </section>
    </div>
  );
}

function alignmentBadge(item: AlignmentItem) {
  switch (item.trend) {
    case "still-shared":
      return { label: "Still shared", className: styles.sharedBadge };
    case "new-shared":
      return { label: "New shared ground", className: styles.newSharedBadge };
    case "changed":
      return { label: "Something changed", className: styles.changedBadge };
    case "worth-discussing":
      return { label: "Worth discussing now", className: styles.discussBadge };
    default:
      return item.aligned
        ? { label: "Shared this time", className: styles.sharedBadge }
        : { label: "Worth discussing now", className: styles.discussBadge };
  }
}

function CheckInTimeline({
  partnerName,
  session,
  history,
  onChooseConversation,
}: {
  partnerName: string;
  session: JourneySession;
  history: JourneyOverview["checkInHistory"];
  onChooseConversation: () => void;
}) {
  return (
    <section className={styles.timelineCard}>
      <div className={styles.timelineHeader}>
        <div>
          <span className={styles.eyebrow}>RELATIONSHIP CHAPTERS</span>
          <h2>Your shared ground over time.</h2>
          <p>
            Each chapter keeps only what you both chose to reveal at that time. Starting
            again always means fresh private answers and fresh sharing consent.
          </p>
        </div>
        {session.bothRevealed ? (
          <div className={styles.checkInAction}>
            <button className={styles.primaryAction} onClick={onChooseConversation}>
              Choose next conversation
            </button>
            <span>Anytime, or gently revisit around {formatDate(addDays(session.createdAt, 90))}.</span>
          </div>
        ) : null}
      </div>

      <div className={styles.timelineList}>
        <article className={styles.currentChapter}>
          <span className={styles.timelineDot} aria-hidden="true" />
          <div>
            <span className={styles.currentLabel}>Current chapter</span>
            <h3>{session.topic}</h3>
            <p>
              {session.bothRevealed
                ? `Shared ${formatDate(session.createdAt)}. Your earlier chapters remain unchanged below.`
                : `Started ${formatDate(session.createdAt)}. Nothing from this chapter is shared until both people consent.`}
            </p>
          </div>
        </article>

        {history.map((snapshot) => (
          <article className={styles.pastChapter} key={snapshot.id}>
            <span className={styles.timelineDot} aria-hidden="true" />
            <div>
              <span className={styles.pastLabel}>Earlier chapter</span>
              <h3>{snapshot.topic}</h3>
              <p>Shared {formatDate(snapshot.revealedAt)}</p>
              {snapshot.alignment.length ? (
                <details>
                  <summary>
                    {snapshot.alignment.length} mutually revealed topic
                    {snapshot.alignment.length === 1 ? "" : "s"}
                  </summary>
                  <div className={styles.snapshotTopics}>
                    {snapshot.alignment.map((item) => (
                      <div key={item.key}>
                        <strong>{item.label}</strong>
                        <span>You · {item.ownAnswer}</span>
                        <span>{partnerName} · {item.partnerAnswer}</span>
                      </div>
                    ))}
                  </div>
                </details>
              ) : (
                <p>No answers were mutually revealed in this chapter.</p>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function NextStepForm({
  session,
  busy,
  runAction,
}: {
  session: JourneySession;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [targetDate, setTargetDate] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    runAction(
      () =>
        journeyRequest(`/api/journey/sessions/${session.id}/next-steps`, {
          method: "POST",
          body: JSON.stringify({ title, details: details || undefined, targetDate: targetDate || undefined }),
        }),
      "Your proposed next step is ready for your partner to review.",
    );
  }

  return (
    <section className={styles.nextStepCard}>
      <div>
        <span className={styles.eyebrow}>
          {session.nextSteps.length || session.proposals.length ? "ADD TO YOUR ROADMAP" : "CHOOSE WHAT COMES NEXT"}
        </span>
        <h2>
          {session.nextSteps.length || session.proposals.length
            ? "Suggest another next step."
            : "Turn the conversation into practical next steps."}
        </h2>
        <p>Each accepted step gets its own revisit date and reflection. One idea does not replace another.</p>
      </div>
      <form onSubmit={submit}>
        <label>
          Next step
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Compare our priorities over coffee" minLength={3} required />
        </label>
        <label>
          A little context <span>optional</span>
          <textarea value={details} onChange={(event) => setDetails(event.target.value)} placeholder="What would make this conversation feel useful?" />
        </label>
        <label>
          Revisit on <span>optional</span>
          <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
        </label>
        <button className={styles.primaryAction} disabled={busy || title.trim().length < 3}>
          {busy ? "Sending proposal..." : "Propose this next step"}
        </button>
      </form>
    </section>
  );
}

function ProposalChoices({
  session,
  busy,
  runAction,
}: {
  session: JourneySession;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
}) {
  return (
    <section className={styles.proposalBoard}>
      <div className={styles.proposalBoardHeader}>
        <span className={styles.eyebrow}>OPTIONS ON THE TABLE</span>
        <h2>Suggestions awaiting agreement.</h2>
        <p>Accepting a suggestion adds it to your roadmap. Other ideas stay available as separate next steps.</p>
      </div>
      <div className={styles.proposalGrid}>
        {session.proposals.map((proposal) => (
          <article className={styles.proposalOption} key={proposal.id}>
            <span className={styles.proposerBadge}>
              {proposal.proposedByCurrentUser ? "Your proposal" : `${proposal.proposedByName}'s proposal`}
            </span>
            <h3>{proposal.title}</h3>
            {proposal.details ? <p>{proposal.details}</p> : null}
            {proposal.targetDate ? (
              <span className={styles.datePill}>Revisit · {formatDate(proposal.targetDate)}</span>
            ) : null}
            {proposal.proposedByCurrentUser ? (
              <div className={styles.pendingLine}>Waiting for {session.partnerState.name} to accept this step.</div>
            ) : (
              <button
                className={styles.primaryAction}
                disabled={busy}
                onClick={() =>
                  runAction(
                    () => journeyRequest(`/api/journey/next-steps/${proposal.id}/accept`, { method: "POST" }),
                    "This step was added to your shared roadmap.",
                  )
                }
              >
                {busy ? "Adding..." : "Add to our roadmap"}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function ProposalHistory({ session }: { session: JourneySession }) {
  return (
    <section className={styles.proposalHistory}>
      <span className={styles.eyebrow}>OTHER IDEAS YOU CONSIDERED</span>
      <h3>Nothing was silently discarded.</h3>
      <div>
        {session.proposalHistory.map((proposal) => (
          <article key={proposal.id}>
            <div>
              <strong>{proposal.title}</strong>
              <span>Proposed by {proposal.proposedByCurrentUser ? "you" : proposal.proposedByName}</span>
            </div>
            <span className={styles.historyStatus}>
              {proposal.status === "DECLINED" ? "Closed when another option was chosen" : "Earlier proposal"}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function RoadmapSteps({
  session,
  busy,
  runAction,
}: {
  session: JourneySession;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
}) {
  return (
    <section className={styles.roadmapBoard}>
      <div className={styles.roadmapHeader}>
        <span className={styles.eyebrow}>YOUR SHARED NEXT STEPS</span>
        <h2>A roadmap with room for more than one plan.</h2>
        <p>Each step has its own timing. Reflect on them independently when their revisit dates arrive.</p>
      </div>
      <div className={styles.roadmapList}>
        {session.nextSteps.map((step, index) => (
          <AcceptedStep
            key={step.id}
            session={session}
            step={step}
            stepNumber={index + 1}
            busy={busy}
            runAction={runAction}
          />
        ))}
      </div>
    </section>
  );
}

function AcceptedStep({
  session,
  step,
  stepNumber,
  busy,
  runAction,
}: {
  session: JourneySession;
  step: JourneyNextStep;
  stepNumber: number;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, successMessage?: string) => Promise<void>;
}) {
  const complete = Boolean(step.ownReflection && step.partnerReflection.submitted);

  return (
    <section className={styles.acceptedCard}>
      <div className={styles.acceptedTop}>
        <span className={styles.acceptedIcon}>{stepNumber}</span>
        <div>
          <span className={styles.eyebrow}>{complete ? "REFLECTION COMPLETE" : "MUTUALLY CHOSEN"}</span>
          <h2>{step.title}</h2>
          {step.details ? <p>{step.details}</p> : null}
          {step.targetDate ? <span className={styles.datePill}>Revisit · {formatDate(step.targetDate)}</span> : null}
        </div>
      </div>

      {complete ? (
        <div className={styles.completionPanel}>
          <strong>You both reflected.</strong>
          <p>
            The outcome is not a relationship score. Completing, changing, or pausing a plan can all be intentional choices.
          </p>
          <div>
            <span>Your reflection: {step.ownReflection?.outcome.replaceAll("_", " ").toLowerCase()}</span>
            <span>{session.partnerState.name}: {step.partnerReflection.outcome?.replaceAll("_", " ").toLowerCase()}</span>
          </div>
        </div>
      ) : step.ownReflection ? (
        <div className={styles.pendingLine}>Your reflection is private until {session.partnerState.name} submits theirs.</div>
      ) : !step.reflectionAvailable ? (
        <div className={styles.reflectionLocked}>
          <span className={styles.lockIcon}>⌛</span>
          <div>
            <span className={styles.eyebrow}>NEXT STEP IN PROGRESS</span>
            <h3>Reflection opens {formatDate(step.targetDate)}.</h3>
            <p>
              Give this shared step the time you both chose. You can return on the revisit date to reflect privately.
            </p>
            <strong>
              {daysUntil(step.reflectionOpensAt)} {daysUntil(step.reflectionOpensAt) === 1 ? "day" : "days"} remaining
            </strong>
          </div>
        </div>
      ) : (
        <ReflectionForm
          busy={busy}
          onSubmit={(outcome, note) =>
            runAction(
              () =>
                journeyRequest(`/api/journey/next-steps/${step.id}/reflections`, {
                  method: "POST",
                  body: JSON.stringify({ outcome, note: note || undefined }),
                }),
              "Your reflection is saved privately.",
            )
          }
        />
      )}
    </section>
  );
}

function ReflectionForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (outcome: string, note: string) => void;
}) {
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const options = useMemo(
    () => [
      ["COMPLETED", "We followed through"],
      ["CHANGED", "What we need has changed"],
      ["PAUSED", "We want to pause this"],
      ["NOT_RELEVANT", "This no longer feels relevant"],
    ],
    [],
  );

  return (
    <form
      className={styles.reflectionForm}
      onSubmit={(event) => {
        event.preventDefault();
        if (outcome) onSubmit(outcome, note);
      }}
    >
      <span className={styles.eyebrow}>PRIVATE REFLECTION</span>
      <h3>What feels true now?</h3>
      <div className={styles.reflectionOptions}>
        {options.map(([value, label]) => (
          <label key={value} className={outcome === value ? styles.optionSelected : ""}>
            <input type="radio" name="outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="A private note for yourself (optional)" />
      <button className={styles.primaryAction} disabled={!outcome || busy}>{busy ? "Saving..." : "Save my reflection"}</button>
    </form>
  );
}
