import { prisma } from "../../../lib/prisma.js";
import { getPhotoConfig } from "./photo.config.js";
import { getPhotoProvider } from "./photo-provider.js";
import { runPhotoJobs } from "./photo-jobs.service.js";
import { runAccountPhotoCleanup } from "../../profile/account-photo-cleanup.js";

try {
  if (process.argv.slice(2).join(" ") !== "--once") throw new Error("Use --once");
  if (!getPhotoConfig().configured) throw new Error("Missing photo provider configuration");
  const provider = getPhotoProvider();
  await runAccountPhotoCleanup(provider);
  const result = await runPhotoJobs({ provider });
  process.stdout.write(JSON.stringify(result) + "\n");
  if (result.failed) process.exitCode = 1;
} catch {
  process.stderr.write("Photo worker did not complete. Check configuration and the moderation queue.\n");
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
