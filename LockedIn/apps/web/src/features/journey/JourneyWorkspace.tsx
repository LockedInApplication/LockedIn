"use client";

import { RoadmapView } from "@/features/roadmap";
import EmptyWorkspace from "@/features/journey/components/EmptyWorkspace";
import { InvitationReview, InvitationManager } from "@/features/invitations";
import MemberChrome from "./components/MemberChrome";
import ProfileAvatar from "@/features/profile/ProfileAvatar";
import WorkspaceNav from "./components/WorkspaceNav";
import SharedJourneyPath from "./components/SharedJourneyPath";
import NextActionCard from "./components/NextActionCard";
import { useWorkspaceNavigation, navigateWorkspaceUrl } from "./use-workspace-navigation";
import { notificationDestination, type NotificationItem } from "@/features/notifications";
import { useQuietRefresh } from "@/features/notifications/use-quiet-refresh";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import BrandLogo from "@/components/brandLogo";
import ConfirmDialog from "@/components/ConfirmDialog";
import { AtlasView } from "@/features/atlas";
import { CheckInTimeline, SessionStage } from "@/features/check-ins";
import { ConversationLibrary } from "@/features/conversations";
import { authClient } from "@/utils/authCLient";
import {
  JourneyApiError,
  JourneyOverview,
  journeyRequest,
} from "@/lib/journey";
import styles from "@/app/journey/journey.module.scss";
import guidanceStyles from "./next-action.module.scss";
import ConversationSuggestionView from "../conversations/ConversationSuggestionView";
import conversationStyles from "../conversations/conversation-library.module.scss";
import {useJourneyHistoryGuard} from './use-journey-history-guard';
import RelationshipMessages from "./components/RelationshipMessages";
import TogetherChatActions from "./components/TogetherChatActions";
import { TogetherHomeHeading, TogetherPlan, TogetherWelcome } from "./components/TogetherHome";
import { getUpcomingTogetherPlan } from "./together-home";
import DirectLockIn from "@/features/messaging/DirectLockIn";
import { currentCheckInHref } from "./journey.navigation";
import TinyLantern from "./components/TinyLantern";

type Notice = { tone: "success" | "error"; message: string; reviewDiscovery?: boolean } | null;


export default function JourneyWorkspace() {
  const router = useRouter();
  const [overview, setOverview] = useState<JourneyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusyState] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [leaveSpaceId, setLeaveSpaceId] = useState<string | null>(null);
  const [activeView, navigateView, workspaceLocation] = useWorkspaceNavigation();
  const [invitationRevision,setInvitationRevision]=useState(0);
  const dirty=useRef(false);
  const editRevision=useRef(0);
  const busyRef=useRef(false);
  const [quietRevision,setQuietRevision]=useState(0);
  const [savedRefreshFailed,setSavedRefreshFailed]=useState(false);
  const refreshAfterAction=useRef(false);
  const onExpired=useCallback(()=>{
    const returnTo=`${window.location.pathname}${window.location.search}${window.location.hash}`;
    router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  },[router]);
  const readQuietly=useCallback((signal:AbortSignal)=>journeyRequest<JourneyOverview>("/api/journey/overview",{signal,cache:"no-store"}),[]);
  const applyQuietly=useCallback((data:JourneyOverview)=>{
    refreshAfterAction.current=false;
    setSavedRefreshFailed(false);
    setOverview(data);setQuietRevision(value=>value+1);setInvitationRevision(value=>value+1);
  },[]);
  const quietFailure=useCallback((error:unknown)=>{
    if(error instanceof JourneyApiError && error.status===401)onExpired();
    else if(refreshAfterAction.current)setSavedRefreshFailed(true);
  },[onExpired]);
  const {invalidate:requestQuietRefresh,setBlocked:blockQuietRefresh}=useQuietRefresh(readQuietly,applyQuietly,quietFailure);
  const setDirty=useCallback((value:boolean)=>{if(value)editRevision.current++;dirty.current=value;blockQuietRefresh(value||busyRef.current);},[blockQuietRefresh]);
  const setBusy=useCallback((value:boolean)=>{busyRef.current=value;blockQuietRefresh(value||dirty.current);setBusyState(value);},[blockQuietRefresh]);
  useJourneyHistoryGuard(dirty,setDirty);
  const targetQuery=new URL(workspaceLocation,"http://localhost").searchParams;
  const targetWord=targetQuery.get("word");
  const targetChapter=targetQuery.get("chapter");
  const suggestionReference=activeView==="conversations"?targetQuery.get("suggestion"):null;
  const invitationReference=targetQuery.get("invitation")??targetQuery.get("invite");
  const invitationBy=targetQuery.has("invitation")?"id":"token";
  const invitationManagerOpen=targetQuery.get("invitations")==="manage";

  const hasOverview=overview!==null;
  const hasSession=Boolean(overview?.session);
  useEffect(()=>{
    if(!hasOverview)return;
    const hash=new URL(workspaceLocation,"http://localhost").hash.slice(1);
    if(hash !== "current-action" && !hash.startsWith("step-"))return;
    const element=document.getElementById(hash);
    const details=element?.closest("details");
    if(details)details.open=true;
    element?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"center"});
    element?.focus({preventScroll:true});
  },[workspaceLocation,hasOverview,hasSession]);

  const onInvitationUpdate=requestQuietRefresh;

  function confirmDiscard() {
    if(dirty.current && !window.confirm("You have unsaved answers. Leave them and load the latest activity?"))return false;
    setDirty(false);return true;
  }
  function setActiveView(view:Parameters<typeof navigateView>[0]) {
    if(view!==activeView && !confirmDiscard())return;
    navigateView(view);
  }
  function openCheckInProposal() {
    if (confirmDiscard()) navigateWorkspaceUrl("/journey?view=roadmap#step-propose");
  }

  const loadOverview = useCallback(async () => {
    try {
      const data = await journeyRequest<JourneyOverview>("/api/journey/overview");
      setOverview(data);
      return data;
    } catch (error) {
      if (error instanceof JourneyApiError && error.status === 401) {
        const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
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
    void loadOverview();
  }, [loadOverview]);

  const runAction = useCallback(
    async (action: () => Promise<unknown>, success?: string | { message: string; reviewDiscovery: true }) => {
      const submitted=editRevision.current;
      setBusy(true);
      setNotice(null);
      try {
        await action();
        refreshAfterAction.current=true;
        if(editRevision.current===submitted)setDirty(false);
        if (success) setNotice({ tone: "success", ...(typeof success === "string" ? { message: success } : success) });
        requestQuietRefresh();
      } catch (error) {
        setNotice({
          tone: "error",
          message: error instanceof Error ? error.message : "Something went wrong.",
        });
      } finally {
        setBusy(false);
      }
    },
    [requestQuietRefresh,setBusy,setDirty],
  );

  async function signOut() {
    if(busy || !confirmDiscard())return;
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

  async function openNotification(item:NotificationItem) {
    if(busy || !confirmDiscard())return false;
    if(item.view==="discovery" || item.view==="messages") {
      router.push(notificationDestination(item));
      return true;
    }
    const fresh=await loadOverview();
    if(!fresh)return false;
    let destination=notificationDestination(item);
    if(item.view==="home" && item.kind!=="INVITATION_ACCEPTED" && fresh.session?.id!==item.entityId) {
      destination="/journey?view=chapters";
      setNotice({tone:"success",message:"This conversation has moved to your past conversations."});
    }
    if(item.view==="atlas") {
      const word=fresh.atlas.words.find(w=>w.key===item.wordKey);
      if(!word || (word.chapter?.id!==item.entityId && !word.previousDefinitions?.some(c=>c.id===item.entityId))) {
        setNotice({tone:"success",message:"This activity has already moved on or is no longer available."});
        return true;
      }
    }
    if(item.view==="roadmap" && ![...(fresh.session?.nextSteps??[]),...(fresh.session?.proposals??[]),...(fresh.simplePlans??[])].some(s=>s.id===item.entityId)) {
      setNotice({tone:"success",message:"This step has already moved on. You can review your past conversations."});
      destination="/journey?view=chapters";
    }
    navigateWorkspaceUrl(destination);
    return true;
  }
  const isHome = Boolean(overview.relationship && activeView === "home");
  const chatId = isHome && overview.messaging?.enabled ? overview.messaging.conversationId : null;
  const comingUp = isHome ? getUpcomingTogetherPlan(overview.simplePlans ?? []) : undefined;
  const openCurrentCheckIn = () => {
    if (confirmDiscard()) navigateWorkspaceUrl(currentCheckInHref);
  };
  const focusCurrentAction = () => {
    const element = document.getElementById("current-action");
    element?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
    element?.focus({ preventScroll: true });
  };
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
        if (result.started) openCurrentCheckIn();
        return result;
      },
      "Your choice is saved. A check-in begins only when you both choose the same conversation.",
    );
  };

  const chrome = { className: styles.page, userId: overview.user.id, user: overview.user, onSignOut: signOut,
    invitationView: invitationManagerOpen || !!invitationReference,
    onNavigate: (path: string) => { if (!busy && confirmDiscard()) {
      if (path === "/journey") navigateWorkspaceUrl(path);
      else router.push(path);
    } },
    onOpenNotification: openNotification, onActivity: requestQuietRefresh, onExpired, onStatusChange: onInvitationUpdate };
  const showAtlas = Boolean(overview.relationship && activeView === "atlas" && overview.atlas.words.length);
  const checkInStage = overview.session ? (
    <div id="current-action" tabIndex={-1} className={guidanceStyles.currentAction}>
      <SessionStage session={overview.session} busy={busy} runAction={runAction} onProposeNextStep={openCheckInProposal} />
    </div>
  ) : null;

  if(invitationManagerOpen)return <MemberChrome key={overview.user.id} {...chrome}><main className={styles.main}>
    <InvitationManager key={overview.user.id} revision={invitationRevision} onClose={()=>router.push("/connections")}/>
  </main></MemberChrome>;

  // Review is exclusive: no journey forms can acquire unsaved input behind it.
  if(invitationReference)return <MemberChrome key={overview.user.id} {...chrome}>
    <main className={styles.main}>
      <InvitationReview key={`${invitationBy}:${invitationReference}`} reference={invitationReference} by={invitationBy}
        onClose={()=>router.push("/connections")}
        onHandled={async (decision, acceptance)=>{
          if (decision === "accept" && acceptance?.conversationId) {
            router.push(`/messages/${encodeURIComponent(acceptance.conversationId)}`);
            return;
          }
          const fresh=await loadOverview();
          if(!fresh)throw new Error("Your choice was saved, but your space could not reload. Please refresh.");
          if (decision === "accept") {
            navigateWorkspaceUrl("/journey");
            setNotice({tone:"success",message:"You’re connected. Find your chat in Inbox, and your new shared space here in Together."});
          } else router.push("/connections");
        }}/>
    </main>
  </MemberChrome>;

  return (
    <MemberChrome key={overview.user.id} {...chrome}>
      <main className={`${styles.main} ${activeView==='conversations'?conversationStyles.compactMain:''} ${isHome?guidanceStyles.home:''} ${showAtlas ? styles.atlasMain : ""}`} onChangeCapture={()=>setDirty(true)}>
        {overview.relationship && isHome ? <TogetherHomeHeading
          key={`${overview.user.id}:${overview.relationship.id}`}
          user={{ ...overview.user, name: overview.user.name || overview.user.email }} userId={overview.user.id}
          partner={overview.relationship.partner} locked={overview.relationship.isMutuallyLockedIn === true}
          lockedAt={overview.relationship.mutuallyLockedInAt}
        /> : overview.relationship && activeView !== "conversations" && !showAtlas ? <section className={styles.intro}>
          <div>
            <span className={styles.eyebrow}>YOUR SHARED ROADMAP</span>
            <h1>Build the relationship you both choose.</h1>
            <p>Reflect privately, reveal only what feels right, and turn one important conversation into an evolving roadmap you both accept.</p>
          </div>
          <div className={styles.memberCard}>
            <ProfileAvatar name={overview.user.name || overview.user.email} preset={overview.user.avatarPreset}/>
            <div>
              <strong>{overview.user.name || "Your space"}</strong>
              <span>Connected with {overview.relationship.partner.name}</span>
            </div>
            <ProfileAvatar name={overview.relationship.partner.name} preset={overview.relationship.partner.avatarPreset}/>
          </div>
        </section>:null}

        {isHome && chatId && overview.relationship ? <>
          <TogetherChatActions conversationId={chatId} partnerName={overview.relationship.partner.name} confirmLeave={() => !busy && confirmDiscard()} />
          {checkInStage ? <details className={guidanceStyles.privateCheckIn}>
            <summary className={guidanceStyles.checkInEntry}>
              Private check-in <span className={guidanceStyles.entryDetail}>{overview.session?.bothRevealed ? "View shared answers" : "Answer privately"}</span><span aria-hidden="true" className={guidanceStyles.checkInChevron}>›</span>
            </summary>
            {overview.session?.bothRevealed ? <NextActionCard overview={overview} busy={busy} onNavigate={setActiveView} onFocusCurrent={focusCurrentAction} /> : null}
            {checkInStage}
          </details> : (
            <Link className={guidanceStyles.checkInEntry} href="/journey?view=conversations"
              onNavigate={event => { event.preventDefault(); if (!busy) setActiveView("conversations"); }}>
              Private check-in <span className={guidanceStyles.entryDetail}>Answer privately</span><span aria-hidden="true">›</span>
            </Link>
          )}
        </> : isHome ? <NextActionCard overview={overview} busy={busy} onNavigate={setActiveView} onFocusCurrent={focusCurrentAction} /> : null}
        {comingUp ? <TogetherPlan plan={comingUp} onOpen={href => { if (!busy && confirmDiscard()) navigateWorkspaceUrl(href); }} /> : null}
        {!suggestionReference && overview.relationship ? (
          activeView === "conversations"
            ? <Link className={conversationStyles.backToTogether} href="/journey"
                onNavigate={event => { event.preventDefault(); setActiveView("home"); }}>← Together</Link>
            : <WorkspaceNav active={activeView} onChange={setActiveView} />
        ) : null}
        {overview.relationship && !isHome && activeView !== "conversations"
          ? <RelationshipMessages messaging={overview.messaging} confirmLeave={() => !busy && confirmDiscard()}/>
          : null}
        {chatId && overview.lockIn && overview.lockIn.state !== "locked"
          ? <DirectLockIn userId={overview.user.id} conversationId={chatId} state={overview.lockIn} inTogether onRefresh={requestQuietRefresh}/>
          : null}

        {overview.relationship && !suggestionReference && (activeView === "home" || activeView === "roadmap" || activeView === "conversations") ? (
          <TinyLantern
            key={JSON.stringify([overview.user.id, overview.relationship.id, activeView])}
            userId={overview.user.id}
            relationshipId={overview.relationship.id}
            isMutuallyLockedIn={overview.relationship.isMutuallyLockedIn === true}
            view={activeView}
          />
        ) : null}
        {savedRefreshFailed ? <p className={styles.notice} role="status">Your change was saved, but this view could not update. <button type="button" onClick={requestQuietRefresh}>Try updating the view</button></p> : null}
        {notice ? (
          <div className={`${styles.notice} ${notice.tone === "error" ? styles.noticeError : ""}`} role={notice.tone === "error" ? "alert" : "status"}>
            <p>{notice.message}</p>
            {notice.reviewDiscovery ? <Link href="/discover/profile">Review Discovery visibility</Link> : null}
          </div>
        ) : null}

        {suggestionReference ? (
          <ConversationSuggestionView key={`${overview.user.id}:${suggestionReference}`} notificationId={suggestionReference} revision={`${quietRevision}:${invitationRevision}`} busy={busy}
            onHome={()=>{if(confirmDiscard())navigateWorkspaceUrl('/journey');}}
            onBrowse={()=>{if(confirmDiscard())navigateWorkspaceUrl('/journey?view=conversations');}}
            onAccept={async()=>{await runAction(async()=>{const result=await journeyRequest<{started:boolean}>(`/api/journey/notifications/${encodeURIComponent(suggestionReference)}/conversation-suggestion`,{method:'POST'});if(result.started)navigateWorkspaceUrl(currentCheckInHref);},'Your conversation choice was saved.');}}/>
        ) : !overview.relationship ? (
          <TogetherWelcome canInvite={overview.canInviteToChat !== false} requiresLockIn={overview.canInviteToChat !== undefined}
            hasInboxActivity={overview.hasInboxActivity ?? Boolean(overview.directChats?.length || overview.pendingInvites.length)} />
        ) : activeView === "conversations" ? (
          <ConversationLibrary
            packs={overview.conversationPacks}
            selection={overview.conversationSelection}
            currentPackKey={overview.session?.packKey ?? null}
            canStart={!overview.session || overview.session.bothRevealed}
            busy={busy}
            onStart={startConversation}
            onContinue={openCurrentCheckIn}
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
            key={`${targetWord??"default"}:${targetChapter??"current"}`}
            initialWordKey={targetWord}
            targetChapterId={targetChapter}
            words={overview.atlas.words}
            relationshipId={overview.relationship.id}
            partnerName={overview.relationship.partner.name}
            busy={busy}
            runAction={runAction}
          />
        ) : activeView === "roadmap" ? (
          <RoadmapView key={overview.relationship.id} relationshipId={overview.relationship.id} userId={overview.user.id} simplePlans={overview.simplePlans}
            session={overview.session} busy={busy} runAction={runAction} onDiscard={()=>setDirty(false)}
            onConflict={()=>{setDirty(false);requestQuietRefresh();}} />
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
            {!chatId ? checkInStage : null}
            <SharedJourneyPath
              session={overview.session}
              historyCount={overview.checkInHistory.length}
              partnerName={overview.relationship.partner.name}
            />
          </>
        )}

        {overview.relationship ? (
          <section className={styles.safetyBar}>
            <div>
              <strong>Your participation is always voluntary.</strong>
              <span>You can leave this shared space without completing the roadmap.</span>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => setLeaveSpaceId(overview.relationship?.id ?? null)}
            >
              Leave Together
            </button>
          </section>
        ) : null}
      </main>
      <ConfirmDialog
        open={!!leaveSpaceId && leaveSpaceId === overview.relationship?.id}
        title="Leave Together?"
        description={"This ends Together for both of you and closes any chat linked to this space. Your other chats stay open. Neither Discovery profile is made visible again automatically." + (dirty.current ? " Any unsaved changes here will be lost." : "")}
        cancelLabel="Stay in Together"
        confirmLabel="Leave Together"
        onCancel={() => setLeaveSpaceId(null)}
        onConfirm={() => {
          if (busyRef.current || !leaveSpaceId || leaveSpaceId !== overview.relationship?.id) return;
          setLeaveSpaceId(null);
          void runAction(
            () => journeyRequest(`/api/journey/relationships/${encodeURIComponent(leaveSpaceId)}/leave`, { method: "POST" }),
            { message: "You left Together. Your Discovery visibility hasn’t changed.", reviewDiscovery: true },
          );
        }}
      />
    </MemberChrome>
  );
}
