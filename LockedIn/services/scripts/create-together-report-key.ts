import { spawnSync } from "node:child_process";
import { chmodSync, constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { togetherReportKeyHelper, useTogetherReportKey } from "./together-report-keychain.js";

const [option, ...extra] = process.argv.slice(2);
let temp: string | undefined;
try {
  if (process.platform !== "darwin" || extra.length || (option !== undefined && option !== "--show-public")) throw new Error();
  if (option !== "--show-public" && !existsSync(togetherReportKeyHelper)) {
    temp = mkdtempSync(path.join(tmpdir(), "lockedin-together-report-key-"));
    const binary = path.join(temp, "report-sign");
    const source = fileURLToPath(new URL("./together-report-key-helper.swift", import.meta.url));
    if (spawnSync("/usr/bin/swiftc", ["-module-cache-path", path.join(temp, "cache"), source, "-o", binary], { stdio: "ignore", timeout: 45000 }).status !== 0) throw new Error();
    mkdirSync(path.dirname(togetherReportKeyHelper), { mode: 0o700, recursive: true });
    copyFileSync(binary, togetherReportKeyHelper, constants.COPYFILE_EXCL);
    chmodSync(togetherReportKeyHelper, 0o700);
  }
  const key = useTogetherReportKey(option === "--show-public" ? "public" : "create");
  if (!key) throw new Error();
  console.log(key);
} catch {
  console.error("Couldn’t create or read the dedicated report key in this Mac’s Keychain. An existing key was not overwritten.");
  process.exitCode = 1;
} finally {
  if (temp) rmSync(temp, { recursive: true, force: true });
}
