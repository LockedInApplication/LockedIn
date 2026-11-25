import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import TogetherPrivacyNotice from "./page";

it("explains the opt-in pilot, use of internal IDs, and private reporting choice", () => {
  const notice = renderToStaticMarkup(<TogetherPrivacyNotice />);
  expect(notice).toContain("Only couples who both agreed to the pilot are counted");
  expect(notice).toContain("internal account and pair IDs");
  expect(notice).toContain("fewer than five eligible couples");
  expect(notice).toContain("Either partner can opt out privately");
  expect(notice).toContain('href="/profile#together-reporting"');
});
