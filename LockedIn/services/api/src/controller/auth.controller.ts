import type { FastifyReply, FastifyRequest } from "fastify";
import { processAuthRequest } from "../service/auth.service.js";

export async function handleAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    const result = await processAuthRequest(request);

    reply.status(result.status);

    for (const [key, value] of Object.entries(result.headers)) {
      reply.header(key, value);
    }

    if (result.setCookie) {
      reply.header("set-cookie", result.setCookie);
    }

    return reply.send(result.body);
  } catch (error) {
    request.log.error(error, "Authentication error");

    return reply.code(500).send({
      error: "Internal authentication error",
      code: "AUTH_FAILURE",
    });
  }
}