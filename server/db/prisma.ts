import 'server-only';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { flinkoutPrisma?: PrismaClient };

export const prisma = globalForPrisma.flinkoutPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.flinkoutPrisma = prisma;
