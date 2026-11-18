"use client";
import {useCallback,useEffect,useId,useRef,type ReactNode} from "react";
import {useDiscovery} from "./DiscoveryShell";
import {discoveryRequest} from "./discovery.client";
import {useDiscoveryResource} from "./use-discovery-resource";
import type {PublicDiscoveryProfile} from "./discovery.types";
import DiscoveryProfileCard from "./DiscoveryProfileCard";
import DiscoverySafetyActions from "./DiscoverySafetyActions";
import styles from "./connected-profile.module.scss";

export default function ConnectedProfile({connectionId,onClose,onBlocked}:{connectionId:string;onClose:()=>void;onBlocked?:()=>void}){
  const {userId,me}=useDiscovery();
  return <ConnectedProfileView userId={userId} connectionId={connectionId} areas={me.areas} onClose={onClose} renderSafety={value => <DiscoverySafetyActions connectionId={connectionId}
    reportSource={{sourceType:"PROFILE",sourceId:value.id,label:"Public profile"}}
    reportSources={[{sourceType:"PROFILE",sourceId:value.id,label:"Public profile"},...(value.photos??[]).map((photo,index)=>({sourceType:"PHOTO" as const,sourceId:photo.id,label:`Profile photo ${index+1}`}))]}
    onBlocked={()=>{onClose();onBlocked?.();}}/>}/>;
}
export function ConnectedProfileView({userId,connectionId,onClose,areas=[],renderSafety}:{userId:string;connectionId:string;onClose:()=>void;areas?:{id:string;label:string}[];renderSafety?:(profile:PublicDiscoveryProfile)=>ReactNode}) {
  const dialog=useRef<HTMLDialogElement>(null),back=useRef<HTMLButtonElement>(null),title=useId();
  const load=useCallback((signal:AbortSignal)=>discoveryRequest<PublicDiscoveryProfile>(userId,`/api/discovery/connections/${connectionId}/profile`,{signal}),[userId,connectionId]);
  const {value,error,retry}=useDiscoveryResource(userId,connectionId,load);
  useEffect(()=>{
    const element=dialog.current;if(!element)return;
    const origin=document.activeElement,overflow=document.body.style.overflow;
    element.showModal();back.current?.focus();document.body.style.overflow="hidden";
    return()=>{element.close();document.body.style.overflow=overflow;if(origin instanceof HTMLElement&&origin.isConnected)origin.focus({preventScroll:true});};
  },[]);
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState==="visible")retry();};
    window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);
    const timer=window.setInterval(refresh,15000);
    return()=>{window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);window.clearInterval(timer);};
  },[retry]);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={title} onCancel={event=>{event.preventDefault();onClose();}}>
    <header className={styles.header}><button ref={back} type="button" onClick={onClose}>← Back to chat</button><h2 id={title}>Connection profile</h2></header>
    <div className={styles.body}>{error?<section role="alert"><h3>Profile unavailable</h3><p>{error}</p><button onClick={retry}>Try again</button></section>:!value?<p role="status">Loading profile…</p>:<><p>This is their current public profile. Continue your conversation in chat.</p><DiscoveryProfileCard profile={value} area={areas.find(area=>area.id===value.areaId)?.label} photoIds={value.photos?.map(photo=>photo.id)??[]}/>{renderSafety?.(value)}</>}</div>
  </dialog>;
}
