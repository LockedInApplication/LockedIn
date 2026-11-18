"use client";
import {useCallback,useEffect,useId,useRef} from "react";
import {useDiscovery} from "./DiscoveryShell";
import {discoveryRequest} from "./discovery.client";
import {useDiscoveryResource} from "./use-discovery-resource";
import type {PublicDiscoveryProfile} from "./discovery.types";
import DiscoveryProfileCard from "./DiscoveryProfileCard";
import styles from "./connected-profile.module.scss";

export default function ConnectedProfile({connectionId,onClose}:{connectionId:string;onClose:()=>void}){
  const {userId,me}=useDiscovery(),dialog=useRef<HTMLDialogElement>(null),back=useRef<HTMLButtonElement>(null),title=useId();
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
    <div className={styles.body}>{error?<section role="alert"><h3>Profile unavailable</h3><p>{error}</p><button onClick={retry}>Try again</button></section>:!value?<p role="status">Loading profile…</p>:<><p>This is their current public profile. Continue your conversation in chat.</p><DiscoveryProfileCard profile={value} area={me.areas.find(area=>area.id===value.areaId)?.label} photoIds={value.photos?.map(photo=>photo.id)??[]}/></>}</div>
  </dialog>;
}
