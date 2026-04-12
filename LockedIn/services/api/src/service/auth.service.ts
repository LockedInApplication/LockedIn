import type { FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";

export async function processAuthRequest(request: FastifyRequest) {
  const host = request.headers.host ?? "localhost:8000";
  const protocol =
    (request.headers["x-forwarded-proto"] as string | undefined) ?? "http";

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

  const responseHeaders: Record<string, string> = {};
  authResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") {
      responseHeaders[key] = value;
    }
  });

  const setCookie = authResponse.headers.get("set-cookie");
  const contentType = authResponse.headers.get("content-type") ?? "";
  const bodyText = await authResponse.text();

  let body: unknown = bodyText || null;

  if (contentType.includes("application/json")) {
    body = bodyText ? JSON.parse(bodyText) : null;
  }

  return {
    status: authResponse.status,
    headers: responseHeaders,
    setCookie,
    body,
  };
}