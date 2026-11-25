import type { Writable } from "node:stream";
import Fastify, { type FastifyRequest } from "fastify";
import fastifyCors from "@fastify/cors";
import { authRoutes } from "./routes/auth.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { usersRoutes } from "./routes/users.routes.js";
import { journeyRoutes } from "./routes/journey.routes.js";
import { registerProfileRoutes } from "./features/profile/profile.routes.js";
import { cleanupTriggerPath, registerAccountPhotoTrigger } from "./features/profile/account-photo-trigger.routes.js";
import { registerDiscoveryRoutes } from "./features/discovery/discovery.routes.js";
import { registerMessagingRoutes } from "./features/messaging/messaging.routes.js";
import type { PhotoProvider } from "./features/discovery/photos/photo.types.js";
import type { DiscoveryGeocoder } from "./features/discovery/discovery-geocoding.js";
import { registerDateSpotRoutes } from "./features/date-spots/date-spots.routes.js";
import { registerDatePlanRoutes } from "./features/date-plans/date-plan-routes.js";
import type { PlaceProvider } from "./features/date-spots/date-spots-provider.js";
import { togetherReportPath } from "./features/reporting/together-report-protocol.js";
import { registerTogetherReport } from "./features/reporting/together-report.routes.js";

function serializeRequestForLog(request: FastifyRequest) {
  const path = request.url.split("?", 1)[0] ?? request.url;
  const authPath = path === "/api/auth" || path.startsWith("/api/auth/");
  const matchPreferencesPath = path.startsWith("/api/discovery/match-preferences");
  const version = request.headers["accept-version"];

  return {
    method: request.method,
    // Verification tokens are in the query; password reset tokens are in the path.
    url: authPath
      ? path.replace(/^\/api\/auth\/reset-password\/.*/, "/api/auth/reset-password/:token")
      : matchPreferencesPath || path === cleanupTriggerPath || path === togetherReportPath ? path : request.url,
    ...(typeof version === "string" ? { version } : version?.[0] ? { version: version[0] } : {}),
    host: request.host,
    remoteAddress: request.ip,
    ...(request.socket?.remotePort === undefined ? {} : { remotePort: request.socket.remotePort }),
  };
}

export async function buildServer({
  logStream,
  dateSpotProvider,
  wakeDeletionWorker,
  runDeletionRound,
  ...discoveryOptions
}: {
  logStream?: Writable;
  photoProvider?: PhotoProvider;
  discoveryGeocoder?: DiscoveryGeocoder;
  dateSpotProvider?: PlaceProvider;
  wakeDeletionWorker?: () => void;
  runDeletionRound?: () => Promise<void> | null;
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
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Discovery-Owner", "X-Messaging-Owner", "X-Roadmap-Owner", "X-Together-Owner"],
    credentials: true,
  });

  server.register(healthRoutes);
  server.register(authRoutes);
  server.register(usersRoutes);
  server.register(journeyRoutes);
  server.register(registerProfileRoutes, { wakeDeletionWorker });
  server.register(registerAccountPhotoTrigger, { runDeletionRound });
  server.register(registerDiscoveryRoutes, discoveryOptions);
  server.register(registerMessagingRoutes);
  server.register(async scope => registerDateSpotRoutes(scope,dateSpotProvider));
  server.register(registerDatePlanRoutes);
  server.register(registerTogetherReport);

  return server;
}
