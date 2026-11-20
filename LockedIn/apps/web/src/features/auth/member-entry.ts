const memberRoots = ["/journey", "/connections", "/messages", "/discover", "/discovery", "/profile", "/your-space"];

export function isMemberPath(path: string) {
  return memberRoots.some(root => path === root || path.startsWith(`${root}/`));
}

export function safeMemberReturnTo(value: string | null) {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return "/journey";
  try {
    const parsed = new URL(value, "https://lockedin.invalid");
    return parsed.origin === "https://lockedin.invalid" && isMemberPath(parsed.pathname)
      ? `${parsed.pathname}${parsed.search}${parsed.hash}` : "/journey";
  } catch {
    return "/journey";
  }
}

export function verificationPath(returnTo: string | null) {
  return `/verify-email?pending=1&returnTo=${encodeURIComponent(safeMemberReturnTo(returnTo))}`;
}
