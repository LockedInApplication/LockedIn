import Fastify from "fastify";
import { authRoutes } from "./routes/auth.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { usersRoutes } from "./routes/users.routes.js";

export function buildServer() {
  const server = Fastify({ logger: true });

  server.register(healthRoutes);
  server.register(authRoutes);
  server.register(usersRoutes);

  return server;
}
