import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAllCategories, deleteCategory, getChargesByUser } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    if (session.user.role === "TECH") {
      return NextResponse.json({ error: "Accès en lecture seule" }, { status: 403 });
    }

    const category = getAllCategories().find((c) => c.id === params.id);

    if (!category) {
      return NextResponse.json({ error: "Catégorie non trouvée" }, { status: 404 });
    }

    // Vérifier si des charges utilisent cette catégorie
    const charges = getChargesByUser(session.user.id);
    const chargesUsingCategory = charges.filter((c) => c.categoryId === params.id);

    if (chargesUsingCategory.length > 0) {
      return NextResponse.json(
        { error: `Cette catégorie est utilisée par ${chargesUsingCategory.length} charge(s)` },
        { status: 400 }
      );
    }

    deleteCategory(params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting category:", error);
    return NextResponse.json({ error: "Erreur lors de la suppression de la catégorie" }, { status: 500 });
  }
}
