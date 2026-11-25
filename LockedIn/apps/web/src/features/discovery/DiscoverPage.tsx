"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {journeyRequest, type JourneyOverview} from "@/lib/journey";
import {knownPartnerName} from "@/features/journey/relationship-name";
import DiscoveryShell,{useDiscovery} from "./DiscoveryShell";
import {discoveryRequest} from "./discovery.client";
import {useDiscoveryResource} from "./use-discovery-resource";
import type {DiscoveryLocation,OwnDiscoveryProfile,PageOf,PublicDiscoveryProfile} from "./discovery.types";
import {worldwideDiscoveryArea} from "./discovery.types";
import DiscoveryCandidateList from "./DiscoveryCandidateList";
import DiscoveryProfileCard from "./DiscoveryProfileCard";
import styles from "./discovery.module.scss";
import DiscoverySafetyActions from "./DiscoverySafetyActions";
import DiscoveryDistancePreferences, { type DistancePreferences } from "./DiscoveryDistancePreferences";
import DiscoveryLocationCheck from "./DiscoveryLocationCheck";
import DiscoveryMatchPreferences from "./DiscoveryMatchPreferences";
import local from "./local-discovery.module.scss";
export default function DiscoverPage(){return <DiscoveryShell><DiscoveryBrowse/></DiscoveryShell>;}
function DiscoveryBrowse(){
  const {userId,emailVerified,me,leave,installLocation,busy,setBusy,chatRevision}=useDiscovery(),[area,setArea]=useState(""),[selected,setSelected]=useState<string|null>(null);
  const lockedRelationshipId=me.discoveryLockedIn ? me.currentRelationshipId : null;
  const loadPartner=useCallback(async (signal:AbortSignal)=>{
    const overview=await journeyRequest<JourneyOverview>("/api/journey/overview",{signal,cache:"no-store"});
    const relationship=overview.relationship;
    if (overview.user.id!==userId || !relationship?.isMutuallyLockedIn || relationship.id!==lockedRelationshipId) return null;
    return knownPartnerName(relationship.partner.name,relationship.partner.email) ?? null;
  },[lockedRelationshipId,userId]);
  const partner=useDiscoveryResource(userId,lockedRelationshipId?`locked-in-partner:${lockedRelationshipId}`:"",loadPartner,chatRevision);
  const matchingScope=me.matching?.revision??"",setupRequired=!!me.matching&&!me.matching.complete;
  const location=me.location;
  const worldwide=location?.mode==="worldwide";
  const expiresAt=location?.expiresAt;
  const searchScope=JSON.stringify([matchingScope,location?.mode,location?.areaId,expiresAt]);
  const [paging,setPaging]=useState<{scope:string;cursors:(string|null)[]}>({scope:searchScope,cursors:[null]});
  const cursors=paging.scope===searchScope?paging.cursors:[null];
  const [showMatching,setShowMatching]=useState(false);
  const matchingOpen=showMatching&&!!me.matching;
  const [showDistance,setShowDistance]=useState(false),[searchVersion,setSearchVersion]=useState(0),[confirmation,setConfirmation]=useState("");
  const [outsideArea,setOutsideArea]=useState(false);
  const [visibilityError,setVisibilityError]=useState("");
  const [localPreferenceNotice,setLocalPreferenceNotice]=useState("");
  const visibilityRequest=useRef<AbortController|null>(null);
  const [expiredCheck,setExpiredCheck]=useState<string|null>(null);
  const [openedAt]=useState(Date.now);
  const cityPicker=useRef<HTMLSelectElement>(null);
  const loadOwn=useCallback((signal:AbortSignal)=>discoveryRequest<OwnDiscoveryProfile>(userId,"/api/discovery/profile",{signal}),[userId]);
  const own=useDiscoveryResource(userId,me.canDiscover?"profile":"",loadOwn);
  useEffect(()=>()=>visibilityRequest.current?.abort(),[]);
  useEffect(()=>{
    if(!expiresAt)return;
    const timer=setTimeout(()=>setExpiredCheck(expiresAt),Math.max(0,Date.parse(expiresAt)-Date.now()));
    return()=>clearTimeout(timer);
  },[expiresAt]);
  const searchArea=location?(expiresAt&&expiresAt!==expiredCheck&&Date.parse(expiresAt)>openedAt?(worldwide?worldwideDiscoveryArea:location.areaId??""):""):area||own.value?.published?.areaId||"";
  const before=cursors.at(-1);
  const canBrowse=!!(me.canDiscover&&own.value?.published&&!own.value.paused&&!own.value.suspended&&!setupRequired&&!matchingOpen);
  const loadDistance=useCallback((signal:AbortSignal)=>discoveryRequest<DistancePreferences>(userId,"/api/discovery/distance-preferences",{signal}),[userId]);
  const distance=useDiscoveryResource(userId,canBrowse&&!location?"distance-preferences":"",loadDistance);
  const preference=location?null:distance.value?.preference;
  const query=worldwide?"mode=nearby":preference?"mode=distance":`areaId=${encodeURIComponent(searchArea)}`;
  const load=useCallback((signal:AbortSignal)=>discoveryRequest<PageOf<PublicDiscoveryProfile>>(userId,`/api/discovery/candidates?${query}${before?`&before=${encodeURIComponent(before)}`:""}`,{signal}),[userId,query,before]);
  const candidates=useDiscoveryResource(userId,canBrowse&&(location||distance.value)&&searchArea?`${query}:${before??""}:${searchVersion}:${searchScope}`:"",load);
  const chosen=candidates.value?.items.find(item=>item.id===selected)??candidates.value?.items[0];
  const homeCity=me.areas.find(city=>city.id===own.value?.published?.areaId)?.label;
  const selectedCity=me.areas.find(city=>city.id===searchArea)?.label;
  const restart=()=>{setPaging({scope:searchScope,cursors:[null]});setSelected(null);};
  const onChecked=(value:DiscoveryLocation)=>{installLocation(value);restart();setSearchVersion(version=>version+1);setOutsideArea(!value.expiresAt);setConfirmation(value.expiresAt?"Location confirmed.":"");};
  const saveDistance=(value:DistancePreferences)=>{distance.install(value);restart();setSearchVersion(version=>version+1);setShowDistance(false);setConfirmation(value.preference?"Distance preferences saved.":"Search location removed. You’re browsing by city.");};
  const refreshSearch=()=>{restart();distance.retry();setSearchVersion(version=>version+1);};
  const jumpTo=(id:string)=>{
    const destination=document.getElementById(id);
    destination?.focus({preventScroll:true});
    destination?.scrollIntoView({block:"start"});
  };
  const changeVisibility=async(paused:boolean)=>{
    if(busy||visibilityRequest.current||!me.canDiscover||!own.value?.published||own.value.suspended)return;
    const request=new AbortController();
    visibilityRequest.current=request;
    setBusy(true);
    setVisibilityError("");
    setConfirmation("");
    try {
      const value=await discoveryRequest<OwnDiscoveryProfile>(userId,"/api/discovery/profile/visibility",{
        method:"POST",signal:request.signal,body:JSON.stringify({paused}),
      });
      if(!request.signal.aborted){own.install(value);restart();setSearchVersion(version=>version+1);setConfirmation(value.paused?"Discovery visibility paused.":"Discovery visibility resumed.");}
    } catch(error) {
      if(!request.signal.aborted)setVisibilityError(error instanceof Error?error.message:"Couldn’t update visibility. Try again.");
    } finally {
      visibilityRequest.current=null;
      if(!request.signal.aborted)setBusy(false);
    }
  };
  if(!me.canDiscover)return <section className={me.discoveryLockedIn ? styles.pausedDiscovery : styles.card}>
    <h1>{me.discoveryLockedIn?"Discovery is paused while you’re locked in.":"Discovery is not available."}</h1>
    {emailVerified===false&&!me.discoveryLockedIn?<><p>Verify your email to use Discovery. Availability also depends on account eligibility.</p><button className={styles.primary} onClick={()=>void leave("/verify-email?pending=1")}>Verify email</button></>:null}
    <p>{partner.value ? `You’re off the market and on with ${partner.value}. Your existing chats are still in Inbox.` : "You can still access your existing conversations in Inbox."}</p>
    <div className={`${styles.actions} ${styles.pausedActions}`}>
      {me.discoveryLockedIn?<button className={styles.primary} onClick={()=>void leave("/journey")}>Open Together</button>:null}
      <button onClick={()=>void leave("/connections")}>Go to Inbox</button>
    </div>
  </section>;
  if(own.error)return <section role="alert"><p>{own.error}</p><button onClick={own.retry}>Try again</button></section>;
  if(!own.value)return <p role="status">Loading your profile…</p>;
  if(matchingOpen)return <><h1>Discovery matching</h1><DiscoveryMatchPreferences onCancel={()=>setShowMatching(false)} onSaved={value=>{setShowMatching(false);restart();setSearchVersion(version=>version+1);setConfirmation(value.settings?"Matching preferences saved.":"");}}/></>;
  if(setupRequired&&!own.value.paused&&!own.value.suspended)return <section className={styles.card}><p className={styles.eyebrow}>Private matching</p><h1>Meet people who are open to meeting you.</h1><p>Set who you’re open to meeting. We’ll only show people when your preferences fit both ways.</p><div className={styles.actions}><button className={styles.primary} onClick={()=>setShowMatching(true)}>Set up matching</button><button onClick={()=>void leave("/connections")}>Go to Inbox</button></div></section>;
  if(location&&!setupRequired&&own.value.published&&!own.value.suspended&&(!searchArea||own.value.paused)&&(worldwide||own.value.published.areaId!==worldwideDiscoveryArea)){
    const paused=own.value.paused;
    return <div className={local.page}>
      <section className={local.hero} aria-labelledby="local-discovery-title">
        <p className={local.eyebrow}>Local Discovery</p>
        <h1 id="local-discovery-title">{paused?"Your visibility is paused.":"Confirm your current area."}</h1>
        <p className={local.intro}>{paused?"Your profile won’t appear in Discovery while visibility is paused. You can turn it back on below.":worldwide?"See people near your current area. We check only when you ask and use your broad area for up to 24 hours. Other people won’t see your location or distance.":"See people in the same supported area. We check only when you ask and keep only your metro area and when the check expires."} Existing chats and direct invites still work without it.</p>
        {!paused&&location.expiresAt?<p className={local.message} role="status">Your location check expired. Confirm again to keep browsing.</p>:!paused&&outsideArea&&!worldwide?<p className={local.message} role="status">You’re outside an area where Discovery is open right now.</p>:null}
        {confirmation?<p className={local.message} role="status">{confirmation}</p>:null}
        <div className={local.actions}>
          {!paused?<DiscoveryLocationCheck userId={userId} confirmed={false} onChecked={onChecked} buttonClassName={local.primary}/>:null}
          {me.matching?.complete?<button type="button" onClick={()=>jumpTo("local-matching")}>Matching preferences</button>:null}
          <button type="button" onClick={()=>jumpTo("local-visibility")}>Manage visibility</button>
          <button type="button" onClick={()=>void leave("/connections")}>Go to Inbox</button>
        </div>
      </section>
      <div className={local.settings}>
        <section className={local.panel} aria-labelledby="local-matching">
          <h2 id="local-matching" tabIndex={-1}>Matching preferences</h2>
          <p>Choose who you’re open to meeting. You can change this any time.</p>
          <div className={local.rangeNote}>
            <strong>{worldwide?"Distance":"Search area"}</strong>
            <span>{worldwide?"About 50 km":"Your confirmed metro area"}</span>
            <p>{worldwide?"Local Discovery uses a fixed range around your confirmed area.":"People need a current location check in the same supported area."}</p>
          </div>
          {me.matching?.complete?<DiscoveryMatchPreferences compact onSaved={()=>{restart();setSearchVersion(version=>version+1);setLocalPreferenceNotice("Matching preferences saved.");}}/>:null}
          {localPreferenceNotice?<p className={local.message} role="status">{localPreferenceNotice}</p>:null}
          <div className={local.rangeNote}>
            <strong>Looking for</strong>
            <p>{own.value.published.intention==="LONG_TERM"?"A long-term relationship":own.value.published.intention==="OPEN_TO_LONG_TERM"?"Open to a long-term relationship":"Edit your relationship goal in your Discovery profile."}</p>
          </div>
          <div className={local.panelActions}>
            {me.matching?.complete?<button type="button" disabled={busy} onClick={()=>setShowMatching(true)}>More matching settings</button>:null}
            <button type="button" disabled={busy} onClick={()=>void leave("/discover/profile")}>My Discovery profile</button>
          </div>
        </section>
        <section className={local.panel} aria-labelledby="local-visibility">
          <h2 id="local-visibility" tabIndex={-1}>Manage visibility</h2>
          <p>Decide whether your profile can appear in Discovery.</p>
          <button type="button" className={local.toggle} role="switch" aria-checked={!paused} aria-labelledby="discover-toggle-label"
            aria-describedby="discover-toggle-hint" disabled={busy} onClick={()=>void changeVisibility(!paused)}>
            <span><strong id="discover-toggle-label">Show me in Discovery</strong><span id="discover-toggle-hint">Turn this off to hide your profile from Discovery. Existing chats and direct invites still work.</span></span>
            <span className={local.switchTrack} aria-hidden="true"/>
          </button>
          <p className={local.privacy}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
            <span>{worldwide?"Your exact location and distance aren’t shown to other people.":"Your exact location isn’t shown. Discovery uses your metro area while the location check is active."}</span>
          </p>
          <p className={local.visibilityStatus}>Status: <strong>{paused?"Hidden from Discovery":"On · confirm your area to appear nearby"}</strong></p>
          {visibilityError?<p role="alert" className={local.message}>{visibilityError}</p>:null}
        </section>
      </div>
    </div>;
  }
  if(!canBrowse)return <section className={styles.card}><p className={styles.eyebrow}>Optional discovery</p><h1>{own.value.paused?"Your visibility is paused.":"Meet someone to build with."}</h1><p>Choose exactly what to publish before exploring. Your shared space stays separate.</p><button className={styles.primary} onClick={()=>void leave("/discover/profile")}>{own.value.paused?"Manage visibility":"Set up my profile"}</button></section>;
  if(!worldwide&&own.value.published?.areaId===worldwideDiscoveryArea) return <section className={styles.card}><h1>Choose a city to use Discovery</h1><p>Update and publish your profile with a supported city before you browse again.</p><div className={styles.actions}><button className={styles.primary} onClick={()=>void leave("/discover/profile")}>Edit my profile</button><button onClick={()=>void leave("/connections")}>Go to Inbox</button></div></section>;
  const canSetDistance=!location&&distance.value&&(distance.value.configured||preference);
  return <><p className={styles.eyebrow}>Discovery · {location?"Browse locally":preference?"Browse by distance":"Browse by city"}</p><h1>{worldwide?"People nearby":"Find someone to build with."}</h1>
    <div className={`${styles.actions} ${styles.browseActions}`}>{!location&&distance.value&&!preference?<label className={styles.areaPicker}>Explore an area<select ref={cityPicker} aria-label="Explore an area" className={styles.field} value={searchArea} onChange={event=>{setArea(event.target.value);restart();}}>{me.areas.map(area=><option key={area.id} value={area.id}>{area.label}</option>)}</select></label>:null}
      {location?<DiscoveryLocationCheck userId={userId} confirmed currentExpiresAt={worldwide?location.expiresAt:undefined} onChecked={onChecked}/>:null}
      {canSetDistance?<button type="button" aria-expanded={showDistance} onClick={()=>setShowDistance(value=>!value)}>Distance preferences</button>:null}
      {me.matching?<button type="button" onClick={()=>setShowMatching(true)}>Matching preferences</button>:null}
      <button onClick={()=>void leave("/discover/profile")}>My discovery profile</button>
    </div>
    {confirmation?<p role="status">{confirmation}</p>:null}
    {distance.error?<p role="alert">{distance.error} <button onClick={refreshSearch}>Reload preferences</button></p>:null}
    {showDistance&&distance.value?<DiscoveryDistancePreferences userId={userId} initial={distance.value} onSaved={saveDistance} onCancel={()=>setShowDistance(false)}/>:null}
    {location?<p className={styles.muted}>{worldwide?"Browsing near your confirmed location.":`Browsing ${selectedCity??"your confirmed area"}.`} Traveling? Update your location once you arrive.</p>:distance.value?<p className={styles.muted}>{preference
      ? `Searching within ${preference.maxDistanceMiles} mi of your saved location${preference.areaLabel?` near ${preference.areaLabel}`:""}. Your profile still shows only ${homeCity??"your published city"}.`
      : `Browse one city at a time. ${searchArea!==own.value.published?.areaId&&homeCity?`Your profile stays listed in ${homeCity}.`:"Your city is chosen by you, not detected by GPS."}`}</p>:null}
    <details className={styles.recommendationInfo}><summary>How recommendations work</summary><p>{worldwide?"We show eligible people within roughly 50 km of your checked area. We don’t show precise locations or sort by distance.":location?"We show eligible people with a recent location check in the same metro area.":preference?"We show eligible people within both people’s distance ranges. Results aren’t ordered by nearest distance or a compatibility score.":"We show eligible people in the city you pick. Shared interests, relationship goals and recent use of Discovery can influence the order in smaller pools."} We don’t show when someone was last active.</p></details>
    {candidates.error?<div role="alert" className={`${styles.notice} ${styles.error}`}><p>{candidates.error}</p><button onClick={refreshSearch}>{before?"Back to first results":"Try again"}</button></div>:null}
    {!candidates.value&&!candidates.error&&!distance.error?<p role="status">Loading opted-in people…</p>:null}
    {chosen?<CandidateDetail key={`${searchVersion}:${searchScope}:${chosen.id}`} profileId={chosen.id}/>:null}
    {candidates.value?<>{candidates.value.items.length?<DiscoveryCandidateList candidates={candidates.value.items} selectedId={chosen?.id??null} onSelect={setSelected}/>:<section className={styles.card}><h2>{candidates.value.nextCursor?"No profiles to show on this page":before?"No more people on this page":preference?"No profiles fit your distance preferences right now.":selectedCity?`No profiles to show in ${selectedCity} yet`:"No profiles to show here yet"}</h2><p>{candidates.value.nextCursor?"Choose More people to continue searching within your preferences.":"We don’t expand your search automatically."}</p>{candidates.value.nextCursor||location?null:preference?<button onClick={()=>setShowDistance(true)}>Change distance</button>:me.areas.length>1?<button onClick={()=>cityPicker.current?.focus()}>Explore another area</button>:null}</section>}<div className={styles.actions}>{cursors.length>1?<button onClick={()=>{setPaging({scope:searchScope,cursors:cursors.slice(0,-1)});setSelected(null);}}>Previous people</button>:null}{candidates.value.nextCursor?<button onClick={()=>{setPaging({scope:searchScope,cursors:[...cursors,candidates.value!.nextCursor]});setSelected(null);}}>More people</button>:null}</div></>:null}
  </>;
}
function CandidateDetail({profileId}:{profileId:string}){
  const {userId,leave,me}=useDiscovery();
  const load=useCallback((signal:AbortSignal)=>discoveryRequest<PublicDiscoveryProfile>(userId,`/api/discovery/profiles/${profileId}`,{signal}),[userId,profileId]);
  const profile=useDiscoveryResource(userId,profileId,load);
  if(profile.error)return <p role="status" className={styles.notice}>This profile is no longer available.</p>;
  if(!profile.value)return <p role="status">Opening profile…</p>;
  const person=profile.value;
  const reasons=person.recommendation;
  const why=reasons?[reasons.sameArea?(person.areaId===worldwideDiscoveryArea?"Nearby":"Same Discovery city"):null,reasons.sameIntention?"Same relationship goal":"Compatible relationship goals",reasons.sharedInterests.length?`Shared interests: ${reasons.sharedInterests.join(", ")}`:null].filter(Boolean):[];
  const profileSource={sourceType:"PROFILE" as const,sourceId:person.id};
  const reports=[profileSource,...(person.photos??[]).map((photo,index)=>({sourceType:"PHOTO" as const,sourceId:photo.id,label:`Discovery photo ${index+1}`}))];
  return <section className={styles.card} aria-label="Selected person">
    <DiscoveryProfileCard profile={person} area={person.areaId===worldwideDiscoveryArea?"Nearby":me.areas.find(area=>area.id===person.areaId)?.label} photoIds={person.photos?.map(photo=>photo.id)} onReply={target=>void leave(`/connections?${new URLSearchParams({profile:person.id,...("photo" in target?{photo:target.photo}:{reply:target.prompt})})}`)}>
      {why.length?<p className={styles.muted}><strong>Why you’re seeing this profile:</strong> {why.join(" · ")}</p>:null}
      <button className={styles.primary} onClick={()=>void leave(`/connections?profile=${encodeURIComponent(person.id)}`)}>Start a conversation</button>
      <DiscoverySafetyActions profileId={person.id} reportSource={profileSource} reportSources={reports} onBlocked={()=>void leave("/connections")}/>
    </DiscoveryProfileCard>
  </section>;
}
