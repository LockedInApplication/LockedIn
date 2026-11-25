import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

export const togetherReportKeyHelper = path.join(homedir(), "Library", "Application Support", "LockedIn Together Reporting", "report-sign");

export function useTogetherReportKey(action: "create" | "public" | "sign", input?: Buffer) {
  if (process.platform !== "darwin") return null;
  const result = spawnSync(togetherReportKeyHelper, [action], {
    input, encoding: "utf8", stdio: [input ? "pipe" : "ignore", "pipe", "ignore"], timeout: 20000,
  });
  if (result.status !== 0) return null;
  const output = result.stdout.trim();
  const format = action === "sign" ? /^[A-Za-z0-9+/]{86}==$/ : /^[A-Za-z0-9+/]{59}=$/;
  return format.test(output) ? output : null;
}
