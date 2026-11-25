import { workspaceHref } from "@/features/journey/journey.navigation";

const anchor = "#memory-plan/";
export const planMemoryHref = (planId: string) => `${workspaceHref("memories")}${anchor}${encodeURIComponent(planId)}`;

export function planMemoryTarget(hash: string) {
  if (!hash.startsWith(anchor)) return null;
  const id = hash.slice(anchor.length);
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id) ? id : null;
}

export function planMemoryTitle(title: string) {
  // Keep the existing photo title limit without cutting an emoji in half.
  return title.trim().slice(0, 80).replace(/[\uD800-\uDBFF]$/, "").trimEnd();
}
