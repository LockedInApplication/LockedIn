"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import AtlasChapterDialog from "./AtlasChapterDialog";
import chapterStyles from "./atlas-chapter.module.scss";

export default function AtlasChapterButton({ chapterId, wordTitle }: { chapterId: string; wordTitle: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={chapterStyles.viewButton} aria-haspopup="dialog" aria-expanded={open}
        aria-label={`View full ${wordTitle} chapter`} onClick={() => setOpen(true)}>
        View full chapter <span aria-hidden>↗</span>
      </button>
      {open ? createPortal(
        <AtlasChapterDialog key={chapterId} chapterId={chapterId} wordTitle={wordTitle} onClose={() => setOpen(false)} />,
        document.body,
      ) : null}
    </>
  );
}
