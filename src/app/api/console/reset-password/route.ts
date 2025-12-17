import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { findUserById, updateUserPassword } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const { userId, newPassword } = await request.json();

    if (!userId || !newPassword) {
      return NextResponse.json({ error: "ID utilisateur et mot de passe requis" }, { status: 400 });
    }

    const user = findUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    updateUserPassword(userId, newPassword);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error resetting password:", error);
    return NextResponse.json({ error: "Erreur lors de la réinitialisation" }, { status: 500 });
  }
}
