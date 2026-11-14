import { buildServer } from "./app.js";
import { env } from "./config/env.js";

async function start() {
  const server = await buildServer();

  try {
    await server.listen({ port: env.PORT, host: env.HOST });
    console.log(`Server listening at http://localhost:${env.PORT}/`);
  } catch (err) {
    server.log.error(err, "Error starting server");
    process.exit(1);
  }
}

start();
