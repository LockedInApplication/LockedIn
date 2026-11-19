"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import DiscoveryShell,{useDiscovery} from "./DiscoveryShell";
import {discoveryRequest} from "./discovery.client";
import {useDiscoveryResource} from "./use-discovery-resource";
import type {DiscoveryLocation,OwnDiscoveryProfile,PageOf,PublicDiscoveryProfile} from "./discovery.types";
import DiscoveryCandidateList from "./DiscoveryCandidateList";
import DiscoveryProfileCard from "./DiscoveryProfileCard";
import styles from "./discovery.module.scss";
import DiscoverySafetyActions from "./DiscoverySafetyActions";
import DiscoveryDistancePreferences, { type DistancePreferences } from "./DiscoveryDistancePreferences";
import DiscoveryLocationCheck from "./DiscoveryLocationCheck";
export default function DiscoverPage(){return <DiscoveryShell><DiscoveryBrowse/></DiscoveryShell>;}
function DiscoveryBrowse(){
  const {userId,emailVerified,me,leave}=useDiscovery(),[area,setArea]=useState(""),[cursors,setCursors]=useState<(string|null)[]>([null]),[selected,setSelected]=useState<string|null>(null);
  const [showDistance,setShowDistance]=useState(false),[searchVersion,setSearchVersion]=useState(0),[confirmation,setConfirmation]=useState("");
  const [checkedLocation,setCheckedLocation]=useState<DiscoveryLocation|null>(null),[expiredCheck,setExpiredCheck]=useState<string|null>(null);
  const cityPicker=useRef<HTMLSelectElement>(null);
  const loadOwn=useCallback((signal:AbortSignal)=>discoveryRequest<OwnDiscoveryProfile>(userId,"/api/discovery/profile",{signal}),[userId]);
  const own=useDiscoveryResource(userId,"profile",loadOwn);
  const location=me.location&&(checkedLocation??me.location);
  const expiresAt=location?.expiresAt;
  useEffect(()=>{
    if(!expiresAt)return;
    const timer=setTimeout(()=>setExpiredCheck(expiresAt),Math.max(0,Date.parse(expiresAt)-Date.now()));
    return()=>clearTimeout(timer);
  },[expiresAt]);
  const searchArea=location?(expiresAt&&expiresAt!==expiredCheck?location.areaId??"":""):area||own.value?.published?.areaId||"";
  const before=cursors.at(-1);
  const canBrowse=!!(me.canDiscover&&own.value?.published&&!own.value.paused&&!own.value.suspended);
  const loadDistance=useCallback((signal:AbortSignal)=>discoveryRequest<DistancePreferences>(userId,"/api/discovery/distance-preferences",{signal}),[userId]);
  const distance=useDiscoveryResource(userId,canBrowse&&!location?"distance-preferences":"",loadDistance);
  const preference=location?null:distance.value?.preference;
  const query=preference?"mode=distance":`areaId=${encodeURIComponent(searchArea)}`;
  const load=useCallback((signal:AbortSignal)=>discoveryRequest<PageOf<PublicDiscoveryProfile>>(userId,`/api/discovery/candidates?${query}${before?`&before=${encodeURIComponent(before)}`:""}`,{signal}),[userId,query,before]);
  const candidates=useDiscoveryResource(userId,canBrowse&&(location||distance.value)&&searchArea?`${query}:${before??""}:${searchVersion}`:"",load);
  const chosen=candidates.value?.items.find(item=>item.id===selected)??candidates.value?.items[0];
  const homeCity=me.areas.find(city=>city.id===own.value?.published?.areaId)?.label;
  const selectedCity=me.areas.find(city=>city.id===searchArea)?.label;
  const restart=()=>{setCursors([null]);setSelected(null);};
  const onChecked=(value:DiscoveryLocation)=>{setCheckedLocation(value);restart();setSearchVersion(version=>version+1);setConfirmation(value.areaId?"Location confirmed.":"You’re outside an area where Discovery is open right now.");};
  const saveDistance=(value:DistancePreferences)=>{distance.install(value);restart();setSearchVersion(version=>version+1);setShowDistance(false);setConfirmation(value.preference?"Distance preferences saved.":"Search location removed. You’re browsing by city.");};
  const refreshSearch=()=>{restart();distance.retry();setSearchVersion(version=>version+1);};
  if(!me.canDiscover)return <section className={styles.card}><h1>Discovery is not available.</h1>{emailVerified===false?<><p>Verify your email to use Discovery. Availability also depends on account eligibility and the current rollout. Your existing shared space is still available.</p><button className={styles.primary} onClick={()=>void leave("/verify-email?pending=1")}>Verify email</button></>:null}<p>Your existing shared space and starter history are unchanged.</p><button onClick={()=>void leave("/connections")}>Starter history</button></section>;
  if(own.error)return <section role="alert"><p>{own.error}</p><button onClick={own.retry}>Try again</button></section>;
  if(!own.value)return <p role="status">Loading your profile…</p>;
  if(!canBrowse)return <section className={styles.card}><p className={styles.eyebrow}>Optional discovery</p><h1>{own.value.paused?"Your visibility is paused.":"Meet someone to build with."}</h1><p>Choose exactly what to publish before exploring. Your shared space stays separate.</p><button className={styles.primary} onClick={()=>void leave("/discover/profile")}>{own.value.paused?"Manage visibility":"Set up my profile"}</button></section>;
  if(location&&!searchArea)return <section className={styles.card}><p className={styles.eyebrow}>Local Discovery</p><h1>Confirm your current area.</h1><p>See people in the same supported area. We check only when you ask and keep only your metro area and when the check expires. Existing chats and direct invites still work without it.</p>{location.areaId?<p role="status">Your location check expired. Confirm again to keep browsing.</p>:confirmation?<p role="status">{confirmation}</p>:null}<div className={styles.actions}><DiscoveryLocationCheck userId={userId} confirmed={false} onChecked={onChecked}/><button onClick={()=>void leave("/connections")}>Go to Connections</button></div></section>;
  const canSetDistance=!location&&distance.value&&(distance.value.configured||preference);
  return <><p className={styles.eyebrow}>Discovery · {location?"Browse locally":preference?"Browse by distance":"Browse by city"}</p><h1>Find someone to build with.</h1>
    <div className={`${styles.actions} ${styles.browseActions}`}>{!location&&distance.value&&!preference?<label className={styles.areaPicker}>Explore an area<select ref={cityPicker} aria-label="Explore an area" className={styles.field} value={searchArea} onChange={event=>{setArea(event.target.value);restart();}}>{me.areas.map(area=><option key={area.id} value={area.id}>{area.label}</option>)}</select></label>:null}
      {location?<DiscoveryLocationCheck userId={userId} confirmed onChecked={onChecked}/>:null}
      {canSetDistance?<button type="button" aria-expanded={showDistance} onClick={()=>setShowDistance(value=>!value)}>Distance preferences</button>:null}
      <button onClick={()=>void leave("/discover/profile")}>My discovery profile</button>
    </div>
    {confirmation?<p role="status">{confirmation}</p>:null}
    {distance.error?<p role="alert">{distance.error} <button onClick={refreshSearch}>Reload preferences</button></p>:null}
    {showDistance&&distance.value?<DiscoveryDistancePreferences userId={userId} initial={distance.value} onSaved={saveDistance} onCancel={()=>setShowDistance(false)}/>:null}
    {location?<p className={styles.muted}>Browsing {selectedCity??"your confirmed area"}. Traveling? Update your location once you arrive.</p>:distance.value?<p className={styles.muted}>{preference
      ? `Searching within ${preference.maxDistanceMiles} mi of your saved location${preference.areaLabel?` near ${preference.areaLabel}`:""}. Your profile still shows only ${homeCity??"your published city"}.`
      : `Browse one city at a time. ${searchArea!==own.value.published?.areaId&&homeCity?`Your profile stays listed in ${homeCity}.`:"Your city is chosen by you, not detected by GPS."}`}</p>:null}
    <details><summary>How recommendations work</summary><p>{location?"We show eligible people with a recent location check in the same metro area.":preference?"We show eligible people within both people’s distance ranges. Results aren’t ordered by nearest distance or a compatibility score.":"We show eligible people in the city you pick. Shared interests, relationship goals and recent use of Discovery can influence the order in smaller pools."} We don’t show when someone was last active.</p></details>
    {candidates.error?<div role="alert" className={`${styles.notice} ${styles.error}`}><p>{candidates.error}</p><button onClick={refreshSearch}>{before?"Back to first results":"Try again"}</button></div>:null}
    {!candidates.value&&!candidates.error&&!distance.error?<p role="status">Loading opted-in people…</p>:null}
    {chosen?<CandidateDetail key={`${searchVersion}:${chosen.id}`} profileId={chosen.id}/>:null}
    {candidates.value?<>{candidates.value.items.length?<DiscoveryCandidateList candidates={candidates.value.items} selectedId={chosen?.id??null} onSelect={setSelected}/>:<section className={styles.card}><h2>{candidates.value.nextCursor?"No profiles to show on this page":before?"No more people on this page":preference?"No profiles fit your distance preferences right now.":selectedCity?`No profiles to show in ${selectedCity} yet`:"No profiles to show here yet"}</h2><p>{candidates.value.nextCursor?"Choose More people to continue searching within your preferences.":"We don’t expand your search automatically."}</p>{candidates.value.nextCursor||location?null:preference?<button onClick={()=>setShowDistance(true)}>Change distance</button>:me.areas.length>1?<button onClick={()=>cityPicker.current?.focus()}>Explore another area</button>:null}</section>}<div className={styles.actions}>{cursors.length>1?<button onClick={()=>{setCursors(value=>value.slice(0,-1));setSelected(null);}}>Previous people</button>:null}{candidates.value.nextCursor?<button onClick={()=>{setCursors(value=>[...value,candidates.value!.nextCursor]);setSelected(null);}}>More people</button>:null}</div></>:null}
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
  const why=reasons?[reasons.sameArea?"Same Discovery city":null,reasons.sameIntention?"Same relationship goal":"Compatible relationship goals",reasons.sharedInterests.length?`Shared interests: ${reasons.sharedInterests.join(", ")}`:null].filter(Boolean):[];
  const profileSource={sourceType:"PROFILE" as const,sourceId:person.id};
  const reports=[profileSource,...(person.photos??[]).map((photo,index)=>({sourceType:"PHOTO" as const,sourceId:photo.id,label:`Discovery photo ${index+1}`}))];
  return <section className={styles.card} aria-label="Selected person">
    <DiscoveryProfileCard profile={person} area={me.areas.find(area=>area.id===person.areaId)?.label} photoIds={person.photos?.map(photo=>photo.id)} onReply={target=>void leave(`/connections?${new URLSearchParams({profile:person.id,...("photo" in target?{photo:target.photo}:{reply:target.prompt})})}`)}>
      {why.length?<p className={styles.muted}><strong>Why you’re seeing this profile:</strong> {why.join(" · ")}</p>:null}
      <button className={styles.primary} onClick={()=>void leave(`/connections?profile=${encodeURIComponent(person.id)}`)}>Start a conversation</button>
      <DiscoverySafetyActions profileId={person.id} reportSource={profileSource} reportSources={reports} onBlocked={()=>void leave("/connections")}/>
    </DiscoveryProfileCard>
  </section>;
}
