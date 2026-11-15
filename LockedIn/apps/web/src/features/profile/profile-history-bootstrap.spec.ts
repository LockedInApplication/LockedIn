import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { profileHistoryBootstrap } from "./profile-history-bootstrap";
it("tracks legacy history positions without losing Next state", () => {
  const history = {
    state: { __NA: true, tree: "initial" } as Record<string, unknown>,
    pushState(state: Record<string, unknown>) {
      this.state = state;
    },
    replaceState(state: Record<string, unknown>) {
      this.state = state;
    },
  };
  let pop: ((event: { state: Record<string, unknown> }) => void) | undefined;
  const window = {
    navigation: undefined,
    addEventListener: (_name: string, handler: typeof pop) => {
      pop = handler;
    },
  };
  runInNewContext(profileHistoryBootstrap, { window, history });
  expect(history.state).toMatchObject({
    __NA: true,
    tree: "initial",
    __lockedInHistoryPosition: 0,
  });
  history.pushState({ __NA: true, tree: "profile" });
  expect(history.state.__lockedInHistoryPosition).toBe(1);
  history.replaceState({ __NA: true, tree: "updated" });
  expect(history.state).toMatchObject({
    tree: "updated",
    __lockedInHistoryPosition: 1,
  });
  pop!({ state: { __lockedInHistoryPosition: 0 } });
  history.pushState({ __NA: true, tree: "new branch" });
  expect(history.state.__lockedInHistoryPosition).toBe(1);
});
