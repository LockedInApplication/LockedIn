"use client";

import type { ReactNode } from "react";
import ProfileAvatar from "@/features/profile/ProfileAvatar";
import type { DiscoveryProfileInput } from "./discovery.types";
import { DiscoveryPhotoImage } from "./photos/DiscoveryPhotoGallery";
import common from "./discovery.module.scss";
import styles from "./discovery-profile-card.module.scss";
import { familyOptions, heightLabel, petOptions, photoPrompts, profileAnswers, writtenPrompts, type ProfileReply } from "./discovery-prompt";

export default function DiscoveryProfileCard({ profile, area, photoIds = [], onReply, children }: {
  profile: DiscoveryProfileInput; area?: string; photoIds?: string[]; onReply?: (target: ProfileReply) => void; children?: ReactNode;
}) {
  const photos = photoIds.slice(0, 3);
  const answers = profileAnswers(profile);
  const { heightCm, languages, pets, familyPlans } = profile.about ?? {};
  const avatar = <div className={styles.fallback}><ProfileAvatar name={profile.publicName} preset={profile.avatarPreset}/></div>;
  const photo = (id: string, index: number) => {
    const prompt = profile.photoPrompts?.find(item => item.photoId === id);
    return <div className={styles.visual}>
      <div className={styles.frame}>
        <DiscoveryPhotoImage key={id} id={id} className={styles.photo} alt={`Photo ${index + 1} of ${profile.publicName}`} fallback={avatar}/>
      </div>
      {prompt ? <p className={styles.caption}>{photoPrompts[prompt.key]}</p> : null}
      {onReply ? <button type="button" onClick={() => onReply({ photo: id })}>Reply to photo {index + 1}</button> : null}
    </div>;
  };
  const answerCard = (item: typeof answers[number]) => <section key={item.key} className={styles.prompt}>
    <h3>{writtenPrompts[item.key]}</h3><p className={common.quote}>{item.answer}</p>
    {onReply ? <button type="button" onClick={() => onReply({ prompt: item.key })}>Reply to this answer</button> : null}
  </section>;
  return <div className={styles.story}>
      <div className={styles.identity}>
        <ProfileAvatar name={profile.publicName} preset={profile.avatarPreset}/>
        <div><h2>{profile.publicName}</h2>{area ? <p className={common.muted}>{area}</p> : null}</div>
      </div>
      <p className={styles.intention}>{profile.intention === "LONG_TERM" ? "Looking for a long-term relationship" : "Open to a long-term relationship"}</p>
      {photos[0] ? photo(photos[0], 0) : null}
      {answers[0] ? answerCard(answers[0]) : null}
      {profile.bio || heightCm || languages?.length || pets || familyPlans ? <section><h3>About me</h3>
        {profile.bio ? <p className={common.quote}>{profile.bio}</p> : null}
        <ul className={styles.interests}>
          {heightCm ? <li>{heightCm} cm · {heightLabel(Math.round(heightCm / 2.54))}</li> : null}
          {languages?.length ? <li>Speaks {languages.join(", ")}</li> : null}
          {pets ? <li>{petOptions[pets]}</li> : null}
          {familyPlans ? <li>{familyOptions[familyPlans]}</li> : null}
        </ul>
      </section> : null}
      {profile.interests.length ? <div><h3>Interests</h3><ul className={styles.interests}>{profile.interests.map((interest, i) => <li key={i}>{interest}</li>)}</ul></div> : null}
      {profile.pace ? <div><h3>Communication pace</h3><p className={common.quote}>{profile.pace}</p></div> : null}
      {[1, 2].map(index => <div className={styles.storyPart} key={index}>
        {photos[index] ? photo(photos[index], index) : null}
        {answers[index] ? answerCard(answers[index]) : null}
      </div>)}
      {children}
  </div>;
}
