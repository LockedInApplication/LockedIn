"use client";
import {useState} from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import type {DiscoveryConnectionView} from "./discovery.types";
import styles from "./discovery.module.scss";
export default function BuildTogetherPanel({connection,busy,currentRelationshipId,onChoose,onOpen}:{connection:DiscoveryConnectionView;busy:boolean;currentRelationshipId:string|null;onChoose:(ready:boolean)=>void;onOpen:()=>void}){
  const [confirm,setConfirm]=useState(false);
  if(connection.state==="PROMOTED"){
    const isCurrentSpace=!!currentRelationshipId&&connection.promotedRelationshipId===currentRelationshipId;
    return <section className={styles.card}><h2>{connection.lockedIn?"You both chose to lock in.":"You both chose to build."}</h2><p>{connection.lockedIn?(isCurrentSpace?"Discovery stays paused while your shared space is active.":"Discovery does not restart automatically when a shared space ends."):"This earlier shared-space choice did not pause Discovery or imply exclusivity."}</p>{isCurrentSpace?<button className={styles.primary} disabled={busy} onClick={onOpen}>Open our shared space</button>:null}</section>;
  }
  if(connection.state!=="ACCEPTED")return null;
  return <><details className={styles.card} open={connection.readiness.mine||connection.readiness.theirs}><summary>Lock in together</summary><p>When you both choose to lock in, a shared space opens, both profiles are hidden from Discovery, and new invitations stop. All existing chats stay available.</p>{connection.readiness.theirs?<p>Your connection has chosen to lock in. You can take your time.</p>:null}{connection.readiness.mine?<><p>Your choice is saved. Nothing changes until you both choose to lock in.</p><button disabled={busy} onClick={()=>onChoose(false)}>Withdraw my choice</button></>:connection.canChooseBuild?<button className={styles.primary} disabled={busy} onClick={()=>setConfirm(true)}>Choose to lock in</button>:<p>Opening another shared space is unavailable right now. Your existing chats are unchanged.</p>}</details><ConfirmDialog open={confirm} onCancel={()=>setConfirm(false)} onConfirm={()=>{if(busy)return;setConfirm(false);onChoose(true);}} title="Confirm lock-in choice" description="If you both choose to lock in, your profiles will be hidden from Discovery and you cannot send or accept new invitations while your shared space is active. All existing chats stay available. Until then, you can withdraw your choice." confirmLabel="Yes, choose to lock in" cancelLabel="Not yet"/></>;
}
