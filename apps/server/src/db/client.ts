import { Kysely, PostgresDialect } from "kysely";

import type { DB } from "./types";
import { Pool } from "pg";

let instance: Kysely<DB> | null = null;

function getInstance(): Kysely<DB> {
  if (!instance) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on("error", (err) => {
      console.error("Database pool error:", err);
    });

    const dialect = new PostgresDialect({
      pool,
    });

    instance = new Kysely<DB>({
      dialect,
    });

    console.log("Database client initialized");
  }

  return instance;
}

async function destroyDatabaseClient(): Promise<void> {
  if (instance) {
    await instance.destroy();
    instance = null;
    console.log("Database client destroyed");
  }
}

export const db = getInstance();
export { destroyDatabaseClient };
