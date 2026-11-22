export type WorkspaceView = "home" | "conversations" | "atlas" | "roadmap" | "chapters";
export const currentCheckInHref = "/journey#current-action";

export function getWorkspaceView(search: string): WorkspaceView {
  const view = new URLSearchParams(search).get("view");
  switch (view) {
    case "conversations":
    case "atlas":
    case "roadmap":
    case "chapters":
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
  return `${url.pathname}${url.search}${url.hash}`;
}
