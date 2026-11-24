export type WorkspaceView = "home" | "conversations" | "atlas" | "roadmap" | "chapters" | "memories" | "room-to-talk";
export const currentCheckInHref = "/journey#current-action";
export const conversationTopicAnchor = "your-topic";
export const conversationTopicHref = `/journey?view=conversations#${conversationTopicAnchor}`;

export function roomToTalkHref(destination?: { shelf?: string; topic?: string }) {
  const query = new URLSearchParams({ view: "room-to-talk" });
  if (destination?.topic) query.set("topic", destination.topic);
  else if (destination?.shelf) query.set("shelf", destination.shelf);
  return `/journey?${query}`;
}

export function getWorkspaceView(search: string): WorkspaceView {
  const view = new URLSearchParams(search).get("view");
  switch (view) {
    case "conversations":
    case "atlas":
    case "roadmap":
    case "chapters":
    case "memories":
    case "room-to-talk":
      return view;
    default:
      return "home";
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
  if (view !== "home" && url.hash === "#current-action") url.hash = "";
  if (view !== "conversations" && url.hash === `#${conversationTopicAnchor}`) url.hash = "";
  return `${url.pathname}${url.search}${url.hash}`;
}
