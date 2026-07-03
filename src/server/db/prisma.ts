import { PrismaClient } from "@prisma/client";

/**
 * Normalize the injected DATABASE_URL for the node-postgres/Prisma driver.
 * Prisma accepts the standard postgresql:// scheme as-is, so this is a light
 * pass-through kept for parity with the platform contract.
 */
function normalizeDatabaseUrl(url: string | undefined): string | undefined {
  return url;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: normalizeDatabaseUrl(process.env.DATABASE_URL),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
