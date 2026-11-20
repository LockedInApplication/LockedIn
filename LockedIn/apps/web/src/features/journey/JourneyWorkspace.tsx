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
import actionStyles from "./shared-space-actions.module.scss";
import guidanceStyles from "./next-action.module.scss";
import ConversationSuggestionView from "../conversations/ConversationSuggestionView";
import conversationStyles from "../conversations/conversation-library.module.scss";
import {useJourneyHistoryGuard} from './use-journey-history-guard';
import {useCompactWorkspace,useResponsiveActionRef} from './use-compact-workspace';
import RelationshipMessages from "./components/RelationshipMessages";
import TogetherDestinations from "./components/TogetherDestinations";
import TinyLantern from "./components/TinyLantern";

type Notice = { tone: "success" | "error"; message: string } | null;


export default function JourneyWorkspace() {
  const router = useRouter();
  const [overview, setOverview] = useState<JourneyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusyState] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [activeView, navigateView, workspaceLocation] = useWorkspaceNavigation();
  const [invitationRevision,setInvitationRevision]=useState(0);
  const dirty=useRef(false);
  const editRevision=useRef(0);
  const busyRef=useRef(false);
  const compactWorkspace=useCompactWorkspace();
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
  const actionRef=useResponsiveActionRef();
  useJourneyHistoryGuard(dirty,setDirty);
  const targetQuery=new URL(workspaceLocation,"http://localhost").searchParams;
  const targetWord=targetQuery.get("word");
  const targetChapter=targetQuery.get("chapter");
  const suggestionReference=activeView==="conversations"?targetQuery.get("suggestion"):null;
  const invitationReference=targetQuery.get("invitation")??targetQuery.get("invite");
  const invitationBy=targetQuery.has("invitation")?"id":"token";
  const invitationManagerOpen=targetQuery.get("invitations")==="manage";

  const hasOverview=overview!==null;
  useEffect(()=>{
    if(!hasOverview)return;
    const hash=new URL(workspaceLocation,"http://localhost").hash.slice(1);
    if(!hash.startsWith("step-"))return;
    const element=document.getElementById(hash);
    const details=element?.closest("details");
    if(details)details.open=true;
    element?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"center"});
    element?.focus({preventScroll:true});
  },[workspaceLocation,hasOverview]);

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
    async (action: () => Promise<unknown>, successMessage?: string) => {
      const submitted=editRevision.current;
      setBusy(true);
      setNotice(null);
      try {
        await action();
        refreshAfterAction.current=true;
        if(editRevision.current===submitted)setDirty(false);
        if (successMessage) setNotice({ tone: "success", message: successMessage });
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
        if (result.started) setActiveView("home");
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
  const mobileHome=isHome&&compactWorkspace;
  const nextAction=<NextActionCard cardRef={actionRef} overview={overview} busy={busy} onNavigate={setActiveView} onFocusCurrent={focusCurrentAction}/>;

  if(invitationManagerOpen)return <MemberChrome key={overview.user.id} {...chrome}><main className={styles.main}>
    <InvitationManager key={overview.user.id} revision={invitationRevision} onClose={()=>router.push("/connections")}/>
  </main></MemberChrome>;

  // Review is exclusive: no journey forms can acquire unsaved input behind it.
  if(invitationReference)return <MemberChrome key={overview.user.id} {...chrome}>
    <main className={styles.main}>
      <InvitationReview key={`${invitationBy}:${invitationReference}`} reference={invitationReference} by={invitationBy}
        onClose={()=>router.push("/connections")}
        onHandled={async decision=>{
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
      <main className={`${styles.main} ${activeView==='conversations'?conversationStyles.compactMain:''} ${mobileHome?guidanceStyles.mobileHome:''}`} onChangeCapture={()=>setDirty(true)}>
        {mobileHome?<h1 className={guidanceStyles.greeting}>Hi, {overview.user.name?.trim().split(/\s+/)[0]||'there'}.</h1>:null}
        {overview.relationship && activeView!=='conversations'?<section className={`${styles.intro} ${isHome ? guidanceStyles.homeIntro : ""}`}>
          {!mobileHome?<div>
            <span className={styles.eyebrow}>YOUR SHARED ROADMAP</span>
            <h1>{isHome ? "Your shared space." : "Build the relationship you both choose."}</h1>
            <p>
              {isHome ? "Pick up where you left off, one step at a time." : "Reflect privately, reveal only what feels right, and turn one important conversation into an evolving roadmap you both accept."}
            </p>
          </div>:null}
          <div className={styles.memberCard}>
            <ProfileAvatar name={overview.user.name || overview.user.email} preset={overview.user.avatarPreset}/>
            <div>
              <strong>{overview.user.name || "Your space"}</strong>
              <span>{overview.relationship ? `Connected with ${overview.relationship.partner.name}` : "Start privately"}</span>
            </div>
            {overview.relationship?<ProfileAvatar name={overview.relationship.partner.name} preset={overview.relationship.partner.avatarPreset}/>:null}
          </div>
        </section>:null}

        {overview.relationship && !suggestionReference && (activeView === "home" || activeView === "roadmap" || activeView === "conversations") ? (
          <TinyLantern
            key={JSON.stringify([overview.user.id, overview.relationship.id, activeView])}
            userId={overview.user.id}
            relationshipId={overview.relationship.id}
            isMutuallyLockedIn={overview.relationship.isMutuallyLockedIn === true}
            view={activeView}
          />
        ) : null}
        {isHome ? <TogetherDestinations onNavigate={setActiveView} /> : null}
        {mobileHome ? nextAction : null}
        {suggestionReference?null:overview.relationship ? (
          <WorkspaceNav active={activeView} onChange={setActiveView} compact={activeView==='conversations'} />
        ) : null}

        {overview.relationship ? <RelationshipMessages messaging={overview.messaging}/> : null}

        {savedRefreshFailed ? <p className={styles.notice} role="status">Your change was saved, but this view could not update. <button type="button" onClick={requestQuietRefresh}>Try updating the view</button></p> : null}
        {notice ? (
          <div className={`${styles.notice} ${notice.tone === "error" ? styles.noticeError : ""}`}>
            {notice.message}
          </div>
        ) : null}

        {suggestionReference ? (
          <ConversationSuggestionView key={`${overview.user.id}:${suggestionReference}`} notificationId={suggestionReference} revision={`${quietRevision}:${invitationRevision}`} busy={busy}
            onHome={()=>{if(confirmDiscard())navigateWorkspaceUrl('/journey');}}
            onBrowse={()=>{if(confirmDiscard())navigateWorkspaceUrl('/journey?view=conversations');}}
            onAccept={async()=>{await runAction(async()=>{const result=await journeyRequest<{started:boolean}>(`/api/journey/notifications/${encodeURIComponent(suggestionReference)}/conversation-suggestion`,{method:'POST'});if(result.started)navigateWorkspaceUrl('/journey');},'Your conversation choice was saved.');}}/>
        ) : !overview.relationship ? (
          <section className={styles.primaryCard}>
            <span className={styles.eyebrow}>TOGETHER</span>
            <h1>How would you like to connect?</h1>
            <p>Send a private invite to someone you know, or use Discover to meet someone new. Your chats and invitations are in Inbox.</p>
            <div className={actionStyles.actions}>
              <Link className={actionStyles.primary} href="/connections?compose=invite">Invite someone you know <span aria-hidden="true">→</span></Link>
              <Link href="/discover">Meet someone new <span aria-hidden="true">→</span></Link>
            </div>
          </section>
        ) : activeView === "conversations" ? (
          <ConversationLibrary
            packs={overview.conversationPacks}
            selection={overview.conversationSelection}
            currentPackKey={overview.session?.packKey ?? null}
            canStart={!overview.session || overview.session.bothRevealed}
            busy={busy}
            onStart={startConversation}
            onContinue={()=>setActiveView('home')}
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
            {!mobileHome?nextAction:null}
            <SharedJourneyPath
              session={overview.session}
              historyCount={overview.checkInHistory.length}
              partnerName={overview.relationship.partner.name}
              onNavigate={setActiveView}
              onFocusCurrent={focusCurrentAction}
            />
            {overview.session ? (
              <div id="current-action" tabIndex={-1} className={`${styles.currentActionStage} ${guidanceStyles.currentAction}`}>
                <SessionStage session={overview.session} busy={busy} runAction={runAction} onProposeNextStep={openCheckInProposal} />
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
    </MemberChrome>
  );
}
