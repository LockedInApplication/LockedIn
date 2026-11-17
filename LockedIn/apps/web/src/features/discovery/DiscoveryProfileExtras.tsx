"use client";

import { useState } from "react";
import { familyOptions, heightLabel, petOptions, photoPrompts, profileAnswers, writtenPrompts, type PhotoKey, type WrittenKey } from "./discovery-prompt";
import type { DiscoveryAbout, DiscoveryProfileInput } from "./discovery.types";
import styles from "./discovery.module.scss";

export default function DiscoveryProfileExtras({ draft, edit }: { draft: DiscoveryProfileInput; edit: (change: Partial<DiscoveryProfileInput>) => void }) {
  const [unit, setUnit] = useState("cm");
  const answers = profileAnswers(draft);
  const available = (Object.keys(writtenPrompts) as WrittenKey[]).filter(key => !answers.some(answer => answer.key === key));
  const setAnswers = (prompts: typeof answers) => edit({ prompts, promptAnswer: undefined });
  const about = draft.about ?? {};
  const setAbout = (change: Partial<DiscoveryAbout>) => edit({ about: { ...about, ...change } });
  const heightChoices = unit === "cm" ? Array.from({ length: 161 }, (_, i) => i + 90) : Array.from({ length: 64 }, (_, i) => i + 35);
  return <>
    <fieldset className={styles.editorFields}>
      <legend>Written prompts (optional)</legend>
      <small>Choose up to three. People can reply after you publish.</small>
      {answers.map(({ key, answer }, index) => <div className={styles.form} key={index}>
        <label>Prompt {index + 1}<select value={key} onChange={event => { const next = event.target.value as WrittenKey; setAnswers(answers.map((item, i) => i === index ? { key: next, answer: "" } : item)); }}>
          {[key, ...available].map(option => <option key={option} value={option}>{writtenPrompts[option]}</option>)}
        </select></label>
        <label>Your answer<textarea value={answer} maxLength={240} required onChange={event => setAnswers(answers.map((item, i) => i === index ? { ...item, answer: event.target.value } : item))}/></label>
        <button type="button" onClick={() => setAnswers(answers.filter((_, i) => i !== index))}>Remove prompt {index + 1}</button>
      </div>)}
      {answers.length < 3 ? <button type="button" onClick={() => { if (available[0]) setAnswers([...answers, { key: available[0], answer: "" }]); }}>Add written prompt</button> : null}
    </fieldset>
    {!!draft.photoIds?.length && <fieldset className={styles.editorFields}><legend>Photo prompts (optional)</legend>
      {draft.photoIds.map((photoId, index) => <label key={photoId}>Photo {index + 1} prompt<select aria-label={`Photo ${index + 1} prompt`} value={draft.photoPrompts?.find(item => item.photoId === photoId)?.key ?? ""} onChange={event => {
        const key = event.target.value as PhotoKey | "";
        edit({ photoPrompts: [...(draft.photoPrompts ?? []).filter(item => item.photoId !== photoId), ...(key ? [{ photoId, key }] : [])] });
      }}><option value="">No prompt</option>{Object.entries(photoPrompts).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>)}
    </fieldset>}
    <fieldset className={styles.editorFields}><legend>About me (optional)</legend>
      <small>Details you add here appear only after you publish. Leave anything you don’t want to share blank.</small>
      <label>Height units<select value={unit} onChange={event => setUnit(event.target.value)}><option value="cm">Centimeters</option><option value="in">Feet and inches</option></select></label>
      <label>Height<select aria-label="Height" value={about.heightCm ? unit === "cm" ? about.heightCm : Math.round(about.heightCm / 2.54) : ""} onChange={event => setAbout({ heightCm: event.target.value ? unit === "cm" ? Number(event.target.value) : Math.max(90, Math.min(250, Math.round(Number(event.target.value) * 2.54))) : undefined })}>
        <option value="">Don’t show</option>{heightChoices.map(value => <option key={value} value={value}>{unit === "cm" ? `${value} cm` : heightLabel(value)}</option>)}
      </select></label>
      <label>Languages<input defaultValue={about.languages?.join(", ") ?? ""} maxLength={158} onChange={event => setAbout({ languages: event.target.value.split(",").map(value => value.trim()).filter(Boolean) })}/><small>Up to five, separated by commas.</small></label>
      <label>Pets<select value={about.pets ?? ""} onChange={event => setAbout({ pets: (event.target.value || undefined) as DiscoveryAbout["pets"] })}><option value="">Don’t show</option>{Object.entries(petOptions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Family plans<select value={about.familyPlans ?? ""} onChange={event => setAbout({ familyPlans: (event.target.value || undefined) as DiscoveryAbout["familyPlans"] })}><option value="">Don’t show</option>{Object.entries(familyOptions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    </fieldset>
  </>;
}
