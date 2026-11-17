import type { Writable } from "node:stream";
import Fastify, { type FastifyRequest } from "fastify";
import fastifyCors from "@fastify/cors";
import { authRoutes } from "./routes/auth.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { usersRoutes } from "./routes/users.routes.js";
import { journeyRoutes } from "./routes/journey.routes.js";
import { registerProfileRoutes } from "./features/profile/profile.routes.js";
import { registerDiscoveryRoutes } from "./features/discovery/discovery.routes.js";
import type { PhotoProvider } from "./features/discovery/photos/photo.types.js";
import type { DiscoveryGeocoder } from "./features/discovery/discovery-geocoding.js";

function serializeRequestForLog(request: FastifyRequest) {
  const path = request.url.split("?", 1)[0];
  const authPath = path === "/api/auth" || path.startsWith("/api/auth/");
  const version = request.headers["accept-version"];

  return {
    method: request.method,
    // Verification tokens are in the query; password reset tokens are in the path.
    url: authPath
      ? path.replace(/^\/api\/auth\/reset-password\/.*/, "/api/auth/reset-password/:token")
      : request.url,
    version: Array.isArray(version) ? version[0] : version,
    host: request.host,
    remoteAddress: request.ip,
    remotePort: request.socket?.remotePort,
  };
}

export async function buildServer({
  logStream,
  ...discoveryOptions
}: {
  logStream?: Writable;
  photoProvider?: PhotoProvider;
  discoveryGeocoder?: DiscoveryGeocoder;
} = {}) {
  const server = Fastify({
    logger: {
      ...(logStream ? { stream: logStream } : {}),
      serializers: { req: serializeRequestForLog },
    },
  });

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
  server.register(registerDiscoveryRoutes, discoveryOptions);

  return server;
}
