"use client";
import {useCallback,useState} from "react";
import DiscoveryShell,{useDiscovery} from "./DiscoveryShell";
import {discoveryRequest} from "./discovery.client";
import {useDiscoveryResource} from "./use-discovery-resource";
import type {OwnDiscoveryProfile,DiscoveryProfileInput} from "./discovery.types";
import DiscoveryProfileEditor from "./DiscoveryProfileEditor";
import DiscoveryProfileCard from "./DiscoveryProfileCard";
import DiscoveryPhotoEditor from "./photos/DiscoveryPhotoEditor";
import styles from "./discovery.module.scss";
export default function DiscoveryProfilePage(){return <DiscoveryShell><ProfileEditor/></DiscoveryShell>;}
function ProfileEditor(){
  const {userId,me,setDirty,dirty,setBusy,busy}=useDiscovery(),[notice,setNotice]=useState(""),[editing,setEditing]=useState(false);
  const load=useCallback((signal:AbortSignal)=>discoveryRequest<OwnDiscoveryProfile>(userId,"/api/discovery/profile",{signal}),[userId]);
  const own=useDiscoveryResource(userId,"profile",load);
  const save=async(draft:DiscoveryProfileInput)=>{setBusy(true);try{own.install(await discoveryRequest(userId,"/api/discovery/profile",{method:"PUT",body:JSON.stringify({...draft,revision:own.value!.revision})}));setNotice("Private draft saved. It has not been published.");setDirty(false);}finally{setBusy(false);}};
  const publish=async()=>{setBusy(true);try{own.install(await discoveryRequest(userId,"/api/discovery/profile/publish",{method:"POST",body:JSON.stringify({draftRevision:own.value!.revision,adultAttested:true})}));setNotice("Profile published. Your earlier invitations keep their send-time information.");setDirty(false);setEditing(false);}finally{setBusy(false);}};
  const visibility=async(paused:boolean)=>{setBusy(true);try{own.install(await discoveryRequest(userId,"/api/discovery/profile/visibility",{method:"POST",body:JSON.stringify({paused})}));setNotice(paused?"Discovery paused. Existing conversations remain available.":"Discovery visibility resumed.");}catch(error){setNotice(error instanceof Error?error.message:"Please try again.");}finally{setBusy(false);}};
  const hasPhotoEditor=!!(me.canDiscover&&me.photos?.enabled&&me.photos.configured)||!!own.value?.draft?.photoIds?.length||!!own.value?.published?.photoIds?.length;
  const published=own.value?.published;
  const viewing=!!published&&me.canDiscover&&!editing;
  const showPhotos=!!(me.photos?.enabled&&me.photos.configured);
  return <><h1>{viewing?"My Discovery profile":"Edit Discovery profile"}</h1>{notice?<p role="status" className={styles.notice}>{notice}</p>:null}{own.error?<p role="alert">{own.error}<button onClick={own.retry}>Try again</button></p>:null}{!own.value&&!own.error?<p role="status">Loading your profile…</p>:null}{own.value?<>
    <div className={styles.actions}>
      {published?<span className={styles.status}>{own.value.paused?"Paused":"Published"}</span>:null}
      {published&&me.canDiscover?<button type="button" className={styles.primary} disabled={busy||dirty} onClick={()=>setEditing(viewing)}>{viewing?"Edit profile":"View published profile"}</button>:null}
      {!viewing&&hasPhotoEditor?<button type="button" onClick={()=>{const target=document.getElementById("discovery-photos-heading");target?.focus({preventScroll:true});target?.scrollIntoView({block:"start"});}}>Manage photos</button>:null}
      {published?<button disabled={busy||dirty||(own.value.paused&&!me.canDiscover)} onClick={()=>void visibility(!own.value!.paused)}>{own.value.paused?"Resume visibility":"Pause discovery"}</button>:null}
    </div>
    {viewing&&published?<section className={styles.card} aria-label="Published Discovery profile">
      <p className={styles.eyebrow}>{own.value.paused?"Hidden while Discovery is paused":"What others see in Discover"}</p>
      <DiscoveryProfileCard key={own.value.publicationVersion} profile={published} area={me.areas.find(area=>area.id===published.areaId)?.label} photoIds={showPhotos?published.photoIds:undefined}/>
    </section>:<>
    {me.canDiscover?<DiscoveryProfileEditor key={`${own.value.revision}:${own.value.publicationVersion}`} initial={own.value} areas={me.areas} onDirty={setDirty} onSave={save} onPublish={publish} externallyBusy={busy}/>:<section className={styles.card}><p>New discovery is unavailable for this account. Your saved data stays private; you can still pause an existing publication.</p></section>}
    <DiscoveryPhotoEditor profile={own.value} install={own.install}/>
    </>}
  </>:null}</>;
}
