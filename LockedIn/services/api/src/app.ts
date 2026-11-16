import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import { authRoutes } from "./routes/auth.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { usersRoutes } from "./routes/users.routes.js";
import { journeyRoutes } from "./routes/journey.routes.js";
import { registerProfileRoutes } from "./features/profile/profile.routes.js";
import { registerDiscoveryRoutes } from "./features/discovery/discovery.routes.js";
import type { PhotoProvider } from "./features/discovery/photos/photo.types.js";

export async function buildServer(options: { photoProvider?: PhotoProvider } = {}) {
  const server = Fastify({ logger: true });

  await server.register(fastifyCors, {
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Discovery-Owner"],
    credentials: true,
  });

  server.register(healthRoutes);
  server.register(authRoutes);
  server.register(usersRoutes);
  server.register(journeyRoutes);
  server.register(registerProfileRoutes);
  server.register(registerDiscoveryRoutes, options);

  return server;
}
