"use client";
import {useCallback,useRef,useState} from "react";
import DiscoveryShell,{useDiscovery} from "./DiscoveryShell";
import {discoveryRequest} from "./discovery.client";
import {useDiscoveryResource} from "./use-discovery-resource";
import type {PageOf} from "./discovery.types";
import styles from "./discovery.module.scss";
import DiscoveryPhotoModeration from "./photos/DiscoveryPhotoModeration";
type Report={id:string;reason:string;detail:string|null;evidence:unknown;profileId:string|null;suspended:boolean;resolvedAt:string|null;audits:{id:string;action:string;createdAt:string}[]};
export default function DiscoveryModerationPage(){return <DiscoveryShell><Moderation/></DiscoveryShell>;}
function Moderation(){
  const {me,busy}=useDiscovery(),[tab,setTab]=useState<"reports"|"photos">("reports");
  if(!me.canModerate)return <section className={styles.card}><h1>Moderator access required.</h1><p>Report evidence is restricted to assigned moderators.</p></section>;
  return <><h1>Discovery moderation</h1><nav className={styles.actions} aria-label="Moderation tools"><button disabled={busy} aria-pressed={tab==="reports"} onClick={()=>setTab("reports")}>Reports</button><button disabled={busy} aria-pressed={tab==="photos"} onClick={()=>setTab("photos")}>Photo review</button></nav>{tab==="photos"?<DiscoveryPhotoModeration/>:<Reports/>}</>;
}
function Reports(){
  const {userId,me,busy,setBusy}=useDiscovery(),[before,setBefore]=useState<string|null>(null),[message,setMessage]=useState("");
  const requests=useRef(new Map<string,string>());
  const load=useCallback((signal:AbortSignal)=>discoveryRequest<PageOf<Report>>(userId,`/api/discovery/moderation/reports${before?`?before=${before}`:""}`,{signal}),[userId,before]);
  const resource=useDiscoveryResource(userId,me.canModerate?`reports:${before??""}`:"",load);
  const act=async(report:Report,action:"DISMISS"|"SUSPEND"|"RESTORE")=>{if(!window.confirm(`${action.toLowerCase()} this discovery account/report? Existing deep spaces will not be ended.`))return;setBusy(true);try{const key=`${report.id}:${action}`;if(!requests.current.has(key))requests.current.set(key,crypto.randomUUID());await discoveryRequest(userId,action==="RESTORE"?`/api/discovery/moderation/profiles/${report.profileId}/restore`:`/api/discovery/moderation/reports/${report.id}/review`,{method:"POST",body:JSON.stringify({...(action==="RESTORE"?{}:{action}),requestId:requests.current.get(key)})});setMessage("Moderation action saved and audited.");resource.retry();}catch(error){setMessage(error instanceof Error?error.message:"Please try again.");}finally{setBusy(false);}};
  if(!me.canModerate)return <section className={styles.card}><h1>Moderator access required.</h1><p>Report evidence is restricted to assigned moderators.</p></section>;
  return <><h1>Discovery report review.</h1><p>Restricted operator area. Every review and restore is audited. Do not copy evidence into public conversations.</p>{message?<p role="status">{message}</p>:null}{resource.error?<p role="alert">{resource.error}</p>:null}{resource.value?.items.map(report=><section className={styles.card} key={report.id}><h2>{report.reason}</h2><p>{report.detail}</p><pre className={styles.quote}>{JSON.stringify(report.evidence,null,2)}</pre><div className={styles.actions}>{!report.resolvedAt?<><button disabled={busy} onClick={()=>void act(report,"DISMISS")}>Dismiss report</button><button className={styles.danger} disabled={busy} onClick={()=>void act(report,"SUSPEND")}>Suspend discovery access</button></>:<p>Review recorded.</p>}{report.suspended&&report.profileId?<button disabled={busy} onClick={()=>void act(report,"RESTORE")}>Restore discovery access</button>:null}</div><details><summary>Audit history</summary>{report.audits.map(audit=><p key={audit.id}>{audit.action} · {audit.createdAt}</p>)}</details></section>)}{resource.value?.items.length===0?<p>No reports to review.</p>:null}<div className={styles.actions}>{before?<button onClick={()=>setBefore(null)}>Latest reports</button>:null}{resource.value?.nextCursor?<button onClick={()=>setBefore(resource.value!.nextCursor)}>Older reports</button>:null}</div></>;
}
