import { expect, it } from "vitest";
import { mergeLatestMessages, type ChatPage, type ChatMessage } from "./discovery-chat";
function page(ids: number[], nextCursor: string | null = null): ChatPage {
  return { items: ids.map(n => ({ id: String(n), sequence: String(n), author: "self", text: "Hello", createdAt: "2026-11-17T18:00:00Z" } satisfies ChatMessage)), nextCursor };
}
it("catches up without duplicating overlapping messages or losing loaded history", () => {
  expect(mergeLatestMessages(page([1, 2, 3], "1"), page([2, 3, 4], "2")))
    .toEqual(page([1, 2, 3, 4], "1"));
});
it("resets pagination after a long offline gap instead of silently dropping unseen messages", () => {
  expect(mergeLatestMessages(page([1, 2], "1"), page([40, 41], "40"))).toEqual(page([40, 41], "40"));
});
it("installs the first page and clears cached content when the server returns no messages", () => {
  expect(mergeLatestMessages(null, page([1]))).toEqual(page([1]));
  expect(mergeLatestMessages(page([1]), page([]))).toEqual(page([]));
});
