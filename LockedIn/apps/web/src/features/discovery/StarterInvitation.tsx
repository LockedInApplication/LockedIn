"use client";
import {useRef,useState} from "react";
import ProfileAvatar from "@/features/profile/ProfileAvatar";
import {discoveryRequest} from "./discovery.client";
import type {DiscoveryConnectionView,PublicDiscoveryProfile} from "./discovery.types";
import styles from "./discovery.module.scss";
import {discoveryProfilePromptKey,photoPrompts,profileAnswers,writtenPrompts} from "./discovery-prompt";
import { DiscoveryPhotoImage } from "./photos/DiscoveryPhotoGallery";
export default function StarterInvitation({userId,profile,topics,reply,photo,onInvited,onDirty,onBusy}:{userId:string;profile:PublicDiscoveryProfile;topics:{key:string;text:string}[];reply?:string|null;photo?:string|null;onInvited:(id:string)=>void;onDirty:(value:boolean)=>void;onBusy:(value:boolean)=>void}){
  const [topic,setTopic]=useState(topics[0]?.key??""),[hello,setHello]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const attempt=useRef<{body:string;id:string}|null>(null);
  const replyToPrompt=!!(reply||photo);
  const answer=profileAnswers(profile).find(item=>item.key===(reply==="prompt"?"showing_up":reply));
  const publishedPhoto=profile.photos?.find(item=>item.id===photo);
  const photoPrompt=profile.photoPrompts?.find(item=>item.photoId===publishedPhoto?.id);
  const replyData=photo?(publishedPhoto?{replyPhotoId:publishedPhoto.id}:null):answer?{replyPromptKey:answer.key,expectedPromptAnswer:answer.answer}:null;
  const canSend=!busy&&!!hello.trim()&&(replyToPrompt?!!replyData:!!topic);
  const submit=async()=>{if(!canSend)return;setBusy(true);onBusy(true);setError("");try{
    const body=JSON.stringify({targetProfileId:profile.id,topicKey:replyToPrompt?discoveryProfilePromptKey:topic,hello,...replyData});
    if(attempt.current?.body!==body)attempt.current={body,id:crypto.randomUUID()};
    const result=await discoveryRequest<DiscoveryConnectionView>(userId,"/api/discovery/connections",{method:"POST",body:JSON.stringify({...JSON.parse(body),requestId:attempt.current.id})});
    onDirty(false);onBusy(false);onInvited(result.id);
  }catch(error){setError(error instanceof Error?error.message:"We could not send your invitation.");}finally{setBusy(false);onBusy(false);}};
  return <section className={styles.card}><div className={styles.profile}><ProfileAvatar name={profile.publicName} preset={profile.avatarPreset}/><h1>{replyToPrompt?"Reply to":"Invite"} {profile.publicName}</h1></div>
    {replyToPrompt&&!replyData?<p role="status">This answer or photo is no longer available. You can go back to Discovery and send a regular starter invitation.</p>:<>
      {publishedPhoto?<><h2>{photoPrompt?photoPrompts[photoPrompt.key]:"About this photo"}</h2><DiscoveryPhotoImage id={publishedPhoto.id} className={styles.replyPhoto} alt={`Photo of ${profile.publicName}`} fallback={null}/></>:answer?<><h2>{writtenPrompts[answer.key]}</h2><p className={styles.quote}>{answer.answer}</p></>:<p className={styles.quote}>{profile.bio}</p>}
      <form className={styles.form} onSubmit={event=>{event.preventDefault();void submit();}}>
        {!replyToPrompt?<label>Choose one starter question<select disabled={busy} value={topic} onChange={event=>{setTopic(event.target.value);onDirty(true);}}>{topics.map(topic=><option key={topic.key} value={topic.key}>{topic.text}</option>)}</select></label>:null}
        <label>{replyToPrompt?"Your reply":"Your opening message"}<textarea value={hello} maxLength={280} required disabled={busy} onChange={event=>{setHello(event.target.value);onDirty(true);}}/></label>
        <p className={styles.muted}>Send your reply to show you’d like to connect. If they accept, this becomes your opening chat message. Your published name and avatar are included. This does not create a full shared workspace.</p>
        {error?<p role="alert">{error}</p>:null}<button className={styles.primary} type="submit" disabled={!canSend}>{busy?"Sending…":"Send reply to connect"}</button>
      </form>
    </>}
  </section>;
}
