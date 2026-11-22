import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import DirectLockIn from "./DirectLockIn";

const props = { userId: "user", conversationId: "chat", onRefresh: () => {} };

it("offers an opt-in request without claiming Discovery is already paused", () => {
  const html = renderToStaticMarkup(<DirectLockIn {...props} state={{ state: "available" }} />);
  expect(html).toContain(">Ask to lock in</button>");
  expect(html).not.toContain(">Open Together</a>");
});

it("allows the sender to withdraw and the recipient to pass", () => {
  const sender = renderToStaticMarkup(<DirectLockIn {...props} state={{ state: "requested", requestId: "choice" }} />);
  const recipient = renderToStaticMarkup(<DirectLockIn {...props} state={{ state: "received", requestId: "choice" }} />);
  expect(sender).toContain(">Withdraw request</button>");
  expect(sender).not.toContain(">Lock in together</button>");
  expect(recipient).toContain(">Lock in together</button>");
  expect(recipient).toContain(">Not now</button>");
});

it("offers Together after mutual confirmation and does not duplicate a link inside Together", () => {
  expect(renderToStaticMarkup(<DirectLockIn {...props} state={{ state: "locked" }} />)).toContain('href="/journey">Open Together');
  expect(renderToStaticMarkup(<DirectLockIn {...props} state={{ state: "locked" }} inTogether />)).toBe("");
});
