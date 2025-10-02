import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";

export function createAuth(db: D1Database) {
  const drizzleDb = drizzle(db, { schema });

  return betterAuth({
    database: drizzleAdapter(drizzleDb, {
      provider: "sqlite",
    }),
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID as string,
        clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      },
    },
    secret: process.env.BETTER_AUTH_SECRET as string,
  });
}
