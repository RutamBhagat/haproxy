import { Kysely, PostgresDialect } from "kysely";

import type { DB } from "./types";
import { Pool } from "pg";
import type { PoolClient } from "pg";

class ResilientPool extends Pool {
  connect(): Promise<PoolClient>;
  connect(
    callback: (
      err: Error | undefined,
      client: PoolClient | undefined,
      done: (release?: any) => void
    ) => void
  ): void;
  connect(
    callback?: (
      err: Error | undefined,
      client: PoolClient | undefined,
      done: (release?: any) => void
    ) => void
  ): Promise<PoolClient> | void {
    if (callback) {
      return super.connect((err, client, done) => {
        if (err || !client) {
          return callback(err, client, done);
        }
        const wrappedClient = this.wrapClient(client);
        callback(err, wrappedClient, done);
      });
    } else {
      return super.connect().then((client) => this.wrapClient(client));
    }
  }

  private wrapClient(client: PoolClient): PoolClient {
    const originalQuery = client.query.bind(client);

    const wrappedQuery = async (
      text: any,
      values?: any,
      callback?: any
    ): Promise<any> => {
      try {
        if (callback) {
          return originalQuery(
            text,
            values,
            (err: Error | null, result: any) => {
              if (err) {
                const pgError = err as { code?: string; message?: string };
                if (pgError.code === "ECONNRESET" || pgError.code === "57P01") {
                  console.error(
                    "Connection lost during query:",
                    pgError.message || "Unknown error"
                  );
                  client.release(true);
                }
              }
              callback(err, result);
            }
          );
        } else {
          return await originalQuery(text, values);
        }
      } catch (error) {
        const pgError = error as { code?: string; message?: string };
        if (pgError.code === "ECONNRESET" || pgError.code === "57P01") {
          console.error(
            "Connection lost during query:",
            pgError.message || "Unknown error"
          );
          client.release(true);
          throw error;
        }
        throw error;
      }
    };

    client.query = wrappedQuery as any;

    client.on("error", (err: Error) => {
      console.error("Client connection error:", err.message);
    });

    return client;
  }
}

const pool = new ResilientPool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("Idle client error:", err.message);
});

const dialect = new PostgresDialect({
  pool,
});

export const db = new Kysely<DB>({
  dialect,
});
