"use client";

import { useCallback } from "react";
import { discoveryRequest } from "@/features/discovery/discovery.client";
import type { DiscoveryMe } from "@/features/discovery/discovery.types";
import { useDiscoveryResource } from "@/features/discovery/use-discovery-resource";
import styles from "./profile.module.scss";

export default function ProfileMatchingSettings({ userId, onOpen }: { userId: string; onOpen: () => void }) {
  const load = useCallback((signal: AbortSignal) => discoveryRequest<DiscoveryMe>(userId, "/api/discovery/me", { signal }), [userId]);
  const { value } = useDiscoveryResource(userId, "profile-matching-access", load);
  if (!value?.matching?.complete && !value?.hasSavedMatchingSettings) return null;
  return <p><button className={styles.textButton} type="button" onClick={onOpen}>Manage matching preferences</button></p>;
}
