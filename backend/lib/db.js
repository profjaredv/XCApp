const { PrismaClient } = require('@prisma/client');

// Reuse a single PrismaClient across hot reloads / module re-requires
// instead of opening a new connection pool per require() call.
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

module.exports = prisma;
