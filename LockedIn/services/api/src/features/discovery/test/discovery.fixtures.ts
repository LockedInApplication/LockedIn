import { createHmac, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";

export async function createPerson(emailVerified = true) {
  const { prisma } = await import("../../../lib/prisma.js");
  const id = `discovery-${randomUUID()}`;
  const token = `token-${id}`;
  const person = await prisma.user.create({ data: { id, email: `${id}@example.test`, name: "PRIVATE AUTH NAME", emailVerified } });
  await prisma.session.create({ data: { id: `session-${id}`, userId: id, token, expiresAt: new Date(Date.now() + 3_600_000) } });
  const signature = createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(token).digest("base64");
  return { ...person, cookie: `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}` };
}

export function discoveryRequest(server: FastifyInstance) {
  return async (person: { id: string; cookie: string }, method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH", url: string, payload?: object) => {
    const address = server.server.address();
    if (!address || typeof address === "string") throw new Error("Fixture requires a listening local test server");
    const response = await fetch(`http://127.0.0.1:${address.port}${url}`, {
      method, ...(payload ? { body: JSON.stringify(payload) } : {}),
      headers: { cookie: person.cookie, origin: "http://localhost:3001", "x-discovery-owner": person.id, ...(payload ? { "content-type": "application/json" } : {}) },
    });
    const body = await response.text();
    return { statusCode: response.status, headers: Object.fromEntries(response.headers), json: () => JSON.parse(body) };
  };
}
