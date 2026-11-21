"use client";

import { useCallback } from "react";
import { discoveryRequest } from "@/features/discovery/discovery.client";
import type { DiscoveryMe } from "@/features/discovery/discovery.types";
import { useDiscoveryResource } from "@/features/discovery/use-discovery-resource";
import ProfileSettingRow from "./ProfileSettingRow";

export default function ProfileMatchingSettings({ userId, onOpen }: { userId: string; onOpen: () => void }) {
  const load = useCallback((signal: AbortSignal) => discoveryRequest<DiscoveryMe>(userId, "/api/discovery/me", { signal }), [userId]);
  const { value } = useDiscoveryResource(userId, "profile-matching-access", load);
  if (!value?.matching?.complete && !value?.hasSavedMatchingSettings) return null;
  return <ProfileSettingRow title="Manage matching preferences" description="Review who you’re open to meeting." onOpen={onOpen} />;
}
