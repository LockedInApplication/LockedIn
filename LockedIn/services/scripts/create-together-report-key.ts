import { spawnSync } from "node:child_process";
import { chmodSync, constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lockedInReportKeyHelper, togetherReportKeyHelper, useLockedInReportKey, useTogetherReportKey } from "./together-report-keychain.js";

const args = process.argv.slice(2);
const lockedIn = args[0] === "--lockedin-weekly";
const [option, ...extra] = lockedIn ? args.slice(1) : args;
const helper = lockedIn ? lockedInReportKeyHelper : togetherReportKeyHelper;
const useKey = lockedIn ? useLockedInReportKey : useTogetherReportKey;
let temp: string | undefined;
try {
  if (process.platform !== "darwin" || extra.length || (option !== undefined && option !== "--show-public")) throw new Error();
  if (option !== "--show-public" && !existsSync(helper)) {
    temp = mkdtempSync(path.join(tmpdir(), "lockedin-report-key-"));
    const binary = path.join(temp, "report-sign");
    const source = fileURLToPath(new URL("./together-report-key-helper.swift", import.meta.url));
    const audience = lockedIn ? ["-D", "LOCKEDIN_WEEKLY_REPORT"] : [];
    if (spawnSync("/usr/bin/swiftc", ["-module-cache-path", path.join(temp, "cache"), ...audience, source, "-o", binary], { stdio: "ignore", timeout: 45000 }).status !== 0) throw new Error();
    mkdirSync(path.dirname(helper), { mode: 0o700, recursive: true });
    copyFileSync(binary, helper, constants.COPYFILE_EXCL);
    chmodSync(helper, 0o700);
  }
  const key = useKey(option === "--show-public" ? "public" : "create");
  if (!key) throw new Error();
  console.log(key);
} catch {
  console.error("Couldn’t create or read the dedicated report key in this Mac’s Keychain. An existing key was not overwritten.");
  process.exitCode = 1;
} finally {
  if (temp) rmSync(temp, { recursive: true, force: true });
}
