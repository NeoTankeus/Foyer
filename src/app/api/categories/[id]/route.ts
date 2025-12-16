import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE - Supprimer une catégorie
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

    // Vérifier que la catégorie existe
    const category = await prisma.chargeCategory.findUnique({
      where: { id: params.id },
      include: { _count: { select: { charges: true } } },
    });

    if (!category) {
      return NextResponse.json({ error: "Catégorie non trouvée" }, { status: 404 });
    }

    // Vérifier si c'est une catégorie système
    if (category.isDefault) {
      return NextResponse.json(
        { error: "Impossible de supprimer une catégorie système" },
        { status: 400 }
      );
    }

    // Vérifier si des charges utilisent cette catégorie
    if (category._count.charges > 0) {
      return NextResponse.json(
        { error: `Cette catégorie est utilisée par ${category._count.charges} charge(s)` },
        { status: 400 }
      );
    }

    await prisma.chargeCategory.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting category:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression de la catégorie" },
      { status: 500 }
    );
  }
}
