import { describe, expect, it } from "vitest";
import { getTogetherStarter, togetherChatHref, togetherStarter } from "./chat-starter";

describe("Together prompt drafts", () => {
  it("opens ordinary chat without a starter and routes only a preset key for the optional draft", () => {
    expect(togetherChatHref("contact/id")).toBe("/messages/contact%2Fid?from=together");
    expect(togetherChatHref("contact/id", true)).toBe("/messages/contact%2Fid?from=together&starter=good-memory");
  });
  it("accepts only a known starter from Together, not arbitrary draft text or repeated query values", () => {
    expect(getTogetherStarter("together", togetherStarter.key)).toBe(togetherStarter.text);
    expect(getTogetherStarter("together", undefined)).toBeUndefined();
    expect(getTogetherStarter("together", "some user text")).toBeUndefined();
    expect(getTogetherStarter("inbox", togetherStarter.key)).toBeUndefined();
    expect(getTogetherStarter("together", [togetherStarter.key])).toBeUndefined();
    expect(getTogetherStarter(["together"], togetherStarter.key)).toBeUndefined();
  });
});
