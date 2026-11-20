import { expect, it } from "vitest";
import { QuietRefresh } from "./use-quiet-refresh";

it("batches routine updates while editing and does not apply a stale response", async () => {
  const requests: ((value: string) => void)[] = [];
  const applied: string[] = [];
  const refresh = new QuietRefresh<string>(() => new Promise(resolve => requests.push(resolve)), value => applied.push(value));
  refresh.invalidate();
  await Promise.resolve();
  refresh.setBlocked(true);
  refresh.invalidate();
  refresh.invalidate();
  requests[0]!("stale");
  await Promise.resolve();
  expect(applied).toEqual([]);
  expect(requests).toHaveLength(1);
  refresh.setBlocked(false);
  await Promise.resolve();
  expect(requests).toHaveLength(2);
  requests[1]!("fresh");
  await Promise.resolve();
  await Promise.resolve();
  expect(applied).toEqual(["fresh"]);
});

it("can surface a current refresh failure and retry without replacing the last good view", async () => {
  const applied: string[] = [], errors: unknown[] = [];
  const failure = new Error("offline");
  let first = true;
  const refresh = new QuietRefresh<string>(async () => {
    if (first) { first = false; throw failure; }
    return "updated";
  }, value => applied.push(value), error => errors.push(error));
  refresh.invalidate();
  await new Promise(resolve => setTimeout(resolve,0));
  expect(errors).toEqual([failure]);
  expect(applied).toEqual([]);
  refresh.invalidate();
  await new Promise(resolve => setTimeout(resolve,0));
  expect(applied).toEqual(["updated"]);
});
