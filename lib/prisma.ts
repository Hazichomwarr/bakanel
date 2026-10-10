import "server-only";

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

import { initializePrismaRuntime } from "./database/disposable-runtime";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const createPrismaClient = () => {
  return initializePrismaRuntime(process.env, {
    createNeon(connectionString) {
      neonConfig.webSocketConstructor = ws;

      return new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
    },
    createPostgres(connectionString) {
      return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    },
  });
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
