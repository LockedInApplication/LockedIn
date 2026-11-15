"use client";

import { RoadmapView } from "@/features/roadmap";
import EmptyWorkspace from "@/features/journey/components/EmptyWorkspace";
import { ConnectionStage } from "@/features/invitations";
import WorkspaceHeader from "./components/WorkspaceHeader";
import WorkspaceNav from "./components/WorkspaceNav";
import ProgressRail from "./components/ProgressRail";
import SharedJourneyPath from "./components/SharedJourneyPath";
import type { WorkspaceView } from "./journey.navigation";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import BrandLogo from "@/components/brandLogo";
import { AtlasView } from "@/features/atlas";
import { CheckInTimeline, SessionStage } from "@/features/check-ins";
import { ConversationLibrary } from "@/features/conversations";
import { authClient } from "@/utils/authCLient";
import {
  JourneyApiError,
  JourneyOverview,
  journeyRequest,
} from "@/lib/journey";
import {
  getProgress,
  initials,
} from "@/features/journey/journey.utils";
import styles from "@/app/journey/journey.module.scss";

type Notice = { tone: "success" | "error"; message: string } | null;


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
      <WorkspaceHeader onSignOut={signOut} />

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
