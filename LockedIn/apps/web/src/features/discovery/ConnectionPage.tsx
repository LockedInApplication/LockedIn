"use client";
import {useCallback,useRef,useState} from "react";
import DiscoveryShell,{useDiscovery} from "./DiscoveryShell";
import {discoveryRequest} from "./discovery.client";
import {useDiscoveryResource} from "./use-discovery-resource";
import type {DiscoveryConnectionView} from "./discovery.types";
import StarterConversation from "./StarterConversation";
import BuildTogetherPanel from "./BuildTogetherPanel";
import DiscoverySafetyActions from "./DiscoverySafetyActions";
import ConfirmDialog from "@/components/ConfirmDialog";
import styles from "./discovery.module.scss";
export default function ConnectionPage({connectionId}:{connectionId:string}){return <DiscoveryShell><Connection key={connectionId} id={connectionId}/></DiscoveryShell>;}
function Connection({id}:{id:string}){
  const {userId}=useDiscovery(),load=useCallback((signal:AbortSignal)=>discoveryRequest<DiscoveryConnectionView>(userId,`/api/discovery/connections/${id}`,{signal}),[userId,id]);
  const resource=useDiscoveryResource(userId,id,load);
  if(resource.error)return <section className={styles.card} role="alert"><h1>We could not open this starter.</h1><p>{resource.error}</p><button onClick={resource.retry}>Try again</button></section>;
  if(!resource.value)return <p role="status">Opening this conversation…</p>;
  return <Starter key={`${userId}:${id}`} initial={resource.value} onRefresh={resource.retry}/>;
}
function Starter({initial,onRefresh}:{initial:DiscoveryConnectionView;onRefresh:()=>void}){
  const {userId,me,refreshAccess,leave,setDirty,busy,setBusy,confirmLeave}=useDiscovery(),[connection,setConnection]=useState(initial),[text,setText]=useState(initial.ownDraft?.text??""),[notice,setNotice]=useState(""),[close,setClose]=useState(false);
  const shareAttempt=useRef<{revision:number;id:string}|null>(null),url=`/api/discovery/connections/${connection.id}`;
  const run=async(path:string,body:object,method="POST")=>{setBusy(true);setNotice("");try{const next=await discoveryRequest<DiscoveryConnectionView>(userId,path,{method,body:JSON.stringify(body)});setConnection(next);if(next.state==="PROMOTED")refreshAccess();return next;}catch(error){setNotice(error instanceof Error?error.message:"Please try again.");return null;}finally{setBusy(false);}};
  const save=async()=>{const next=await run(`${url}/draft`,{text,revision:connection.ownDraft?.revision??0},"PUT");if(next){setDirty(false);setNotice("Saved privately. Nothing was shared.");}};
  const share=async()=>{const revision=connection.ownDraft?.revision??0;if(shareAttempt.current?.revision!==revision)shareAttempt.current={revision,id:crypto.randomUUID()};const next=await run(`${url}/share`,{draftRevision:revision,requestId:shareAttempt.current.id});if(next)setNotice("Saved response shared with this connection.");};
  const safetySource=connection.sharedResponses.filter(response=>response.author==="partner").at(-1);
  const onBlocked=()=>{setDirty(false);onRefresh();setConnection(value=>({...value,state:"CLOSED",canAccept:false,canShare:false,canChooseBuild:false,canClose:false,readiness:{...value.readiness,mine:false,theirs:false}}));};
  return <><button disabled={busy} onClick={()=>void leave("/connections")}>← Connections</button>{notice?<p role="status" className={styles.notice}>{notice}</p>:null}
    {connection.state==="PENDING"?<section className={styles.card}><p className={styles.eyebrow}>{connection.inviter==="partner"?"Starter invitation":"Waiting for a reply"}</p><h1>{connection.topic.text}</h1><p>From {connection.senderSnapshot.publicName} · send-time public identity</p><p className={styles.quote}>{connection.hello}</p>{connection.canAccept?<div className={styles.actions}><button className={styles.primary} disabled={busy} onClick={()=>void run(`${url}/accept`,{})}>Accept starter</button><button disabled={busy} onClick={()=>void run(`${url}/decline`,{})}>Decline quietly</button></div>:<p>Your invitation stays here for up to seven days. Existing conversations and your private space are still available.</p>}{connection.inviter==="self"?<button disabled={busy} onClick={()=>void run(`${url}/withdraw`,{})}>Withdraw invitation</button>:null}<details><summary>What acceptance means</summary><p>A separate starter conversation—not a full shared workspace. Private responses stay private until explicitly shared.</p></details></section>:<StarterConversation connection={connection} text={text} busy={busy} onChange={value=>{setText(value);setDirty(value!==(connection.ownDraft?.text??""));}} onSave={()=>void save()} onShare={()=>void share()}/>}
    <BuildTogetherPanel connection={connection} busy={busy} currentRelationshipId={me.currentRelationshipId} onChoose={ready=>void run(`${url}/readiness`,{ready,consentVersion:connection.readiness.consentVersion})} onOpen={()=>void leave("/journey")}/>
    {connection.canClose?<button className={styles.danger} disabled={busy} onClick={async()=>{if(await confirmLeave())setClose(true);}}>Close this starter</button>:null}
    <DiscoverySafetyActions connectionId={connection.id} reportSource={safetySource?{sourceType:"SHARED_RESPONSE",sourceId:safetySource.id}:connection.inviter==="partner"?{sourceType:"INVITATION",sourceId:connection.id}:null} onBlocked={onBlocked}/>
    <ConfirmDialog open={close} onCancel={()=>setClose(false)} onConfirm={async()=>{setClose(false);const result=await run(`${url}/close`,{});if(result)setDirty(false);}} title="Close this starter?" description="New responses and build choices stop. Previously shared text remains in read-only history; your private draft stays yours." confirmLabel="Close starter" cancelLabel="Keep starter"/>
  </>;
}
