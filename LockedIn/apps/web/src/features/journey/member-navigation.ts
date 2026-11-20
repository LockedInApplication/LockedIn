export const memberTabs = [
  { label: "Discover", href: "/discover", icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM16 8l-2 6-6 2 2-6 6-2Z" },
  { label: "Inbox", href: "/connections", icon: "M20 11.5a8 8 0 0 1-8 8H4l1.4-3.5A8 8 0 1 1 20 11.5Z" },
  { label: "Together", href: "/journey", icon: "M12 20 4.7 13A4.7 4.7 0 0 1 12 7a4.7 4.7 0 0 1 7.3 6L12 20Z" },
  { label: "Profile", href: "/profile", icon: "M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2" },
] as const;

export function activeMemberTab(pathname: string, invitationView = false) {
  if (pathname === "/journey") return invitationView ? "Inbox" : "Together";
  if (/^\/(connections|messages)(\/|$)/.test(pathname)) return "Inbox";
  if (["/profile", "/your-space", "/discover/matching", "/discover/profile", "/discovery/moderation"].includes(pathname)) return "Profile";
  if (pathname === "/discover") return "Discover";
  return null;
}
