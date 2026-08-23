import { getServerSession } from '@/lib/firebase/auth';

/**
 * Get the authenticated user from the current session.
 * Convenience wrapper for API routes that need auth context.
 */
export async function getAuth(_request?: unknown): Promise<{ uid: string; email?: string; role?: string } | null> {
  const session = await getServerSession();
  return session ? { uid: session.user.uid, email: session.user.email, role: session.user.role } : null;
}
