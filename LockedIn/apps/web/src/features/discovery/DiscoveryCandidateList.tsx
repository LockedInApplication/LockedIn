import ProfileAvatar from "@/features/profile/ProfileAvatar";
import type {PublicDiscoveryProfile} from "./discovery.types";
import styles from "./discovery.module.scss";
export default function DiscoveryCandidateList({candidates,selectedId,onSelect}:{candidates:PublicDiscoveryProfile[];selectedId:string|null;onSelect:(id:string)=>void}){
  return <ul className={styles.list} aria-label="People in this area">{candidates.map(profile=><li key={profile.id}><button type="button" className={profile.id===selectedId?styles.selected:undefined} aria-pressed={profile.id===selectedId} onClick={()=>onSelect(profile.id)}><span className={styles.profile}><ProfileAvatar name={profile.publicName} preset={profile.avatarPreset}/><span><strong>{profile.publicName}</strong>{profile.bio.slice(0,100)}</span></span></button></li>)}</ul>;
}
