import { buildServer } from "./app.js";
import { env } from "./config/env.js";
import { runAccountPhotoCleanup } from "./features/profile/account-photo-cleanup.js";
import { getPhotoConfig } from "./features/discovery/photos/photo.config.js";
import { getPhotoProvider } from "./features/discovery/photos/photo-provider.js";

async function start() {
  let polling: Promise<void> | null = null;
  let timer: NodeJS.Timeout | undefined;
  const runDeletionRound = () => {
    if (!getPhotoConfig().configured) return null;
    // Keep the scheduled HTTP check bounded, and share work with timers and request-triggered runs.
    return polling ??= runAccountPhotoCleanup(getPhotoProvider(), new Date(), 2).finally(() => { polling = null; });
  };
  const wakeDeletionWorker = () => {
    if (polling) return;
    void runDeletionRound()?.catch(() => {
      server.log.error("Account photo cleanup could not finish its round; it will retry.");
    });
  };
  const server = await buildServer({ wakeDeletionWorker, runDeletionRound });
  server.addHook("onClose", async () => { if (timer) clearInterval(timer); });

  try {
    await server.listen({ port: env.PORT, host: env.HOST });
    console.log(`Server listening at http://localhost:${env.PORT}/`);
    if (getPhotoConfig().configured) {
      wakeDeletionWorker();
      timer = setInterval(wakeDeletionWorker, 30_000);
      timer.unref();
    }
  } catch (err) {
    server.log.error(err, "Error starting server");
    process.exit(1);
  }
}

start();
