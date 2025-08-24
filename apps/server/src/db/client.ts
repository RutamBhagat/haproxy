import { Kysely, PostgresDialect } from "kysely";

import type { DB } from "./types";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

pool.on("error", (err, client) => {
  console.error("Unexpected error on idle client:", err.message);
});

pool.on("connect", (client) => {
  client.on("error", (err) => {
    console.error("Client error:", err.message);
  });
});

const dialect = new PostgresDialect({
  pool,
});

export const db = new Kysely<DB>({
  dialect,
});
