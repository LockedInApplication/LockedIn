import ProfileAvatar from "@/features/profile/ProfileAvatar";
import type {PublicDiscoveryProfile} from "./discovery.types";
import styles from "./discovery.module.scss";
import {DiscoveryPhotoImage} from "./photos/DiscoveryPhotoGallery";
import photoStyles from "./photos/discovery-photo.module.scss";
export default function DiscoveryCandidateList({candidates,selectedId,onSelect}:{candidates:PublicDiscoveryProfile[];selectedId:string|null;onSelect:(id:string)=>void}){
  return <ul className={styles.list} role="list" aria-label="People in this area">
    {candidates.map(profile=><li key={profile.id}>
      <button type="button" className={styles.candidateRow} aria-pressed={profile.id===selectedId} onClick={()=>onSelect(profile.id)}>
        <span className={styles.profile}>
          {profile.photos?.[0]?<DiscoveryPhotoImage key={profile.photos[0].id} id={profile.photos[0].id} className={photoStyles.thumbnail} alt="" fallback={<ProfileAvatar name={profile.publicName} preset={profile.avatarPreset}/>}/>:<ProfileAvatar name={profile.publicName} preset={profile.avatarPreset}/>}
          <span><strong>{profile.publicName}</strong>{profile.bio.slice(0,100)}</span>
        </span>
      </button>
    </li>)}
  </ul>;
}
