export type WorkspaceView = "home" | "conversations" | "atlas" | "roadmap" | "chapters";

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
  if (view === "home") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  return `${url.pathname}${url.search}${url.hash}`;
}
