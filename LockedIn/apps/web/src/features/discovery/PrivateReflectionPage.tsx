"use client";
import {useCallback,useState} from "react";
import DiscoveryShell,{useDiscovery} from "./DiscoveryShell";
import {discoveryRequest} from "./discovery.client";
import {useDiscoveryResource} from "./use-discovery-resource";
import type {PrivateReflectionView} from "./discovery.types";
import styles from "./discovery.module.scss";
export default function PrivateReflectionPage(){return <DiscoveryShell><Reflection/></DiscoveryShell>;}
function Reflection(){
  const {userId,leave,busy}=useDiscovery(),load=useCallback((signal:AbortSignal)=>discoveryRequest<PrivateReflectionView>(userId,"/api/discovery/reflection",{signal}),[userId]);
  const resource=useDiscoveryResource(userId,"reflection",load);
  return <><button disabled={busy} onClick={()=>void leave("/profile")}>← Profile</button><p className={styles.eyebrow}>Only you</p><h1>Private reflection</h1><p>What would you like to bring to a relationship? This reflection is never published or shared.</p>{resource.error?<p role="alert">{resource.error}<button onClick={resource.retry}>Try again</button></p>:null}{!resource.value&&!resource.error?<p role="status">Loading your reflection…</p>:null}{resource.value?<ReflectionEditor key={`${userId}:${resource.value.revision}`} initial={resource.value} onSaved={resource.install}/>:null}</>;
}
function ReflectionEditor({initial,onSaved}:{initial:PrivateReflectionView;onSaved:(value:PrivateReflectionView)=>void}){
  const {userId,setDirty,busy,setBusy}=useDiscovery(),[text,setText]=useState(initial.text),[notice,setNotice]=useState("");
  const save=async()=>{setBusy(true);try{const value=await discoveryRequest<PrivateReflectionView>(userId,"/api/discovery/reflection",{method:"PUT",body:JSON.stringify({text,revision:initial.revision})});setDirty(false);onSaved(value);}catch(error){setNotice(error instanceof Error?error.message:"Please try again.");}finally{setBusy(false);}};
  return <form className={`${styles.card} ${styles.form}`} onSubmit={event=>{event.preventDefault();void save();}}><label>Your private reflection<textarea value={text} disabled={busy} maxLength={4000} onChange={event=>{setText(event.target.value);setDirty(event.target.value!==initial.text);}}/></label><button type="submit" className={styles.primary} disabled={busy||text===initial.text}>Save only for me</button>{initial.revision>0?<p className={styles.muted}>Your saved reflection is private.</p>:null}{notice?<p role="alert">{notice}</p>:null}</form>;
}
