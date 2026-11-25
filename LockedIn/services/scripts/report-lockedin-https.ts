import { lockedInReportPath, lockedInReportProtocol, lockedInReportResponse } from "../api/src/features/reporting/lockedin-report-protocol.js";
import { isReportMonday, reportOrigin } from "../api/src/features/reporting/signed-weekly-report.js";
import { useLockedInReportKey } from "./together-report-keychain.js";

const [week, ...extra] = process.argv.slice(2);
async function run() {
  if (extra.length || (week !== undefined && !isReportMonday(week))) {
    return "Provide a Monday in YYYY-MM-DD format, or no date for the latest completed week.";
  }
  try {
    if (!useLockedInReportKey("public")) {
      return "The separate weekly LockedIn report key isn’t set up on this Mac.";
    }
    const wake = await fetch(reportOrigin + "/healthcheck", { redirect: "error", signal: AbortSignal.timeout(90000) });
    await wake.body?.cancel();
    if (!wake.ok) throw new Error();
    const path = week ? lockedInReportPath + "?week=" + week : lockedInReportPath;
    const authorization = lockedInReportProtocol.authorization(path, data => {
      const signature = useLockedInReportKey("sign", data);
      if (!signature) throw new Error();
      return Buffer.from(signature, "base64");
    });
    const response = await fetch(reportOrigin + path, {
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000),
      headers: { Authorization: authorization, Accept: "application/json" },
    });
    if (response.status === 404 || response.status === 400) {
      await response.body?.cancel();
      return response.status === 404
        ? "The weekly LockedIn report is not enabled for this key."
        : "Choose a completed UTC week within the last 52 weeks.";
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error();
    }
    const totals = lockedInReportResponse.parse(await response.json());
    if (week && totals.weekStart !== week) throw new Error();
    console.log(JSON.stringify(totals, null, 2));
    return;
  } catch {
    // Never emit a credential, an upstream error body, or unvalidated data.
    return "Couldn’t fetch the protected weekly LockedIn totals.";
  }
}

const failed = await run();
if (failed) {
  console.error(failed);
  process.exitCode = 1;
}
