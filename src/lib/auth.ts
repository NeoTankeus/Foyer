import { cookies } from "next/headers";
import { findUserByEmail, verifyPassword, findUserById } from "./db";

const SESSION_COOKIE = "app_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function encodeSession(userId: string): string {
  const data = JSON.stringify({ userId, exp: Date.now() + SESSION_MAX_AGE * 1000 });
  return Buffer.from(data).toString("base64");
}

function decodeSession(token: string): { userId: string; exp: number } | null {
  try {
    // Handle URL-encoded tokens
    const decodedToken = decodeURIComponent(token);
    const data = Buffer.from(decodedToken, "base64").toString("utf-8");
    return JSON.parse(data);
  } catch {
    try {
      // Try without URL decoding
      const data = Buffer.from(token, "base64").toString("utf-8");
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
}

export async function signIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
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
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });

    return { success: true };
  } catch (error) {
    console.error("SignIn error:", error);
    return { success: false, error: "Erreur de connexion" };
  }
}

export async function signOut(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE);
  } catch (error) {
    console.error("SignOut error:", error);
  }
}

export async function getSession(): Promise<{ user: { id: string; email: string; name: string | null; role: string } } | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;

    if (!token) {
      console.log("No session token found");
      return null;
    }

    const session = decodeSession(token);

    if (!session) {
      console.log("Could not decode session");
      return null;
    }

    if (session.exp < Date.now()) {
      console.log("Session expired");
      return null;
    }

    const user = findUserById(session.userId);

    if (!user) {
      console.log("User not found:", session.userId);
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
  } catch (error) {
    console.error("GetSession error:", error);
    return null;
  }
}

export async function auth() {
  return getSession();
}
