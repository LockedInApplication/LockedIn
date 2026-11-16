"use client";
import {useCallback,useRef,useState} from "react";
import DiscoveryShell,{useDiscovery} from "./DiscoveryShell";
import {discoveryRequest} from "./discovery.client";
import {useDiscoveryResource} from "./use-discovery-resource";
import type {DiscoveryConnectionView} from "./discovery.types";
import StarterConversation from "./StarterConversation";
import BuildTogetherPanel from "./BuildTogetherPanel";
import DiscoverySafetyActions,{type DiscoveryReportSource} from "./DiscoverySafetyActions";
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
  const chooseBuild=async(ready:boolean)=>{
    const unsaved=text!==(connection.ownDraft?.text??"");
    if(ready&&unsaved&&!await confirmLeave())return;
    const next=await run(`${url}/readiness`,{ready,consentVersion:connection.readiness.consentVersion});
    if(next&&ready&&unsaved){setText(next.ownDraft?.text??"");setDirty(false);}
  };
  const reportSources:DiscoveryReportSource[]=connection.sharedResponses.filter(response=>response.author==="partner").map(response=>({sourceType:"SHARED_RESPONSE",sourceId:response.id,label:`Shared response · version ${response.version}`,preview:response.text}));
  if(connection.inviter==="partner")reportSources.unshift({sourceType:"INVITATION",sourceId:connection.id,label:"Received invitation",preview:`${connection.topic.text}\n${connection.hello}`});
  const onBlocked=async()=>{
    setDirty(false);
    setConnection(value=>({...value,canAccept:false,canShare:false,canChooseBuild:false,canClose:false,readiness:{...value.readiness,mine:false,theirs:false}}));
    try{setConnection(await discoveryRequest<DiscoveryConnectionView>(userId,url));refreshAccess();}
    catch(error){setNotice(error instanceof Error?error.message:"Contact blocked. Refresh to load its current history.");}
    onRefresh();
  };
  return <><button disabled={busy} onClick={()=>void leave("/connections")}>← Connections</button>{notice?<p role="status" className={styles.notice}>{notice}</p>:null}
    {connection.state==="PENDING"?<section className={styles.card}><p className={styles.eyebrow}>{connection.inviter==="partner"?"Starter invitation":"Waiting for a reply"}</p><h1>{connection.topic.text}</h1><p>From {connection.senderSnapshot.publicName} · send-time public identity</p><p className={styles.quote}>{connection.hello}</p>{connection.canAccept?<div className={styles.actions}><button className={styles.primary} disabled={busy} onClick={()=>void run(`${url}/accept`,{})}>Accept starter</button><button disabled={busy} onClick={()=>void run(`${url}/decline`,{})}>Decline quietly</button></div>:<p>Your invitation stays here for up to seven days. Existing conversations and your private space are still available.</p>}{connection.inviter==="self"?<button disabled={busy} onClick={()=>void run(`${url}/withdraw`,{})}>Withdraw invitation</button>:null}<details><summary>What acceptance means</summary><p>A separate starter conversation—not a full shared workspace. Private responses stay private until explicitly shared.</p></details></section>:<StarterConversation connection={connection} text={text} busy={busy} onChange={value=>{setText(value);setDirty(value!==(connection.ownDraft?.text??""));}} onSave={()=>void save()} onShare={()=>void share()}/>}
    <BuildTogetherPanel connection={connection} busy={busy} currentRelationshipId={me.currentRelationshipId} onChoose={ready=>void chooseBuild(ready)} onOpen={()=>void leave("/journey")}/>
    {connection.canClose?<button className={styles.danger} disabled={busy} onClick={async()=>{if(await confirmLeave())setClose(true);}}>Close this starter</button>:null}
    <DiscoverySafetyActions connectionId={connection.id} reportSource={reportSources.at(-1)??null} reportSources={reportSources} onBlocked={onBlocked}/>
    <ConfirmDialog open={close} onCancel={()=>setClose(false)} onConfirm={async()=>{setClose(false);const result=await run(`${url}/close`,{});if(result)setDirty(false);}} title="Close this starter?" description="New responses and build choices stop. Previously shared text remains in read-only history; your private draft stays yours." confirmLabel="Close starter" cancelLabel="Keep starter"/>
  </>;
}
