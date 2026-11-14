"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import BrandLogo from "@/components/brandLogo";
import { AtlasView } from "@/features/atlas";
import { CheckInTimeline, SessionStage } from "@/features/check-ins";
import { ConversationLibrary } from "@/features/conversations";
import { authClient } from "@/utils/authCLient";
import {
  JourneyApiError,
  JourneyNextStep,
  JourneyOverview,
  JourneySession,
  journeyRequest,
} from "@/lib/journey";
import {
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
