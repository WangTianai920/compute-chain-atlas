import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Use npm run dev:local for an isolated development database, or configure the DB binding in the deployment environment."
    );
  }

  return drizzle(env.DB, { schema });
}

export function getD1(): D1Database {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}
