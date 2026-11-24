export type WorkspaceView = "home" | "conversations" | "atlas" | "roadmap" | "chapters" | "memories";
export const currentCheckInHref = "/journey#current-action";
export const conversationTopicAnchor = "your-topic";
export const conversationTopicHref = `/journey?view=conversations#${conversationTopicAnchor}`;

export function getWorkspaceView(search: string): WorkspaceView {
  const view = new URLSearchParams(search).get("view");
  switch (view) {
    case "conversations":
    case "atlas":
    case "roadmap":
    case "chapters":
    case "memories":
      return view;
    default:
      return "home";
  }
}

export function workspaceViewUrl(currentUrl: string, view: WorkspaceView): string {
  const url = new URL(currentUrl, "http://localhost");
  url.searchParams.delete("suggestion");
  if (view === "home") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  if (view !== "home" && url.hash === "#current-action") url.hash = "";
  if (view !== "conversations" && url.hash === `#${conversationTopicAnchor}`) url.hash = "";
  return `${url.pathname}${url.search}${url.hash}`;
}
