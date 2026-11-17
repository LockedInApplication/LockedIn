'use client';
import { useRef } from 'react';
import styles from './discovery-chat.module.scss';

export default function MessageActions({ busy, onReport, opening = false }: { busy: boolean; onReport: () => void; opening?: boolean }) {
  const menu = useRef<HTMLDetailsElement>(null);
  return <details ref={menu} className={styles.messageActions}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
    <summary aria-label={opening ? 'Opening message actions' : 'Message actions'} title="Message actions">⋯</summary>
    <div><button type="button" disabled={busy} onClick={() => { if (menu.current) { menu.current.open = false; menu.current.querySelector('summary')?.focus(); } onReport(); }}>{opening ? 'Report opening message' : 'Report message'}</button></div>
  </details>;
}
