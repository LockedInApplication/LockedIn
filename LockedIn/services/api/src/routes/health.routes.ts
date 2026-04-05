import type { FastifyInstance } from "fastify";

export async function healthRoutes(server: FastifyInstance) {
  server.get("/", async () => {
    return {
      service: "LockedIn API",
      status: "ok",
      healthcheck: "/healthcheck",
    };
  });

  server.get("/healthcheck", async () => {
    return { status: "ok" };
  });
}
