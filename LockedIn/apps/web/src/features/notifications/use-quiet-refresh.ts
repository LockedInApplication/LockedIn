"use client";
import { useCallback, useLayoutEffect, useRef } from "react";

export class QuietRefresh<T> {
  private pending = false;
  private blocked = false;
  private scheduled = false;
  private closed = false;
  private active: AbortController | null = null;

  constructor(private readonly load: (signal: AbortSignal) => Promise<T>, private readonly apply: (value: T) => void, private readonly onError?: (error: unknown) => void) {}

  invalidate() {
    if (this.closed) return;
    this.pending = true;
    this.queue();
  }

  setBlocked(value: boolean) {
    this.blocked = value;
    if (value && this.active) {
      this.active.abort();
      this.active = null;
      this.pending = true;
    }
    this.queue();
  }

  close() {
    this.closed = true;
    this.active?.abort();
    this.active = null;
  }

  private queue() {
    if (this.closed || this.blocked || this.active || this.scheduled || !this.pending) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (this.closed || this.blocked || this.active || !this.pending) return;
      const controller = new AbortController();
      this.active = controller;
      this.pending = false;
      const isCurrent = () => this.active === controller && !controller.signal.aborted && !this.blocked && !this.pending;
      void this.load(controller.signal).then(value => {
        if (isCurrent()) this.apply(value);
      }).catch(error => { if (isCurrent()) this.onError?.(error); }).finally(() => {
        if (this.active === controller) this.active = null;
        this.queue();
      });
    });
  }
}

export function useQuietRefresh<T>(load: (signal: AbortSignal) => Promise<T>, apply: (value: T) => void, onError?: (error: unknown) => void) {
  const controller = useRef<QuietRefresh<T> | null>(null);
  const blocked = useRef(false);
  useLayoutEffect(() => {
    const current = new QuietRefresh(load,apply,onError);
    current.setBlocked(blocked.current);
    controller.current = current;
    return () => { current.close(); controller.current = null; };
  },[load,apply,onError]);
  const invalidate = useCallback(() => controller.current?.invalidate(),[]);
  const setBlocked = useCallback((value: boolean) => {
    blocked.current = value;
    controller.current?.setBlocked(value);
  },[]);
  return { invalidate,setBlocked };
}
