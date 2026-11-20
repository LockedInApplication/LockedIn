export type TinyLanternView = "home" | "roadmap" | "conversations";

export const tinyLanternWelcome = "You two are locked in! Keep chatting, make a plan, or try a guided conversation. No rush.";

export function claimTinyLanternWelcome(
  getStorage: () => Pick<Storage, "getItem" | "setItem">,
  userId: string,
  relationshipId: string,
): boolean {
  try {
    const storage = getStorage();
    const key = `lockedin:tiny-lantern:v1:${JSON.stringify([userId, relationshipId])}`;
    if (storage.getItem(key) !== null) return false;
    storage.setItem(key, "1");
    return true;
  } catch {
    // Manual help still works when the browser disallows storage.
    return false;
  }
}

export function tinyLanternTip(view: TinyLanternView): string {
  switch (view) {
    case "roadmap": return "Suggest an idea. You don’t have to pick a day yet.";
    case "conversations": return "Answer privately. You decide what to share.";
    case "home": return "Your chat is in Inbox. Here, you can suggest a plan or try a guided conversation together.";
  }
}
