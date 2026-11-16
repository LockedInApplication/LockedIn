import type { PublicDiscoveryProfile } from "./discovery.types";
import ProfileAvatar from "@/features/profile/ProfileAvatar";
import styles from "./discovery.module.scss";
export default function NearbyRadar({candidates,selectedId,onSelect}:{candidates:PublicDiscoveryProfile[];selectedId:string|null;onSelect:(id:string)=>void}) {
  if(!candidates.length)return <p>No people to show in this area right now. Try again later or choose another area.</p>;
  return <section aria-label="Illustrative discovery radar"><p className={styles.muted}>Illustrative arrangement — not exact position or distance. No device scanning.</p><div className={styles.radar}>{candidates.map(profile=><button type="button" key={profile.id} aria-pressed={profile.id===selectedId} onClick={()=>onSelect(profile.id)}><ProfileAvatar name={profile.publicName} preset={profile.avatarPreset}/>{profile.publicName}</button>)}</div></section>;
}
