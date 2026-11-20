import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import DirectInvite from "./DirectInvite";

vi.mock("@/features/discovery/DiscoveryShell", () => ({ useDiscovery: () => ({ busy: false, setBusy: () => {}, setDirty: () => {} }) }));

it("explains the result of an invitation without making Discovery a prerequisite", () => {
  const html = renderToStaticMarkup(<DirectInvite/>);
  expect(html).toContain("Their email");
  expect(html).toContain('type="email"');
  expect(html).toContain("Send private invite");
  expect(html).toContain("chat in Inbox");
});
