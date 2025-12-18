import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAllCategories, deleteCategory, getChargesByUser } from "@/lib/db";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }

    if (session.user.role === "TECH") {
      return NextResponse.json({ error: "Acces en lecture seule" }, { status: 403 });
    }

    const { id } = await context.params;
    const category = getAllCategories().find((c) => c.id === id);

    if (!category) {
      return NextResponse.json({ error: "Categorie non trouvee" }, { status: 404 });
    }

    const charges = getChargesByUser(session.user.id);
    const chargesUsingCategory = charges.filter((c) => c.categoryId === id);

    if (chargesUsingCategory.length > 0) {
      return NextResponse.json(
        { error: "Cette categorie est utilisee par " + chargesUsingCategory.length + " charge(s)" },
        { status: 400 }
      );
    }

    deleteCategory(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting category:", error);
    return NextResponse.json({ error: "Erreur lors de la suppression de la categorie" }, { status: 500 });
  }
}
