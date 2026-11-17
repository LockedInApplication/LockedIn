"use client";
import {useCallback,useState} from "react";
import DiscoveryShell,{useDiscovery} from "./DiscoveryShell";
import {discoveryRequest} from "./discovery.client";
import {useDiscoveryResource} from "./use-discovery-resource";
import type {OwnDiscoveryProfile,PageOf,PublicDiscoveryProfile} from "./discovery.types";
import NearbyRadar from "./NearbyRadar";
import DiscoveryCandidateList from "./DiscoveryCandidateList";
import DiscoveryProfileCard from "./DiscoveryProfileCard";
import styles from "./discovery.module.scss";
import DiscoverySafetyActions from "./DiscoverySafetyActions";
export default function DiscoverPage(){return <DiscoveryShell><DiscoveryBrowse/></DiscoveryShell>;}
function DiscoveryBrowse(){
  const {userId,emailVerified,me,leave}=useDiscovery(),[area,setArea]=useState(""),[cursors,setCursors]=useState<(string|null)[]>([null]),[selected,setSelected]=useState<string|null>(null);
  const loadOwn=useCallback((signal:AbortSignal)=>discoveryRequest<OwnDiscoveryProfile>(userId,"/api/discovery/profile",{signal}),[userId]);
  const own=useDiscoveryResource(userId,"profile",loadOwn);
  const searchArea=area||own.value?.published?.areaId||"",before=cursors.at(-1);
  const canBrowse=!!(me.canDiscover&&own.value?.published&&!own.value.paused&&!own.value.suspended);
  const load=useCallback((signal:AbortSignal)=>discoveryRequest<PageOf<PublicDiscoveryProfile>>(userId,`/api/discovery/candidates?areaId=${encodeURIComponent(searchArea)}${before?`&before=${encodeURIComponent(before)}`:""}`,{signal}),[userId,searchArea,before]);
  const candidates=useDiscoveryResource(userId,canBrowse&&searchArea?`${searchArea}:${before??""}`:"",load);
  const chosen=candidates.value?.items.find(item=>item.id===selected)??candidates.value?.items[0];
  if(!me.canDiscover)return <section className={styles.card}><h1>Discovery is not available.</h1>{emailVerified===false?<><p>Verify your email to use Discovery. You’ll also need pilot access and account eligibility. Your existing shared space is still available.</p><button className={styles.primary} onClick={()=>void leave("/verify-email?pending=1")}>Verify email</button></>:null}<p>Your existing shared space and starter history are unchanged.</p><button onClick={()=>void leave("/connections")}>Starter history</button></section>;
  if(own.error)return <section role="alert"><p>{own.error}</p><button onClick={own.retry}>Try again</button></section>;
  if(!own.value)return <p role="status">Loading your profile…</p>;
  if(!canBrowse)return <section className={styles.card}><p className={styles.eyebrow}>Optional discovery</p><h1>{own.value.paused?"Your visibility is paused.":"Meet someone to build with."}</h1><p>Choose exactly what to publish before exploring. Your shared space stays separate.</p><button className={styles.primary} onClick={()=>void leave("/discover/profile")}>{own.value.paused?"Manage visibility":"Set up my profile"}</button></section>;
  return <><p className={styles.eyebrow}>Optional · broad areas only</p><h1>Find someone to build with.</h1><div className={styles.actions}><label>Explore an area <select className={styles.field} value={searchArea} onChange={event=>{setArea(event.target.value);setCursors([null]);setSelected(null);}}>{me.areas.map(area=><option key={area.id} value={area.id}>{area.label}</option>)}</select></label><button onClick={()=>void leave("/discover/profile")}>My discovery profile</button></div>
    {candidates.error?<p role="alert" className={`${styles.notice} ${styles.error}`}>{candidates.error}<button onClick={candidates.retry}>Try again</button></p>:null}
    {!candidates.value&&!candidates.error?<p role="status">Loading opted-in people…</p>:null}
    {chosen?<CandidateDetail key={chosen.id} profileId={chosen.id}/>:null}
    {candidates.value?<><DiscoveryCandidateList candidates={candidates.value.items} selectedId={chosen?.id??null} onSelect={setSelected}/>{!candidates.value.items.length?<NearbyRadar candidates={[]} selectedId={null} onSelect={setSelected}/>:<details><summary>Illustrative radar</summary><NearbyRadar candidates={candidates.value.items} selectedId={chosen?.id??null} onSelect={setSelected}/></details>}<div className={styles.actions}>{cursors.length>1?<button onClick={()=>{setCursors(value=>value.slice(0,-1));setSelected(null);}}>Previous people</button>:null}{candidates.value.nextCursor?<button onClick={()=>{setCursors(value=>[...value,candidates.value!.nextCursor]);setSelected(null);}}>More people</button>:null}</div></>:null}
  </>;
}
function CandidateDetail({profileId}:{profileId:string}){
  const {userId,leave,me}=useDiscovery();
  const load=useCallback((signal:AbortSignal)=>discoveryRequest<PublicDiscoveryProfile>(userId,`/api/discovery/profiles/${profileId}`,{signal}),[userId,profileId]);
  const profile=useDiscoveryResource(userId,profileId,load);
  if(profile.error)return <p role="status" className={styles.notice}>This profile is no longer available.</p>;
  if(!profile.value)return <p role="status">Opening profile…</p>;
  const person=profile.value;
  const profileSource={sourceType:"PROFILE" as const,sourceId:person.id};
  const reports=[profileSource,...(person.photos??[]).map((photo,index)=>({sourceType:"PHOTO" as const,sourceId:photo.id,label:`Discovery photo ${index+1}`}))];
  return <section className={styles.card} aria-label="Selected person">
    <DiscoveryProfileCard profile={person} area={me.areas.find(area=>area.id===person.areaId)?.label} photoIds={person.photos?.map(photo=>photo.id)}>
      <button className={styles.primary} onClick={()=>void leave(`/connections?profile=${encodeURIComponent(person.id)}`)}>Start a conversation</button>
      <DiscoverySafetyActions profileId={person.id} reportSource={profileSource} reportSources={reports} onBlocked={()=>void leave("/connections")}/>
    </DiscoveryProfileCard>
  </section>;
}
