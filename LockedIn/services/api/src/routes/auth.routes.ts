import type { FastifyInstance } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";

export async function authRoutes(server: FastifyInstance) {
  server.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    handler: async (request, reply) => {
      try {
        const host = request.headers.host ?? "localhost:8000";
        const protocol =
          (request.headers["x-forwarded-proto"] as string | undefined) ??
          "http";

        const url = new URL(request.url, `${protocol}://${host}`);
        const headers = fromNodeHeaders(request.headers);

        const requestInit: RequestInit = {
          method: request.method,
          headers,
        };

        if (request.body) {
          requestInit.body =
            typeof request.body === "string"
              ? request.body
              : JSON.stringify(request.body);
        }

        const fetchRequest = new Request(url.toString(), requestInit);

        const authResponse = await auth.handler(fetchRequest);

        reply.status(authResponse.status);

        authResponse.headers.forEach((value, key) => {
          if (key.toLowerCase() !== "set-cookie") {
            reply.header(key, value);
          }
        });

        const setCookie = authResponse.headers.get("set-cookie");
        if (setCookie) {
          reply.header("set-cookie", setCookie);
        }

        const contentType = authResponse.headers.get("content-type") ?? "";
        const bodyText = await authResponse.text();

        if (contentType.includes("application/json")) {
          if (!bodyText) {
            return reply.send(null);
          }

          return reply.send(JSON.parse(bodyText));
        }

        return reply.send(bodyText || null);
      } catch (error) {
        request.log.error(error, "Authentication error");

        return reply.code(500).send({
          error: "Internal authentication error",
          code: "AUTH_FAILURE",
        });
      }
    },
  });
}
