"use client";
import { useEffect, useState } from "react";
import { loadProfile } from "./profile.client";
import type { Profile } from "./profile.types";
import { JourneyApiError } from "@/features/journey/journey.client";
export function useProfile(userId: string) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    loadProfile(controller.signal)
      .then((data) => {
        if (active && data.id === userId) setProfile(data);
        else if (active)
          setError("Your account changed. Please reload this page.");
      })
      .catch((e) => {
        if (!active) return;
        if (e instanceof JourneyApiError && e.status === 401) {
          window.location.replace("/login?returnTo=%2Fprofile");
          return;
        }
        setError(
          e instanceof Error ? e.message : "Unable to load your profile.",
        );
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [userId, retry]);
  return {
    profile,
    setProfile,
    error,
    retry: () => {
      setError("");
      setRetry((value) => value + 1);
    },
  };
}
