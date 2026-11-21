"use client";
import {useCallback,useLayoutEffect,useState} from "react";
import {useQuietRefresh} from "@/features/notifications/use-quiet-refresh";
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
import chatStyles from "@/features/messaging/chat.module.scss";
import styles from "./discovery.module.scss";
export default function ConnectionPage({connectionId}:{connectionId:string}){return <DiscoveryShell><Connection key={connectionId} id={connectionId}/></DiscoveryShell>;}
function Connection({id}:{id:string}){
  const {userId,chatRevision,dirty,busy}=useDiscovery(),load=useCallback((signal:AbortSignal)=>discoveryRequest<DiscoveryConnectionView>(userId,`/api/discovery/connections/${id}`,{signal}),[userId,id]);
  const resource=useDiscoveryResource(userId,id,load);
  const {invalidate,setBlocked}=useQuietRefresh(load,resource.install);
  useLayoutEffect(()=>{setBlocked(dirty||busy);},[dirty,busy,setBlocked]);
  useLayoutEffect(()=>{if(chatRevision)invalidate();},[chatRevision,invalidate]);
  if(resource.error)return <section className={styles.card} role="alert"><h1>We could not open this starter.</h1><p>{resource.error}</p><button onClick={resource.retry}>Try again</button></section>;
  if(!resource.value)return <p role="status">Opening this conversation…</p>;
  return <Starter key={`${userId}:${id}`} connection={resource.value} setConnection={resource.install} onRefresh={resource.retry}/>;
}
function Starter({connection,setConnection,onRefresh}:{connection:DiscoveryConnectionView;setConnection:(value:DiscoveryConnectionView)=>void;onRefresh:()=>void}){
  const {userId,me,refreshAccess,leave,setDirty,busy,setBusy,confirmLeave}=useDiscovery(),[notice,setNotice]=useState(""),[close,setClose]=useState(false),[profileOpen,setProfileOpen]=useState(false);
  const connected=connection.state==="ACCEPTED"||(connection.state==="PROMOTED"&&connection.lockedIn===true&&connection.canChat===true);
  const canChat=me.chatEnabled&&(me.canChat??me.canDiscover)&&(connection.canChat??connection.state==="ACCEPTED");
  const sharedSpaceEnded=connection.state==="PROMOTED"&&!!connection.promotedRelationshipId&&me.currentRelationshipId===null&&connection.canChat===false;
  const partnerName=connected?<button className={styles.profileName} type="button" disabled={busy} aria-label={`View ${connection.partner.publicName}’s profile`} onClick={()=>setProfileOpen(true)}>{connection.partner.publicName}</button>:connection.partner.publicName;
  const url=`/api/discovery/connections/${connection.id}`;
  const run=async(path:string,body:object,method="POST")=>{setBusy(true);setNotice("");try{const next=await discoveryRequest<DiscoveryConnectionView>(userId,path,{method,body:JSON.stringify(body)});setConnection(next);if(next.state==="PROMOTED")refreshAccess();return next;}catch(error){setNotice(error instanceof Error?error.message:"Please try again.");if(path===`${url}/accept`)onRefresh();return null;}finally{setBusy(false);}};
  const chooseBuild=async(ready:boolean)=>{
    await run(`${url}/readiness`,{ready,consentVersion:connection.readiness.consentVersion,exclusiveConsent:true});
  };
  const reportSources:DiscoveryReportSource[]=[];
  if(connection.inviter==="partner")reportSources.unshift({sourceType:"INVITATION",sourceId:connection.id,label:"Received invitation",preview:`${connection.topic.text}\n${connection.hello}`});
  const onBlocked=async()=>{
    setDirty(false);
    setProfileOpen(false);
    setConnection({...connection,state:connection.state==="ACCEPTED"?"CLOSED":connection.state,canChat:false,canAccept:false,canShare:false,canChooseBuild:false,canClose:false,readiness:{...connection.readiness,mine:false,theirs:false}});
    try{setConnection(await discoveryRequest<DiscoveryConnectionView>(userId,url));refreshAccess();}
    catch(error){setNotice(error instanceof Error?error.message:"Contact blocked. Refresh to load its current history.");}
    onRefresh();
  };
  const backAction=<button className={chatStyles.backLink} type="button" aria-label="Back to Inbox" disabled={busy} onClick={()=>void leave("/connections")}>
    <span aria-hidden="true">←</span><strong className={chatStyles.backLabel}>Inbox</strong>
  </button>;
  return <>{!canChat ? backAction : null}{notice?<p role="status" className={styles.notice}>{notice}</p>:null}
    {connection.state==="PENDING"?<section className={styles.card}><p className={styles.eyebrow}>{connection.inviter==="partner"?"Wants to connect":"Waiting for acceptance"}</p><h1>{connection.topic.text}</h1><p>From {connection.senderSnapshot.publicName}</p><p className={styles.quote}>{connection.hello}</p>{connection.inviter==="partner"?<>
      {!connection.canAccept?<p>This invitation can’t be accepted right now.</p>:null}
      <div className={styles.actions}>{connection.canAccept?<button className={styles.primary} disabled={busy} onClick={()=>void run(`${url}/accept`,{})}>Accept and chat</button>:null}<button disabled={busy} onClick={()=>void run(`${url}/decline`,{})}>Decline quietly</button></div>
    </>:<><p>Your invitation has been sent. Once accepted, your reply opens the conversation. Invitations expire after seven days.</p><button disabled={busy} onClick={()=>void run(`${url}/withdraw`,{})}>Withdraw invitation</button></>}<details><summary>What acceptance means</summary><p>Acceptance lets you message each other. It does not create a full shared workspace.</p></details></section>:!canChat?<><p className={styles.eyebrow}>Your connection</p><h1>Conversation with {partnerName}</h1></>:null}
    {canChat ? <DiscoveryChat key={connection.id} connectionId={connection.id} opening={connection} onBlocked={onBlocked} backAction={backAction}
      onViewProfile={connected?()=>setProfileOpen(true):undefined} dateSpotsConversationId={connection.dateSpotsConversationId} datePlansConversationId={connection.datePlansConversationId}/> : connected ? <p role="status">Messaging is currently unavailable for this connection.</p> : null}
    {profileOpen?<ConnectedProfile connectionId={connection.id} onClose={()=>setProfileOpen(false)} onBlocked={()=>void onBlocked()}/>:null}
    <ConnectionStatus connection={connection} sharedSpaceEnded={sharedSpaceEnded}/>
    {!sharedSpaceEnded?<BuildTogetherPanel connection={connection} busy={busy} currentRelationshipId={me.currentRelationshipId} onChoose={ready=>void chooseBuild(ready)} onOpen={()=>void leave("/journey")}/>:null}
    {connection.canClose?<button className={styles.danger} disabled={busy} onClick={async()=>{if(await confirmLeave())setClose(true);}}>Close this connection</button>:null}
    <DiscoverySafetyActions connectionId={connection.id} reportSource={reportSources.at(-1)??null} reportSources={reportSources} onBlocked={onBlocked}/>
    <ConfirmDialog open={close} onCancel={()=>setClose(false)} onConfirm={async()=>{setClose(false);const result=await run(`${url}/close`,{});if(result)setDirty(false);}} title="Close this connection?" description="Messaging and new build choices stop. This does not delete either person’s account or end an existing shared space." confirmLabel="Close connection" cancelLabel="Keep connection"/>
  </>;
}
