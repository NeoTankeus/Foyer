import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { findUserById, deleteUser } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();

    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    if (params.id === session.user.id) {
      return NextResponse.json({ error: "Impossible de supprimer votre propre compte" }, { status: 400 });
    }

    const user = findUserById(params.id);

    if (!user) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    deleteUser(params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json({ error: "Erreur lors de la suppression de l'utilisateur" }, { status: 500 });
  }
}
