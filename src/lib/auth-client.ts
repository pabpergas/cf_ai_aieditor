import { createAuthClient } from "better-auth/react";

/**
 * Auth client for React components
 * This provides hooks and utilities for authentication
 */
export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "",
});

/**
 * Export hooks for use in components
 */
export const { useSession, signIn, signOut } = authClient;
