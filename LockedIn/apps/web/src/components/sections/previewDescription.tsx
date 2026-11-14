import type { ReactNode } from "react";
import styles from "../styles/PreviewDescription.module.scss";

type PreviewDescriptionProps = {
  id?: string;
  title: string;
  heading?: string;
  shortDescription?: string;
  bg?: string;
  children?: ReactNode;
};

export default function PreviewDescription({
  id,
  title,
  heading,
  shortDescription,
  bg,
  children,
}: PreviewDescriptionProps) {
  return (
    <section id={id} className={styles.previewContainer} style={bg ? { backgroundColor: bg } : undefined}>
        <div className={styles.previewInner}>
        <header className={styles.previewHeader}>
        <h4 className={styles.previewTitle}>{title}</h4>
        {heading && <h2 className={styles.previewHeading}>{heading}</h2>}
      </header>

      {shortDescription && (
        <p className={styles.previewDescription}>{shortDescription}</p>
      )}

      {children}

        </div>
     
    </section>
  );
}
