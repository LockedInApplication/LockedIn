import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

const applicationSupport = path.join(homedir(), "Library", "Application Support");
export const togetherReportKeyHelper = path.join(applicationSupport, "LockedIn Together Reporting", "report-sign");
export const lockedInReportKeyHelper = path.join(applicationSupport, "LockedIn Weekly Reporting", "report-sign");

type Action = "create" | "public" | "sign";

function useReportKey(helper: string, action: Action, input?: Buffer) {
  if (process.platform !== "darwin") return null;
  const result = spawnSync(helper, [action], {
    input, encoding: "utf8", stdio: [input ? "pipe" : "ignore", "pipe", "ignore"], timeout: 20000,
  });
  if (result.status !== 0) return null;
  const output = result.stdout.trim();
  const format = action === "sign" ? /^[A-Za-z0-9+/]{86}==$/ : /^[A-Za-z0-9+/]{59}=$/;
  return format.test(output) ? output : null;
}

export const useTogetherReportKey = (action: Action, input?: Buffer) =>
  useReportKey(togetherReportKeyHelper, action, input);
export const useLockedInReportKey = (action: Action, input?: Buffer) =>
  useReportKey(lockedInReportKeyHelper, action, input);
