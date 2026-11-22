import { buildServer } from "./app.js";
import { env } from "./config/env.js";
import { runAccountPhotoCleanup } from "./features/profile/account-photo-cleanup.js";
import { getPhotoConfig } from "./features/discovery/photos/photo.config.js";
import { getPhotoProvider } from "./features/discovery/photos/photo-provider.js";

async function start() {
  let polling = false;
  let timer: NodeJS.Timeout | undefined;
  const wakeDeletionWorker = () => {
    if (polling || !getPhotoConfig().configured) return;
    polling = true;
    void runAccountPhotoCleanup(getPhotoProvider()).catch(() => {
      server.log.error("Account photo cleanup could not finish its round; it will retry.");
    }).finally(() => { polling = false; });
  };
  const server = await buildServer({ wakeDeletionWorker });
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
