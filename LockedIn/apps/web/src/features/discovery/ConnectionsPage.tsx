"use client";
import {useCallback,useState} from "react";
import {useRouter,useSearchParams} from "next/navigation";
import DiscoveryShell,{useDiscovery} from "./DiscoveryShell";
import {discoveryRequest} from "./discovery.client";
import {useDiscoveryResource} from "./use-discovery-resource";
import type {PageOf,DiscoveryConnectionView,PublicDiscoveryProfile} from "./discovery.types";
import StarterInvitation from "./StarterInvitation";
import styles from "./discovery.module.scss";
export default function ConnectionsPage(){const query=useSearchParams();return <DiscoveryShell key={query.toString()}><Connections/></DiscoveryShell>;}
function Connections(){
  const {userId,me,leave,setDirty,setBusy}=useDiscovery(),router=useRouter(),query=useSearchParams(),profileId=query.get("profile"),[cursors,setCursors]=useState<(string|null)[]>([null]);
  const before=cursors.at(-1),load=useCallback((signal:AbortSignal)=>discoveryRequest<PageOf<DiscoveryConnectionView>>(userId,`/api/discovery/connections${before?`?before=${before}`:""}`,{signal}),[userId,before]);
  const connections=useDiscoveryResource(userId,`connections:${before??""}`,load);
  const loadProfile=useCallback((signal:AbortSignal)=>discoveryRequest<PublicDiscoveryProfile>(userId,`/api/discovery/profiles/${encodeURIComponent(profileId??"")}`,{signal}),[userId,profileId]);
  const profile=useDiscoveryResource(userId,profileId&&me.canDiscover?`invite:${profileId}`:"",loadProfile);
  return <>{profileId?<><button onClick={()=>void leave("/connections")}>← My connections</button>{profile.error?<p role="status">This person is not available for a new invitation.</p>:profile.value?<StarterInvitation key={profile.value.id} userId={userId} profile={profile.value} topics={me.topics} onDirty={setDirty} onBusy={setBusy} onInvited={id=>{setDirty(false);router.push(`/connections/${encodeURIComponent(id)}`);}}/>:<p role="status">Opening invitation…</p>}</>:<><p className={styles.eyebrow}>Separate starters · up to three active</p><h1>Your connections.</h1><p>One waiting reply does not hold up your other starters.</p></>}
    {connections.error?<p role="alert">{connections.error}<button onClick={connections.retry}>Try again</button></p>:null}
    {!connections.value&&!connections.error?<p role="status">Loading your connections…</p>:null}
    {connections.value?<><ul className={styles.list}>{connections.value.items.map(connection=><li key={connection.id}><button onClick={()=>void leave(`/connections/${connection.id}`)}><span className={styles.status}>{connection.state==="PENDING"?(connection.inviter==="partner"?"Invitation to review":"Waiting for a reply"):connection.state==="ACCEPTED"?"Continue starter":"Starter history"}</span><h2>{connection.partner.publicName}</h2><p>{connection.topic.text}</p></button></li>)}</ul>{!connections.value.items.length?<section className={styles.card}><h2>No starters yet.</h2><p>{me.canDiscover?"Explore opted-in people, or reflect privately while you wait.":"Any future starter history will stay separate from your shared space."}</p>{me.canDiscover?<button onClick={()=>void leave("/discover")}>Explore people</button>:null}</section>:null}<div className={styles.actions}>{cursors.length>1?<button onClick={()=>setCursors(value=>value.slice(0,-1))}>Previous</button>:null}{connections.value.nextCursor?<button onClick={()=>setCursors(value=>[...value,connections.value!.nextCursor])}>Older starters</button>:null}</div></>:null}
    <BlockSettings/>
  </>;
}
function BlockSettings(){
  const {userId,busy,setBusy}=useDiscovery(),[message,setMessage]=useState(""),[cursors,setCursors]=useState<(string|null)[]>([null]);
  const before=cursors.at(-1),load=useCallback((signal:AbortSignal)=>discoveryRequest<PageOf<{id:string;name:string;createdAt:string}>>(userId,`/api/discovery/blocks${before?`?before=${before}`:""}`,{signal}),[userId,before]);
  const blocks=useDiscoveryResource(userId,`blocks:${before??""}`,load);
  const unblock=async(id:string)=>{setBusy(true);try{await discoveryRequest(userId,`/api/discovery/blocks/${id}`,{method:"DELETE"});blocks.retry();setMessage("Invitation block removed. Closed starters and earlier choices remain closed.");}catch(error){setMessage(error instanceof Error?error.message:"Please try again.");}finally{setBusy(false);}};
  return <details className={styles.card}><summary>Your blocked contacts</summary>{blocks.error?<p role="alert">{blocks.error}</p>:null}{blocks.value?.items.map(block=><div key={block.id}><p>{block.name}</p><button disabled={busy} onClick={()=>void unblock(block.id)}>Unblock invitations</button></div>)}{blocks.value?.items.length===0?<p>No invitation blocks.</p>:null}{cursors.length>1?<button onClick={()=>setCursors(value=>value.slice(0,-1))}>Previous blocks</button>:null}{blocks.value?.nextCursor?<button onClick={()=>setCursors(value=>[...value,blocks.value!.nextCursor])}>Older blocks</button>:null}{message?<p role="status">{message}</p>:null}</details>;
}
