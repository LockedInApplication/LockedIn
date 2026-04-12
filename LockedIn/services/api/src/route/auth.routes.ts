import type { FastifyInstance } from "fastify";
import { handleAuth } from "../controller/auth.controller.js";

export async function authRoutes(server: FastifyInstance) {
  server.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    handler: handleAuth,
  });
}