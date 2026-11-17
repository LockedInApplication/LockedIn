"use client";

import { RoadmapView } from "@/features/roadmap";
import EmptyWorkspace from "@/features/journey/components/EmptyWorkspace";
import { ConnectionStage,InvitationReview,InvitationManager,SentInvitations } from "@/features/invitations";
import WorkspaceHeader from "./components/WorkspaceHeader";
import ProfileAvatar from "@/features/profile/ProfileAvatar";
import WorkspaceNav from "./components/WorkspaceNav";
import ProgressRail from "./components/ProgressRail";
import SharedJourneyPath from "./components/SharedJourneyPath";
import NextActionCard from "./components/NextActionCard";
import { useWorkspaceNavigation, navigateWorkspaceUrl } from "./use-workspace-navigation";
import { NotificationBell, notificationDestination, type NotificationItem } from "@/features/notifications";
import notificationStyles from "@/features/notifications/notification.module.scss";
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
} from "@/features/journey/journey.utils";
import styles from "@/app/journey/journey.module.scss";
import guidanceStyles from "./next-action.module.scss";
import ConversationSuggestionView from "../conversations/ConversationSuggestionView";
import conversationStyles from "../conversations/conversation-library.module.scss";
import {useJourneyHistoryGuard} from './use-journey-history-guard';
import {useCompactWorkspace,useResponsiveActionRef} from './use-compact-workspace';
import {discoveryRequest} from "@/features/discovery/discovery.client";
import {discoveryEntry} from "@/features/discovery/discovery-navigation";
import {useDiscoveryResource} from "@/features/discovery/use-discovery-resource";
import type {DiscoveryMe} from "@/features/discovery/discovery.types";

type Notice = { tone: "success" | "error"; message: string } | null;


export default function JourneyWorkspace() {
  const router = useRouter();
  const [overview, setOverview] = useState<JourneyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [inviteLink, setInviteLink] = useState("");
  const [activeView, navigateView, workspaceLocation] = useWorkspaceNavigation();
  const [newActivity,setNewActivity]=useState(false);
  const [invitationRevision,setInvitationRevision]=useState(0);
  const dirty=useRef(false);
  const compactWorkspace=useCompactWorkspace();
  const discoveryOwner=overview?.user.id??"";
  const loadDiscovery=useCallback((signal:AbortSignal)=>discoveryRequest<DiscoveryMe>(discoveryOwner,"/api/discovery/me",{signal}),[discoveryOwner]);
  const discoveryAccess=useDiscoveryResource(discoveryOwner,"me",loadDiscovery);
  const explore=discoveryEntry(discoveryAccess.value);
  const actionRef=useResponsiveActionRef();
  useJourneyHistoryGuard(dirty);
  const targetQuery=new URL(workspaceLocation,"http://localhost").searchParams;
  const targetWord=targetQuery.get("word");
  const targetChapter=targetQuery.get("chapter");
  const suggestionReference=activeView==="conversations"?targetQuery.get("suggestion"):null;
  const invitationReference=targetQuery.get("invitation")??targetQuery.get("invite");
  const invitationBy=targetQuery.has("invitation")?"id":"token";
  const invitationManagerOpen=targetQuery.get("invitations")==="manage";

  useEffect(()=>{
    const hash=new URL(workspaceLocation,"http://localhost").hash.slice(1);
    if(!hash.startsWith("step-"))return;
    const element=document.getElementById(hash);
    element?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"center"});
    element?.focus({preventScroll:true});
  },[workspaceLocation,overview]);

  const onActivity=useCallback(()=>setNewActivity(true),[]);
  const [quietRevision,setQuietRevision]=useState(0);
  const onInvitationUpdate=useCallback((activity?:boolean)=>{setInvitationRevision(value=>value+1);if(activity===false)setQuietRevision(value=>value+1);},[]);
  const onExpired=useCallback(()=>{
    const returnTo=`${window.location.pathname}${window.location.search}${window.location.hash}`;
    router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  },[router]);

  function confirmDiscard() {
    if(dirty.current && !window.confirm("You have unsaved answers. Leave them and load the latest activity?"))return false;
    dirty.current=false;return true;
  }
  function setActiveView(view:Parameters<typeof navigateView>[0]) {
    if(view!==activeView && !confirmDiscard())return;
    navigateView(view);
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

  useEffect(()=>{
    if(!quietRevision||dirty.current||busy)return;
    const controller=new AbortController();
    void journeyRequest<JourneyOverview>("/api/journey/overview",{signal:controller.signal,cache:"no-store"}).then(data=>{
      if(!controller.signal.aborted&&!dirty.current)setOverview(data);
    }).catch(()=>{/* The normal refresh and retry controls remain available. */});
    return()=>controller.abort();
  },[quietRevision,busy]);

  const runAction = useCallback(
    async (action: () => Promise<unknown>, successMessage?: string) => {
      setBusy(true);
      setNotice(null);
      try {
        await action();
        dirty.current=false;
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
      dirty.current=false;
      onInvitationUpdate();
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
    if(!confirmDiscard())return;
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
  async function openNotification(item:NotificationItem) {
    if(busy || !confirmDiscard())return false;
    if(item.view==="discovery") {
      router.push(notificationDestination(item));
      return true;
    }
    const fresh=await loadOverview();
    if(!fresh)return false;
    setNewActivity(false);
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
    if(item.view==="roadmap" && ![...(fresh.session?.nextSteps??[]),...(fresh.session?.proposals??[])].some(s=>s.id===item.entityId)) {
      setNotice({tone:"success",message:"This step has already moved on. You can review your past conversations."});
      destination="/journey?view=chapters";
    }
    navigateWorkspaceUrl(destination);
    return true;
  }
  const isHome = Boolean(overview.relationship && activeView === "home");
  const canChooseStart = !overview.relationship && !!discoveryAccess.value?.canDiscover && !discoveryAccess.value.hasHistory;
  const showWelcome = canChooseStart && !overview.pendingInvites.length;
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

  const header=<WorkspaceHeader onSignOut={signOut}
    onExplore={explore?()=>{if(!busy&&confirmDiscard())router.push(explore.path);}:undefined} exploreLabel={explore?.label}
    user={overview.user} onProfile={()=>{if(confirmDiscard())router.push("/profile");}}
    onInvitations={invitationManagerOpen?undefined:()=>{if(confirmDiscard())navigateWorkspaceUrl("/journey?invitations=manage");}}
    notifications={<NotificationBell key={overview.user.id} userId={overview.user.id} onOpen={openNotification} onActivity={onActivity} onExpired={onExpired} onStatusChange={onInvitationUpdate}/>}/>;
  const mobileHome=isHome&&compactWorkspace;
  const nextAction=<NextActionCard cardRef={actionRef} overview={overview} busy={busy} onNavigate={setActiveView} onFocusCurrent={focusCurrentAction}/>;

  if(invitationManagerOpen)return <div className={styles.page}>{header}<main className={styles.main}>
    <InvitationManager key={overview.user.id} revision={invitationRevision} onClose={()=>{if(confirmDiscard())navigateWorkspaceUrl("/journey");}}/>
  </main></div>;

  // Review is exclusive: no journey forms can acquire unsaved input behind it.
  if(invitationReference)return <div className={styles.page}>
    {header}
    <main className={styles.main}>
      <InvitationReview key={`${invitationBy}:${invitationReference}`} reference={invitationReference} by={invitationBy}
        onClose={()=>{if(confirmDiscard())navigateWorkspaceUrl("/journey");}}
        onHandled={async decision=>{
          const fresh=await loadOverview();
          if(!fresh)throw new Error("Your choice was saved, but your space could not reload. Please refresh.");
          setNewActivity(false);navigateWorkspaceUrl("/journey");
          setNotice({tone:"success",message:decision==="accept"?"You are connected. Your answers remain private until the sharing steps you choose.":decision==="block"?"Invitation block saved. Only you can remove it in Invitations. Existing shared spaces are unchanged.":"Invitation declined. No shared space was created."});
        }}/>
    </main>
  </div>;

  return (
    <div className={styles.page}>
      {header}

      <main className={`${styles.main} ${activeView==='conversations'?conversationStyles.compactMain:''} ${mobileHome?guidanceStyles.mobileHome:''}`} onChangeCapture={()=>{dirty.current=true;}}>
        {newActivity?<aside className={notificationStyles.activity} aria-label="New shared activity">
          <span>✦ There’s new activity. Your unfinished answers have been left untouched.</span>
          <button type="button" disabled={busy} onClick={async()=>{
            if(!confirmDiscard())return;
            if(await loadOverview())setNewActivity(false);
          }}>Refresh when ready</button>
        </aside>:null}
        {mobileHome?<><h1 className={guidanceStyles.greeting}>Hi, {overview.user.name?.trim().split(/\s+/)[0]||'there'}.</h1>{nextAction}</>:null}
        {activeView!=='conversations'?<section className={`${styles.intro} ${isHome ? guidanceStyles.homeIntro : ""}`}>
          {!mobileHome?<div>
            <span className={styles.eyebrow}>{showWelcome ? "GETTING STARTED" : "YOUR SHARED ROADMAP"}</span>
            <h1>{showWelcome ? "Welcome to LockedIn." : isHome ? "Your shared space." : "Build the relationship you both choose."}</h1>
            <p>
              {showWelcome ? "Start with someone you know or explore at your own pace." : isHome ? "Pick up where you left off, one step at a time." : "Reflect privately, reveal only what feels right, and turn one important conversation into an evolving roadmap you both accept."}
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

        {suggestionReference?null:overview.relationship ? (
          <WorkspaceNav active={activeView} onChange={setActiveView} compact={activeView==='conversations'} />
        ) : !showWelcome ? (
          <ProgressRail current={progress} />
        ) : null}

        {notice ? (
          <div className={`${styles.notice} ${notice.tone === "error" ? styles.noticeError : ""}`}>
            {notice.message}
          </div>
        ) : null}

        {suggestionReference ? (
          <ConversationSuggestionView key={`${overview.user.id}:${suggestionReference}`} notificationId={suggestionReference} revision={`${quietRevision}:${invitationRevision}:${newActivity}`} busy={busy}
            onHome={()=>{if(confirmDiscard())navigateWorkspaceUrl('/journey');}}
            onBrowse={()=>{if(confirmDiscard())navigateWorkspaceUrl('/journey?view=conversations');}}
            onAccept={async()=>{await runAction(async()=>{const result=await journeyRequest<{started:boolean}>(`/api/journey/notifications/${encodeURIComponent(suggestionReference)}/conversation-suggestion`,{method:'POST'});if(result.started)navigateWorkspaceUrl('/journey');},'Your conversation choice was saved.');}}/>
        ) : !overview.relationship ? (
          <>
          <ConnectionStage
            key={overview.user.id}
            pendingInvites={overview.pendingInvites}
            inviteLink={inviteLink}
            busy={busy}
            onInvite={handleInvite}
            onExplore={canChooseStart ? () => { if (!busy && confirmDiscard()) router.push("/discover"); } : undefined}
            onReview={id=>{if(confirmDiscard())navigateWorkspaceUrl(`/journey?invitation=${encodeURIComponent(id)}`);}}
          />
          <SentInvitations key={overview.user.id} revision={invitationRevision}
            onViewAll={()=>{if(confirmDiscard())navigateWorkspaceUrl("/journey?invitations=manage");}}/>
          </>
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
