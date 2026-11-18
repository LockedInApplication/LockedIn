"use client";
import {useCallback,useState} from "react";
import DiscoveryShell,{useDiscovery} from "./DiscoveryShell";
import {discoveryRequest} from "./discovery.client";
import {useDiscoveryResource} from "./use-discovery-resource";
import type {DiscoveryConnectionView} from "./discovery.types";
import DiscoveryChat from "./DiscoveryChat";
import ConnectedProfile from "./ConnectedProfile";
import BuildTogetherPanel from "./BuildTogetherPanel";
import ConnectionStatus from "./ConnectionStatus";
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
  const {userId,me,refreshAccess,leave,setDirty,busy,setBusy,confirmLeave}=useDiscovery(),[connection,setConnection]=useState(initial),[notice,setNotice]=useState(""),[close,setClose]=useState(false),[profileOpen,setProfileOpen]=useState(false);
  const connected=connection.state==="ACCEPTED"||(connection.state==="PROMOTED"&&connection.lockedIn===true&&connection.canChat===true);
  const canChat=me.chatEnabled&&(me.canChat??me.canDiscover)&&(connection.canChat??connection.state==="ACCEPTED");
  const partnerName=connected?<button className={styles.profileName} type="button" disabled={busy} aria-label={`View ${connection.partner.publicName}’s profile`} onClick={()=>setProfileOpen(true)}>{connection.partner.publicName}</button>:connection.partner.publicName;
  const url=`/api/discovery/connections/${connection.id}`;
  const run=async(path:string,body:object,method="POST")=>{setBusy(true);setNotice("");try{const next=await discoveryRequest<DiscoveryConnectionView>(userId,path,{method,body:JSON.stringify(body)});setConnection(next);if(next.state==="PROMOTED")refreshAccess();return next;}catch(error){setNotice(error instanceof Error?error.message:"Please try again.");return null;}finally{setBusy(false);}};
  const chooseBuild=async(ready:boolean)=>{
    await run(`${url}/readiness`,{ready,consentVersion:connection.readiness.consentVersion,exclusiveConsent:true});
  };
  const reportSources:DiscoveryReportSource[]=[];
  if(connection.inviter==="partner")reportSources.unshift({sourceType:"INVITATION",sourceId:connection.id,label:"Received invitation",preview:`${connection.topic.text}\n${connection.hello}`});
  const onBlocked=async()=>{
    setDirty(false);
    setProfileOpen(false);
    setConnection(value=>({...value,state:value.state==="ACCEPTED"?"CLOSED":value.state,canChat:false,canAccept:false,canShare:false,canChooseBuild:false,canClose:false,readiness:{...value.readiness,mine:false,theirs:false}}));
    try{setConnection(await discoveryRequest<DiscoveryConnectionView>(userId,url));refreshAccess();}
    catch(error){setNotice(error instanceof Error?error.message:"Contact blocked. Refresh to load its current history.");}
    onRefresh();
  };
  return <><button disabled={busy} onClick={()=>void leave("/connections")}>← Connections</button>{notice?<p role="status" className={styles.notice}>{notice}</p>:null}
    {connection.state==="PENDING"?<section className={styles.card}><p className={styles.eyebrow}>{connection.inviter==="partner"?"Wants to connect":"Waiting for acceptance"}</p><h1>{connection.topic.text}</h1><p>From {connection.senderSnapshot.publicName}</p><p className={styles.quote}>{connection.hello}</p>{connection.canAccept?<div className={styles.actions}><button className={styles.primary} disabled={busy} onClick={()=>void run(`${url}/accept`,{})}>Accept and chat</button><button disabled={busy} onClick={()=>void run(`${url}/decline`,{})}>Decline quietly</button></div>:<p>Your invitation has been sent. Once accepted, your reply opens the conversation. Invitations expire after seven days.</p>}{connection.inviter==="self"?<button disabled={busy} onClick={()=>void run(`${url}/withdraw`,{})}>Withdraw invitation</button>:null}<details><summary>What acceptance means</summary><p>Acceptance lets you message each other. It does not create a full shared workspace.</p></details></section>:<><p className={styles.eyebrow}>Your connection</p><h1>Conversation with {partnerName}</h1></>}
    {canChat ? <DiscoveryChat key={connection.id} connectionId={connection.id} opening={connection} onBlocked={onBlocked}/> : connected ? <p role="status">Messaging is currently unavailable for this connection.</p> : null}
    {profileOpen?<ConnectedProfile connectionId={connection.id} onClose={()=>setProfileOpen(false)}/>:null}
    <ConnectionStatus connection={connection}/>
    <BuildTogetherPanel connection={connection} busy={busy} currentRelationshipId={me.currentRelationshipId} onChoose={ready=>void chooseBuild(ready)} onOpen={()=>void leave("/journey")}/>
    {connection.canClose?<button className={styles.danger} disabled={busy} onClick={async()=>{if(await confirmLeave())setClose(true);}}>Close this connection</button>:null}
    <DiscoverySafetyActions connectionId={connection.id} reportSource={reportSources.at(-1)??null} reportSources={reportSources} onBlocked={onBlocked}/>
    <ConfirmDialog open={close} onCancel={()=>setClose(false)} onConfirm={async()=>{setClose(false);const result=await run(`${url}/close`,{});if(result)setDirty(false);}} title="Close this connection?" description="Messaging and new build choices stop. This does not delete either person’s account or end an existing shared space." confirmLabel="Close connection" cancelLabel="Keep connection"/>
  </>;
}
