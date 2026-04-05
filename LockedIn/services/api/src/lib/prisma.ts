import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";
import { env, requireEnv } from "../config/env.js";

const globalForPrisma = globalThis as {
  prisma?: InstanceType<typeof PrismaClient>;
};

const adapter = new PrismaPg({
  connectionString: requireEnv("DATABASE_URL"),
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
