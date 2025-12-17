import { cookies } from "next/headers";
import { findUserByEmail, verifyPassword, findUserById } from "./db";

const SESSION_COOKIE = "app_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

// Simple encoding for session data (userId)
function encodeSession(userId: string): string {
  const data = JSON.stringify({ userId, exp: Date.now() + SESSION_MAX_AGE * 1000 });
  return Buffer.from(data).toString("base64");
}

function decodeSession(token: string): { userId: string; exp: number } | null {
  try {
    const data = Buffer.from(token, "base64").toString("utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function signIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  const user = findUserByEmail(email);

  if (!user) {
    return { success: false, error: "Identifiant ou mot de passe incorrect" };
  }

  if (!verifyPassword(user, password)) {
    return { success: false, error: "Identifiant ou mot de passe incorrect" };
  }

  const token = encodeSession(user.id);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: false, // Allow HTTP for development
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  return { success: true };
}

export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<{ user: { id: string; email: string; name: string | null; role: string } } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const session = decodeSession(token);

  if (!session) {
    return null;
  }

  if (session.exp < Date.now()) {
    return null;
  }

  const user = findUserById(session.userId);

  if (!user) {
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
