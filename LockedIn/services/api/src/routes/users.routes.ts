import type { FastifyInstance } from "fastify";

export async function usersRoutes(server: FastifyInstance) {
  server.get("/users", async () => {
    return [
      { id: "u_1", name: "Akwasi" },
      { id: "u_2", name: "Abena" },
    ];
  });
}
