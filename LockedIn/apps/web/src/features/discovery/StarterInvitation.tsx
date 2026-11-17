"use client";
import {useRef,useState} from "react";
import ProfileAvatar from "@/features/profile/ProfileAvatar";
import {discoveryRequest} from "./discovery.client";
import type {DiscoveryConnectionView,PublicDiscoveryProfile} from "./discovery.types";
import styles from "./discovery.module.scss";
import {discoveryProfilePrompt,discoveryProfilePromptKey} from "./discovery-prompt";
export default function StarterInvitation({userId,profile,topics,replyToPrompt=false,onInvited,onDirty,onBusy}:{userId:string;profile:PublicDiscoveryProfile;topics:{key:string;text:string}[];replyToPrompt?:boolean;onInvited:(id:string)=>void;onDirty:(value:boolean)=>void;onBusy:(value:boolean)=>void}){
  const [topic,setTopic]=useState(topics[0]?.key??""),[hello,setHello]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const attempt=useRef<{body:string;id:string}|null>(null);
  const canSend=!busy&&(replyToPrompt?!!profile.promptAnswer&&!!hello.trim():!!topic);
  const submit=async()=>{if(!canSend)return;setBusy(true);onBusy(true);setError("");try{
    const body=JSON.stringify({targetProfileId:profile.id,topicKey:replyToPrompt?discoveryProfilePromptKey:topic,hello,...(replyToPrompt?{expectedPromptAnswer:profile.promptAnswer}:{})});
    if(attempt.current?.body!==body)attempt.current={body,id:crypto.randomUUID()};
    const result=await discoveryRequest<DiscoveryConnectionView>(userId,"/api/discovery/connections",{method:"POST",body:JSON.stringify({...JSON.parse(body),requestId:attempt.current.id})});
    onDirty(false);onBusy(false);onInvited(result.id);
  }catch(error){setError(error instanceof Error?error.message:"We could not send your invitation.");}finally{setBusy(false);onBusy(false);}};
  return <section className={styles.card}><div className={styles.profile}><ProfileAvatar name={profile.publicName} preset={profile.avatarPreset}/><h1>{replyToPrompt?"Reply to":"Invite"} {profile.publicName}</h1></div>
    {replyToPrompt&&!profile.promptAnswer?<p role="status">This person no longer has a published answer. You can go back to Discovery and send a regular starter invitation.</p>:<>
      {replyToPrompt?<><h2>{discoveryProfilePrompt}</h2><p className={styles.quote}>{profile.promptAnswer}</p></>:<p className={styles.quote}>{profile.bio}</p>}
      <form className={styles.form} onSubmit={event=>{event.preventDefault();void submit();}}>
        {!replyToPrompt?<label>Choose one starter question<select disabled={busy} value={topic} onChange={event=>{setTopic(event.target.value);onDirty(true);}}>{topics.map(topic=><option key={topic.key} value={topic.key}>{topic.text}</option>)}</select></label>:null}
        <label>{replyToPrompt?"Your reply":"A short hello (optional)"}<textarea value={hello} maxLength={280} required={replyToPrompt} disabled={busy} onChange={event=>{setHello(event.target.value);onDirty(true);}}/></label>
        <p className={styles.muted}>{replyToPrompt?"This sends your published name/avatar and reply as a starter invitation.":"This sends your published name/avatar, chosen question and hello."} Recipients keep this send-time information. Acceptance opens a starter—not a full shared space.</p>
        {error?<p role="alert">{error}</p>:null}<button className={styles.primary} type="submit" disabled={!canSend}>{busy?"Sending…":replyToPrompt?"Send reply as invitation":"Send starter invitation"}</button>
      </form>
    </>}
  </section>;
}
