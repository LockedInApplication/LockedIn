import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import ChatPrompt from "./ChatPrompt";
import { togetherStarter } from "./chat-starter";

it("starts collapsed and uses a draft-only button that never submits the composer", () => {
  const html = renderToStaticMarkup(<ChatPrompt disabled={false} hasDraft={false} onUse={() => {}} />);
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain(togetherStarter.text);
  expect(html).toContain('<button type="button">Use in draft</button>');
  expect(html).not.toContain('type="submit"');
});

it("would not replace a draft that already has text", () => {
  const html = renderToStaticMarkup(<ChatPrompt disabled={false} hasDraft onUse={() => {}} />);
  expect(html).toContain('<button type="button" disabled="">Use in draft</button>');
  expect(html).toContain("Send or clear your current draft first.");
});
