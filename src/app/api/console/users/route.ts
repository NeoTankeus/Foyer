import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAllUsers, createUser, findUserByEmail } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const users = await getAllUsers();
    return NextResponse.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json({ error: "Erreur lors de la récupération des utilisateurs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const { email, name, password, role } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Identifiant et mot de passe requis" }, { status: 400 });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json({ error: "Cet identifiant existe déjà" }, { status: 400 });
    }

    const user = await createUser(email, password, name || null, role === "TECH" ? "TECH" : "ADMIN");
    const { password: _, ...userWithoutPassword } = user;

    return NextResponse.json(userWithoutPassword, { status: 201 });
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json({ error: "Erreur lors de la création de l'utilisateur" }, { status: 500 });
  }
}
