import { isReportMonday, togetherReportAuthorization, togetherReportOrigin, togetherReportPath, togetherReportResponse } from "../api/src/features/reporting/together-report-protocol.js";
import { useTogetherReportKey } from "./together-report-keychain.js";

const [week, ...extra] = process.argv.slice(2);
if (extra.length || (week !== undefined && !isReportMonday(week))) {
  console.error("Provide a Monday in YYYY-MM-DD format, or no date for the latest completed week.");
  process.exitCode = 1;
} else {
  try {
    if (!useTogetherReportKey("public")) {
      console.error("The Together report key is not available in this Mac’s Keychain.");
      process.exitCode = 1;
    } else {
      // The free service can go to sleep. Wake it before issuing a short-lived proof.
      const wake = await fetch(togetherReportOrigin + "/healthcheck", { redirect: "error", signal: AbortSignal.timeout(90000) });
      await wake.body?.cancel();
      if (!wake.ok) throw new Error("Health check failed");
      const path = week ? togetherReportPath + "?week=" + week : togetherReportPath;
      const auth = togetherReportAuthorization(path, data => {
        const signature = useTogetherReportKey("sign", data);
        if (!signature) throw new Error("Couldn’t sign the report");
        return Buffer.from(signature, "base64");
      });
      const response = await fetch(togetherReportOrigin + path, {
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20000),
        headers: { Authorization: auth, Accept: "application/json" },
      });
      if (response.status === 400) {
        await response.body?.cancel();
        console.error("Choose a completed UTC week within the last 52 weeks.");
        process.exitCode = 1;
      } else if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Report unavailable");
      } else {
        console.log(JSON.stringify(togetherReportResponse.parse(await response.json()), null, 2));
      }
    }
  } catch {
    // Print neither request credentials nor unvalidated response data.
    console.error("Couldn’t fetch the protected Together report. Check the production API, Keychain access, and the registered public key.");
    process.exitCode = 1;
  }
}
