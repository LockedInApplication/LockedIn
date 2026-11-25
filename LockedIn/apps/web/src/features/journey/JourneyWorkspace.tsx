"use client";

import { RoadmapView } from "@/features/roadmap";
import EmptyWorkspace from "@/features/journey/components/EmptyWorkspace";
import { InvitationReview, InvitationManager } from "@/features/invitations";
import MemberChrome from "./components/MemberChrome";
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
import { QuietTogetherHome, TogetherOptionsLink, TogetherWelcome } from "./components/TogetherHome";
import togetherStyles from "./components/together-home.module.scss";
import DirectLockIn from "@/features/messaging/DirectLockIn";
import { conversationTopicAnchor, conversationTopicHref, currentCheckInHref, workspaceBack, workspaceHref } from "./journey.navigation";
import TinyLantern from "./components/TinyLantern";
import BehindThePhoto from "@/features/memories/BehindThePhoto";
import { memoryNoteTarget } from "@/features/memories/memory-note-preview";
import { useTogetherMemories } from "@/features/memories/use-together-memories";
import RoomToTalk from "@/features/room-to-talk/RoomToTalk";

type Notice = { tone: "success" | "error"; message: string; reviewDiscovery?: boolean } | null;


export default function JourneyWorkspace() {
  const router = useRouter();
  const [overview, setOverview] = useState<JourneyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusyState] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [leaveSpaceId, setLeaveSpaceId] = useState<string | null>(null);
  const [activeView, , workspaceLocation] = useWorkspaceNavigation();
  const [invitationRevision,setInvitationRevision]=useState(0);
  const dirty=useRef(false);
  const editRevision=useRef(0);
  const busyRef=useRef(false);
  const [quietRevision,setQuietRevision]=useState(0);
  const [roomRevision,setRoomRevision]=useState(0);
  const onRoomSync=useCallback(()=>setRoomRevision(value=>value+1),[]);
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
  const workspaceUrl=new URL(workspaceLocation,"http://localhost");
  const targetQuery=workspaceUrl.searchParams;
  const targetWord=targetQuery.get("word");
  const targetChapter=targetQuery.get("chapter");
  const suggestionReference=activeView==="conversations"?targetQuery.get("suggestion"):null;
  const invitationReference=targetQuery.get("invitation")??targetQuery.get("invite");
  const invitationBy=targetQuery.has("invitation")?"id":"token";
  const invitationManagerOpen=targetQuery.get("invitations")==="manage";
  const lockedTogether = overview?.relationship?.isMutuallyLockedIn === true;
  const memoryHash = activeView === "memories" ? workspaceUrl.hash : "";
  const memories = useTogetherMemories({
    userId: overview?.user.id,
    relationshipId: overview?.relationship?.id,
    visible: lockedTogether && !invitationReference && !invitationManagerOpen && (activeView === "home" || activeView === "memories"),
    polling: activeView === "memories",
    revision: quietRevision,
    onExpired,
  });

  const hasOverview=overview!==null;
  const sessionId=overview?.session?.id;
  useEffect(()=>{
    if(!hasOverview)return;
    const hash=new URL(workspaceLocation,"http://localhost").hash.slice(1);
    if(hash !== "current-action" && hash !== conversationTopicAnchor && !hash.startsWith("step-"))return;
    const element=document.getElementById(hash);
    const details=element?.closest("details");
    if(details)details.open=true;
    element?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      // A check-in can span several screens; start at the first question.
      block: hash === "current-action" ? "start" : "center",
    });
    element?.focus({preventScroll:true});
  },[workspaceLocation,hasOverview,sessionId]);

  const onInvitationUpdate=requestQuietRefresh;

  function confirmDiscard() {
    if(dirty.current && !window.confirm("You have unsaved changes. Leave them and load the latest activity?"))return false;
    setDirty(false);return true;
  }
  function openWorkspaceDestination(href: string) {
    if (busyRef.current || !confirmDiscard()) return;
    navigateWorkspaceUrl(href);
    if (!href.includes("#")) window.scrollTo({ top: 0, behavior: "instant" });
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
    if(destination===currentCheckInHref && fresh.session?.id!==item.entityId) {
      destination=workspaceHref("chapters");
      setNotice({tone:"success",message:"This check-in is no longer current. You can review what was shared in Past check-ins."});
    }
    if(item.view==="atlas") {
      const word=fresh.atlas.words.find(w=>w.key===item.wordKey);
      if(!word || (word.chapter?.id!==item.entityId && !word.previousDefinitions?.some(c=>c.id===item.entityId))) {
        setNotice({tone:"success",message:"This activity has already moved on or is no longer available."});
        return true;
      }
    }
    if(item.view==="roadmap" && ![...(fresh.session?.nextSteps??[]),...(fresh.session?.proposals??[]),...(fresh.simplePlans??[])].some(s=>s.id===item.entityId)) {
      setNotice({tone:"success",message:"This plan is no longer available. Your other plans are still here."});
      destination=workspaceHref("roadmap");
    }
    navigateWorkspaceUrl(destination);
    return true;
  }
  const isHome = Boolean(overview.relationship && activeView === "home");
  const isRoom = activeView === "room-to-talk";
  const compactView = ["talk", "check-ins", "conversations", "options", "room-to-talk"].includes(activeView);
  const back = workspaceBack(activeView);
  const chatId = overview.messaging?.enabled ? overview.messaging.conversationId : null;
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
    onOpenNotification: openNotification, onActivity: requestQuietRefresh, onExpired, onStatusChange: onInvitationUpdate, onRoomSync };
  const showAtlas = Boolean(overview.relationship && activeView === "atlas" && overview.atlas.words.length);
  const checkInStage = overview.session ? (
    <div id="current-action" tabIndex={-1} className={guidanceStyles.currentAction}>
      <SessionStage key={overview.session.id} session={overview.session} busy={busy} runAction={runAction} onProposeNextStep={openCheckInProposal} />
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
      <main className={`${styles.main} ${!overview.relationship && !suggestionReference ? togetherStyles.welcomeMain : ""} ${compactView?conversationStyles.compactMain:''} ${isHome?guidanceStyles.home:''} ${showAtlas ? styles.atlasMain : ""}`} onChangeCapture={activeView === "memories" || isRoom ? undefined : ()=>setDirty(true)}>
        {!suggestionReference && overview.relationship && !isHome ? <div className={togetherStyles.workspaceToolbar}>
          <Link className={togetherStyles.workspaceBack} href={workspaceHref(back.view)}
            onNavigate={event => { event.preventDefault(); openWorkspaceDestination(workspaceHref(back.view)); }}>
            <span aria-hidden="true">←</span>{back.label}
          </Link>
          {activeView !== "options" ? <TogetherOptionsLink onNavigate={openWorkspaceDestination} /> : null}
        </div> : null}
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
        ) : isHome ? (
          <QuietTogetherHome key={`${overview.user.id}:${overview.relationship.id}`} overview={overview}
            memories={memories} onNavigate={openWorkspaceDestination} confirmLeave={() => !busy && confirmDiscard()}>
            {chatId && overview.lockIn && overview.lockIn.state !== "locked"
              ? <DirectLockIn userId={overview.user.id} conversationId={chatId} state={overview.lockIn} inTogether onRefresh={requestQuietRefresh}/>
              : null}
          </QuietTogetherHome>
        ) : activeView === "talk" ? (
          <div className={togetherStyles.talkHome}>
            <SectionHeading title="Talk" detail="Find the right place for what you two want to talk about." />
            <WorkspaceNav section="talk" lockedTogether={lockedTogether} onNavigate={openWorkspaceDestination} />
          </div>
        ) : activeView === "check-ins" ? (
          <>
            <SectionHeading title="Check-ins" detail="Answer on your own. Choose what you share, together." />
            {checkInStage}
            {!overview.session || overview.session.bothRevealed ? <NextActionCard overview={overview} busy={busy}
              onNavigate={view => openWorkspaceDestination(workspaceHref(view))} onFocusCurrent={focusCurrentAction} /> : null}
            <Link className={togetherStyles.historyLink} href={workspaceHref("chapters")}
              onNavigate={event => { event.preventDefault(); openWorkspaceDestination(workspaceHref("chapters")); }}>
              Past check-ins <span aria-hidden="true">›</span>
            </Link>
            <SharedJourneyPath session={overview.session} historyCount={overview.checkInHistory.length}
              partnerName={overview.relationship.partner.name} onViewConversations={() => openWorkspaceDestination(conversationTopicHref)} />
          </>
        ) : activeView === "conversations" ? (<>
          <SectionHeading title="Check-in topics" />
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
        </>) : isRoom ? (
          lockedTogether ? <RoomToTalk key={`${overview.user.id}:${overview.relationship.id}`}
            relationshipId={overview.relationship.id} userId={overview.user.id} partnerName={overview.relationship.partner.name}
            shelfId={targetQuery.get("shelf")} topicId={targetQuery.get("topic")} revision={quietRevision + roomRevision}
            onNavigate={openWorkspaceDestination} onDirty={setDirty} onExpired={onExpired} />
          : <section className={styles.intro}><div><h1>Room to Talk</h1><p>Your private shelves open when you both choose to lock in.</p></div></section>
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
        ) : activeView === "memories" ? (
          lockedTogether ? <BehindThePhoto key={`${overview.user.id}:${overview.relationship.id}:${memoryHash}`}
            relationshipId={overview.relationship.id} userId={overview.user.id} partnerName={overview.relationship.partner.name}
            memories={memories} initialTarget={memoryNoteTarget(memoryHash)} onDirty={setDirty} onExpired={onExpired} />
            : <section className={styles.intro}><div><h1>Behind the Photo</h1><p>This private photo book opens when you both choose to lock in.</p></div></section>
        ) : activeView === "roadmap" ? (<>
          <SectionHeading title="Plans" detail="Outings, ideas, and things you agree to do together." />
          <RoadmapView key={overview.relationship.id} relationshipId={overview.relationship.id} userId={overview.user.id} simplePlans={overview.simplePlans}
            session={overview.session} busy={busy} runAction={runAction} onDiscard={()=>setDirty(false)}
            onConflict={()=>{setDirty(false);requestQuietRefresh();}} />
        </>) : activeView === "chapters" ? (<>
          <SectionHeading title="Past check-ins" />
          {overview.session || overview.checkInHistory.length ? (
            <CheckInTimeline
              partnerName={overview.relationship.partner.name}
              session={overview.session}
              history={overview.checkInHistory}
              onChooseConversation={() => openWorkspaceDestination(workspaceHref("conversations"))}
            />
          ) : (
            <EmptyWorkspace title="No check-ins to revisit yet." detail="Choose a topic to start answering privately." onAction={() => openWorkspaceDestination(workspaceHref("conversations"))} />
          )}
        </>) : activeView === "options" ? (
          <>
            <SectionHeading title="Together options" />
            <TinyLantern key={`${overview.user.id}:${overview.relationship.id}`} userId={overview.user.id}
              relationshipId={overview.relationship.id} isMutuallyLockedIn={lockedTogether} view="home" />
            <section className={styles.safetyBar} aria-label="Relationship settings">
              <div>
                <strong>Your participation is always voluntary.</strong>
                <span>Leave Together at any time. Block and report controls are in your chat.</span>
              </div>
              <button type="button" disabled={busy} onClick={() => setLeaveSpaceId(overview.relationship?.id ?? null)}>Leave Together</button>
            </section>
          </>
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

function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  return <header className={togetherStyles.sectionHeading}>
    <h1>{title}</h1>
    {detail ? <p>{detail}</p> : null}
  </header>;
}
