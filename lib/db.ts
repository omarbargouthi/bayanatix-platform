import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
}

if (!process.env.DATABASE_URL) {
  // Allow build-time without DB; runtime queries will throw.
  // The app is structured so any page using sql<T>`...` will fail loudly if DATABASE_URL is missing.
  if (process.env.NODE_ENV !== "production") {
    console.warn("[bayanatix] DATABASE_URL is not set — DB queries will fail at runtime.");
  }
}

export const sql =
  global.__sql ??
  postgres(process.env.DATABASE_URL ?? "postgres://invalid", {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: process.env.DATABASE_URL?.includes("sslmode=require") ? "require" : "prefer",
    types: {
      // Return Postgres bigint as JS number (safe for catalog row counts at our scale).
      bigint: postgres.BigInt,
    },
    transform: { undefined: null },
  });

if (process.env.NODE_ENV !== "production") global.__sql = sql;
