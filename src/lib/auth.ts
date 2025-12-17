import { cookies } from "next/headers";
import { findUserByEmail, verifyPassword, findUserById } from "./db";

const SESSION_COOKIE = "session_token";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function generateSessionToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// In-memory session store (simple for demo)
const sessions = new Map<string, { userId: string; expiresAt: number }>();

export async function signIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  const user = findUserByEmail(email);

  if (!user) {
    return { success: false, error: "Identifiant ou mot de passe incorrect" };
  }

  if (!verifyPassword(user, password)) {
    return { success: false, error: "Identifiant ou mot de passe incorrect" };
  }

  const token = generateSessionToken();
  const expiresAt = Date.now() + SESSION_MAX_AGE * 1000;

  sessions.set(token, { userId: user.id, expiresAt });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  return { success: true };
}

export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    sessions.delete(token);
  }

  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<{ user: { id: string; email: string; name: string | null; role: string } } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const session = sessions.get(token);

  if (!session) {
    return null;
  }

  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }

  const user = findUserById(session.userId);

  if (!user) {
    sessions.delete(token);
    return null;
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
}

export async function auth() {
  return getSession();
}
