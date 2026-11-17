import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import ConversationOpening, { type ConversationOpener } from "./ConversationOpening";
const opening: ConversationOpener = { topic: { key: "prompt", text: "A Sunday I’d happily repeat…" }, hello: "Coffee and a walk?", inviter: "partner", partner: { publicName: "Jamie", avatarPreset: "leaf" } };
it("shows the received prompt reply as the opening message, with a report action", () => {
  const html = renderToStaticMarkup(<ConversationOpening opening={opening} busy={false} onReport={() => {}}/>);
  expect(html).toContain("Coffee and a walk?");
  expect(html).toContain("Jamie");
  expect(html).toContain("Report opening message");
  expect(html).toContain("A Sunday");
});
it("labels an outgoing opener as yours and does not offer reporting it", () => {
  const html = renderToStaticMarkup(<ConversationOpening opening={{ ...opening, inviter: "self" }} busy={false} onReport={() => {}}/>);
  expect(html).toContain(">You</strong>");
  expect(html).not.toContain("Report opening message");
});
it("does not invent a message for an earlier invitation without one", () => {
  const html = renderToStaticMarkup(<ConversationOpening opening={{ ...opening, hello: "" }} busy={false} onReport={() => {}}/>);
  expect(html).toContain("without a message");
  expect(html).not.toContain('aria-label="Opening message"');
});
