import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import VerifyEmailPage from "@/app/verify-email/page";

const state = vi.hoisted(() => ({ query: "", user: null as null | { id: string; email: string; emailVerified: boolean } }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.query), useRouter: () => ({ push() {} }) }));
vi.mock("@/utils/authCLient", () => ({ authClient: { useSession: () => ({ isPending: false, data: state.user ? { user: state.user } : null }) } }));
beforeEach(() => { state.query = ""; state.user = null; });

it("offers resend on the pending page rather than stranding users with instructions", () => {
  state.query = "pending=1";
  const html = renderToStaticMarkup(<VerifyEmailPage />);
  expect(html).toContain("Resend verification email");
  expect(html).toContain('type="email"');
  expect(html).not.toContain("You will be able to log in after");
});
it("does not claim verification on a bare URL or query-supplied success", () => {
  for (const query of ["", "verified=1", "pending=1&verified=1"]) {
    state.query = query;
    const html = renderToStaticMarkup(<VerifyEmailPage />);
    expect(html).not.toContain("Your email has been verified");
    expect(html).toContain("Resend verification email");
  }
});
it("prefills signed-in account without putting the email in links", () => {
  state.query = "pending=1&email=wrong%40example.test";
  state.user = { id: "owner-a", email: "a@example.test", emailVerified: false };
  const html = renderToStaticMarkup(<VerifyEmailPage />);
  expect(html).toContain('value="a@example.test"');
  expect(html).toContain("check again");
  expect(html).not.toContain("wrong@example.test");
  expect(html).not.toMatch(/href="[^"]*email=/);
});
it("shows an expired-link error alongside a usable resend form", () => {
  state.query = "error=invalid_token";
  const html = renderToStaticMarkup(<VerifyEmailPage />);
  expect(html).toContain("invalid or expired");
  expect(html).toContain("Resend verification email");
});
