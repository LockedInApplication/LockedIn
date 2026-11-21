"use client";
import {useCallback,useState} from "react";
import DiscoveryShell,{useDiscovery} from "./DiscoveryShell";
import {discoveryRequest} from "./discovery.client";
import {useDiscoveryResource} from "./use-discovery-resource";
import type {OwnDiscoveryProfile,DiscoveryProfileInput} from "./discovery.types";
import DiscoveryProfileEditor from "./DiscoveryProfileEditor";
import DiscoveryProfileCard from "./DiscoveryProfileCard";
import DiscoveryPhotoEditor from "./photos/DiscoveryPhotoEditor";
import DiscoveryMatchPreferences from "./DiscoveryMatchPreferences";
import styles from "./discovery.module.scss";
export default function DiscoveryProfilePage(){return <DiscoveryShell><ProfileEditor/></DiscoveryShell>;}
function ProfileEditor(){
  const {userId,me,setDirty,dirty,setBusy,busy}=useDiscovery(),[notice,setNotice]=useState(""),[editing,setEditing]=useState(false),[manageMatching,setManageMatching]=useState(false);
  const load=useCallback((signal:AbortSignal)=>discoveryRequest<OwnDiscoveryProfile>(userId,"/api/discovery/profile",{signal}),[userId]);
  const own=useDiscoveryResource(userId,"profile",load);
  const save=async(draft:DiscoveryProfileInput)=>{setBusy(true);try{own.install(await discoveryRequest(userId,"/api/discovery/profile",{method:"PUT",body:JSON.stringify({...draft,revision:own.value!.revision})}));setNotice("Private draft saved. It has not been published.");setDirty(false);}finally{setBusy(false);}};
  const publish=async()=>{setBusy(true);try{own.install(await discoveryRequest(userId,"/api/discovery/profile/publish",{method:"POST",body:JSON.stringify({draftRevision:own.value!.revision,adultAttested:true})}));setNotice("Profile published. Your earlier invitations keep their send-time information.");setDirty(false);setEditing(false);}finally{setBusy(false);}};
  const visibility=async(paused:boolean)=>{setBusy(true);try{own.install(await discoveryRequest(userId,"/api/discovery/profile/visibility",{method:"POST",body:JSON.stringify({paused})}));setNotice(paused?"Discovery paused. Existing conversations remain available.":"Discovery visibility resumed.");}catch(error){setNotice(error instanceof Error?error.message:"Please try again.");}finally{setBusy(false);}};
  const canManage=me.canManageProfile??me.canDiscover;
  const hasPhotoEditor=!!(canManage&&me.photos?.enabled&&me.photos.configured)||!!own.value?.draft?.photoIds?.length||!!own.value?.published?.photoIds?.length;
  const published=own.value?.published;
  const viewing=!!published&&canManage&&!editing;
  const showPhotos=!!(me.photos?.enabled&&me.photos.configured);
  const previewArea=me.location?.required?me.location.areaId:published?.areaId;
  const worldwide=me.location?.mode==="worldwide";
  const needsLocation=me.location?.required&&!(worldwide?me.location.expiresAt:previewArea);
  if(manageMatching)return <><h1>Discovery matching</h1><DiscoveryMatchPreferences onCancel={()=>setManageMatching(false)} onSaved={value=>{setManageMatching(false);setNotice(value.settings?"Matching preferences saved.":"Matching setup removed. Existing chats are unchanged.");}}/></>;
  return <><h1>{viewing?"My Discovery profile":"Edit Discovery profile"}</h1>{notice?<p role="status" className={styles.notice}>{notice}</p>:null}{own.error?<p role="alert">{own.error}<button onClick={own.retry}>Try again</button></p>:null}{!own.value&&!own.error?<p role="status">Loading your profile…</p>:null}{own.value?<>
    <div className={styles.actions}>
      {published?<span className={styles.status}>{own.value.paused?"Paused":"Published"}</span>:null}
      {published&&canManage?<button type="button" className={styles.primary} disabled={busy||dirty} onClick={()=>setEditing(viewing)}>{viewing?"Edit profile":"View published profile"}</button>:null}
      {!viewing&&hasPhotoEditor?<button type="button" onClick={()=>{const target=document.getElementById("discovery-photos-heading");target?.focus({preventScroll:true});target?.scrollIntoView({block:"start"});}}>Manage photos</button>:null}
      {published?<button disabled={busy||dirty||(own.value.paused&&!me.canDiscover)} onClick={()=>void visibility(!own.value!.paused)}>{own.value.paused?"Resume visibility":"Pause discovery"}</button>:null}
      {me.matching&&(me.canDiscover||me.matching.complete)||me.hasSavedMatchingSettings?<button type="button" disabled={busy||dirty} onClick={()=>setManageMatching(true)}>Manage matching preferences</button>:null}
    </div>
    {viewing&&published?<section className={styles.card} aria-label="Published Discovery profile">
      <p className={styles.eyebrow}>{own.value.paused?"Hidden from Discovery. Existing connections can still see your published profile":me.matching&&!me.matching.complete?"Published · Complete matching setup to appear in Discover":needsLocation?"Published · Confirm your location in Discover to appear nearby":"What others see in Discover"}</p>
      <DiscoveryProfileCard key={own.value.publicationVersion} profile={published} area={worldwide?"Nearby":me.areas.find(area=>area.id===previewArea)?.label} photoIds={showPhotos?published.photoIds:undefined}/>
    </section>:<>
    {canManage?<DiscoveryProfileEditor key={`${own.value.revision}:${own.value.publicationVersion}:${worldwide}`} initial={own.value} areas={me.areas} onDirty={setDirty} onSave={save} onPublish={publish} externallyBusy={busy} localDiscovery={me.location?.required} worldwideDiscovery={worldwide}/>:<section className={styles.card}><p>New discovery is unavailable for this account. You can still pause an existing publication. Existing connections may see its published information.</p></section>}
    <DiscoveryPhotoEditor profile={own.value} install={own.install}/>
    </>}
  </>:null}</>;
}
