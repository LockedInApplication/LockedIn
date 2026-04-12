import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import { authRoutes } from "./route/auth.routes.js";
import { healthRoutes } from "./route/health.routes.js";
import { userRoutes } from "./route/user.routes.js";

export async function buildServer() {
  const server = Fastify({ logger: true });

  await server.register(fastifyCors, {
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
  });

  server.register(healthRoutes);
  server.register(authRoutes);
  server.register(userRoutes);

  return server;
}
