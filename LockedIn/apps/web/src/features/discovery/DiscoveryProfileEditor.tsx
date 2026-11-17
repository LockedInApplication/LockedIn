"use client";
import {useState} from "react";
import type {DiscoveryProfileInput, OwnDiscoveryProfile } from "./discovery.types";
import {avatarChoices} from "@/features/profile/ProfileAvatar";
import styles from "./discovery.module.scss";
import DiscoveryProfileExtras from "./DiscoveryProfileExtras";
import DiscoveryProfileCard from "./DiscoveryProfileCard";
export default function DiscoveryProfileEditor({initial,areas,onDirty,onSave,onPublish,externallyBusy=false}:{initial:OwnDiscoveryProfile;areas:{id:string;label:string}[];onDirty:(dirty:boolean)=>void;onSave:(draft:DiscoveryProfileInput)=>Promise<void>;onPublish:()=>Promise<void>;externallyBusy?:boolean}) {
  const [draft,setDraft]=useState<DiscoveryProfileInput>(initial.draft??{publicName:"",avatarPreset:"leaf",bio:"",intention:"LONG_TERM",interests:[],pace:null,areaId:areas[0]?.id??""});
  const [interests,setInterests]=useState(draft.interests.join(", ")),[adult,setAdult]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const dirty=JSON.stringify(draft)!==JSON.stringify(initial.draft??{publicName:"",avatarPreset:"leaf",bio:"",intention:"LONG_TERM",interests:[],pace:null,areaId:areas[0]?.id??""}) || interests!==draft.interests.join(", ");
  const edit=(change:Partial<DiscoveryProfileInput>)=>{setDraft(value=>({...value,...change}));onDirty(true);};
  const run=async(work:()=>Promise<void>)=>{if(busy||externallyBusy)return;setBusy(true);setError("");try{await work();onDirty(false);}catch(error){setError(error instanceof Error?error.message:"Please try again.");}finally{setBusy(false);}};
  return <div className={styles.grid}><form className={`${styles.card} ${styles.form}`} onSubmit={event=>{event.preventDefault();void run(()=>onSave({...draft,interests:interests.split(",").map(value=>value.trim()).filter(Boolean)}));}}>
    <fieldset disabled={busy||externallyBusy} className={styles.editorFields}><h2>Your discovery profile</h2><p className={styles.muted}>Starts private. Saving is not publishing.</p>
    <label>Public name<input value={draft.publicName} maxLength={60} required onChange={event=>edit({publicName:event.target.value})}/></label>
    <label>Avatar<select value={draft.avatarPreset} onChange={event=>edit({avatarPreset:event.target.value as DiscoveryProfileInput["avatarPreset"]})}>{avatarChoices.map(avatar=><option key={avatar.id} value={avatar.id}>{avatar.label}</option>)}</select></label>
    <label>Short introduction<textarea value={draft.bio} maxLength={500} onChange={event=>edit({bio:event.target.value})}/></label>
    <label>What are you looking for?<select value={draft.intention} onChange={event=>edit({intention:event.target.value as DiscoveryProfileInput["intention"]})}><option value="LONG_TERM">A long-term relationship</option><option value="OPEN_TO_LONG_TERM">Open to a long-term relationship</option></select></label>
    <label>Interests, separated by commas<input value={interests} maxLength={158} onChange={event=>{setInterests(event.target.value);onDirty(true);}}/><small>Up to five; 30 characters each.</small></label>
    <label>Communication pace (optional)<input value={draft.pace??""} maxLength={240} onChange={event=>edit({pace:event.target.value||null})}/></label>
    <DiscoveryProfileExtras draft={draft} edit={edit}/>
    <label>Discovery city<select required value={draft.areaId} onChange={event=>edit({areaId:event.target.value})}>{areas.map(area=><option key={area.id} value={area.id}>{area.label}</option>)}</select><small>People see only this selected city, not your precise location.</small></label>
    {error?<p role="alert" className={`${styles.notice} ${styles.error}`}>{error}</p>:null}
    <button disabled={busy || !draft.publicName.trim() || !draft.areaId} type="submit">Save private draft</button></fieldset>
  </form><section className={`${styles.card} ${styles.form}`} aria-label="Review and publish"><h2>Review and publish</h2><p className={styles.muted}>Draft preview. Only approved photos can be published.</p>
    <DiscoveryProfileCard profile={{...draft,publicName:draft.publicName||"Your chosen public name",interests:interests.split(",").map(value=>value.trim()).filter(Boolean),...(draft.prompts?{prompts:draft.prompts.filter(item=>item.answer.trim())}:{})}} area={areas.find(area=>area.id===draft.areaId)?.label} photoIds={draft.photoIds}/>
    <label className={styles.check}><input type="checkbox" checked={adult} disabled={busy} onChange={event=>setAdult(event.target.checked)}/><span>I confirm I am 18 or older and choose to publish these fields to eligible discovery participants.</span></label>
    <p className={styles.muted}>Self-attestation is not identity or age verification. Recipients keep invitation information you choose to send.</p>
    <button className={styles.primary} type="button" disabled={busy||externallyBusy||dirty||initial.revision===0||!adult} onClick={()=>void run(onPublish)}>Publish profile</button>
    {dirty||initial.revision===0?<p className={styles.muted}>Save this draft first, then review and publish.</p>:null}
    {initial.paused?<p>Your visibility is paused. Publishing edits will not resume it.</p>:null}
  </section></div>;
}
