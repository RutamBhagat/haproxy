import { Kysely, PostgresDialect } from "kysely";

import type { DB } from "./types";
import { Pool } from "pg";

let instance: Kysely<DB> | null = null;
let pool: Pool | null = null;

function createPool(): Pool {
  const newPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    allowExitOnIdle: false,
  });
  return newPool;
}

function getDb(): Kysely<DB> {
  try {
    if (!instance || !pool) {
      console.log("Initializing database client...");
      
      if (pool) {
        pool.removeAllListeners();
      }
      
      pool = createPool();
      
      const dialect = new PostgresDialect({
        pool,
      });

      instance = new Kysely<DB>({
        dialect,
      });

      console.log("Database client initialized");
    }

    return instance;
  } catch (error) {
    console.error("Failed to initialize database client:", error);
    throw error;
  }
}

async function destroyDatabaseClient(): Promise<void> {
  if (instance) {
    try {
      await instance.destroy();
      instance = null;
      console.log("Database client destroyed");
    } catch (error) {
      console.error("Error destroying database client:", error);
    }
  }
  
  if (pool) {
    try {
      pool.removeAllListeners();
      await pool.end();
      pool = null;
      console.log("Database pool destroyed");
    } catch (error) {
      console.error("Error destroying database pool:", error);
    }
  }
}

export { getDb as db, destroyDatabaseClient };
