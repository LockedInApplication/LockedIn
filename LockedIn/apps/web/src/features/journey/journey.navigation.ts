export type WorkspaceView = "home" | "talk" | "check-ins" | "conversations" | "atlas" | "roadmap" | "chapters" | "memories" | "room-to-talk" | "options";
export const workspaceHref = (view: WorkspaceView) => view === "home" ? "/journey" : `/journey?view=${view}`;
export const manageTogetherHref = workspaceHref("options");
export const manageTogetherSource = "manage-together";
export const chatSafetyAnchor = "chat-safety";
export const discoveryVisibilityAnchor = "discovery-visibility";
export const discoveryVisibilityHref = `/discover/profile#${discoveryVisibilityAnchor}`;
export const togetherReportingProfileAnchor = "together-reporting";
export const togetherReportingProfileHref = `/profile#${togetherReportingProfileAnchor}`;
export const togetherChatSafetyHref = (conversationId: string) =>
  `/messages/${encodeURIComponent(conversationId)}?from=${manageTogetherSource}#${chatSafetyAnchor}`;
export const checkInsHref = workspaceHref("check-ins");
export const currentCheckInHref = `${checkInsHref}#current-action`;
export const conversationTopicAnchor = "your-topic";
export const conversationTopicHref = `/journey?view=conversations#${conversationTopicAnchor}`;

export function roomToTalkHref(destination?: { shelf?: string; topic?: string }) {
  const query = new URLSearchParams({ view: "room-to-talk" });
  if (destination?.topic) query.set("topic", destination.topic);
  else if (destination?.shelf) query.set("shelf", destination.shelf);
  return `/journey?${query}`;
}

export function getWorkspaceView(search: string, hash = ""): WorkspaceView {
  const view = new URLSearchParams(search).get("view");
  switch (view) {
    case "talk":
    case "check-ins":
    case "conversations":
    case "atlas":
    case "roadmap":
    case "chapters":
    case "memories":
    case "room-to-talk":
    case "options":
      return view;
    default:
      // Older notifications and bookmarks pointed at the check-in on Home.
      if ((view === null || view === "home") && hash === "#current-action") return "check-ins";
      return "home";
  }
}

export function workspaceBack(view: WorkspaceView): { view: WorkspaceView; label: string } {
  switch (view) {
    case "conversations":
    case "chapters":
      return { view: "check-ins", label: "Check-ins" };
    case "room-to-talk":
    case "check-ins":
    case "atlas":
      return { view: "talk", label: "Talk" };
    default:
      return { view: "home", label: "Together" };
  }
}

export function workspaceViewUrl(currentUrl: string, view: WorkspaceView): string {
  const url = new URL(currentUrl, "http://localhost");
  url.searchParams.delete("suggestion");
  if (url.searchParams.get("view") === "room-to-talk" && view !== "room-to-talk") {
    for (const key of ["shelf", "topic"]) url.searchParams.delete(key);
  }
  if (view === "home") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  if (view !== "check-ins" && url.hash === "#current-action") url.hash = "";
  if (view !== "conversations" && url.hash === `#${conversationTopicAnchor}`) url.hash = "";
  if (view !== "roadmap" && url.hash.startsWith("#step-")) url.hash = "";
  if (view !== "memories" && url.hash.startsWith("#memory-plan/")) url.hash = "";
  return `${url.pathname}${url.search}${url.hash}`;
}
