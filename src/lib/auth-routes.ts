import { createAuth } from "./auth";
import type { Env } from "../types";

/**
 * Handle authentication routes
 * All auth routes are handled by better-auth
 */
export async function handleAuthRoutes(
  request: Request,
  env: Env
): Promise<Response | null> {
  const url = new URL(request.url);

  // Check if this is an auth route
  if (url.pathname.startsWith("/api/auth")) {
    const auth = createAuth(env.DB);

    // better-auth handles all /api/auth/* routes
    return await auth.handler(request);
  }

  return null;
}

/**
 * Middleware to check if user is authenticated
 */
export async function requireAuth(
  request: Request,
  env: Env
): Promise<{ user: any; session: any } | Response> {
  const auth = createAuth(env.DB);

  try {
    // Get session from request
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    return session;
  } catch (error) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
}
