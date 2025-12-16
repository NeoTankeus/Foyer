import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stockItemSchema } from "@/lib/validations";

// GET - Récupérer un article avec ses mouvements
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const item = await prisma.stockItem.findUnique({
      where: { id: params.id },
      include: {
        category: true,
        movements: {
          orderBy: { date: "desc" },
          take: 50,
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Article non trouvé" }, { status: 404 });
    }

    if (item.userId !== session.user.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error("Error fetching stock item:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération de l'article" },
      { status: 500 }
    );
  }
}

// PUT - Modifier un article
export async function PUT(
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

    const existingItem = await prisma.stockItem.findUnique({
      where: { id: params.id },
    });

    if (!existingItem) {
      return NextResponse.json({ error: "Article non trouvé" }, { status: 404 });
    }

    if (existingItem.userId !== session.user.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = stockItemSchema.parse(body);

    // Note: on ne modifie pas la quantité directement, elle se gère via les mouvements
    const item = await prisma.stockItem.update({
      where: { id: params.id },
      data: {
        name: validatedData.name,
        sku: validatedData.sku,
        categoryId: validatedData.categoryId,
        alertThreshold: validatedData.alertThreshold,
        purchasePrice: validatedData.purchasePrice,
        location: validatedData.location,
        note: validatedData.note,
      },
      include: { category: true },
    });

    // Journal d'audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "UPDATE",
        entity: "stock_item",
        entityId: item.id,
        details: JSON.stringify({ name: item.name }),
      },
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error("Error updating stock item:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Erreur lors de la modification de l'article" },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer un article
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

    const existingItem = await prisma.stockItem.findUnique({
      where: { id: params.id },
    });

    if (!existingItem) {
      return NextResponse.json({ error: "Article non trouvé" }, { status: 404 });
    }

    if (existingItem.userId !== session.user.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    await prisma.stockItem.delete({
      where: { id: params.id },
    });

    // Journal d'audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "DELETE",
        entity: "stock_item",
        entityId: params.id,
        details: JSON.stringify({ deletedAt: new Date().toISOString() }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting stock item:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression de l'article" },
      { status: 500 }
    );
  }
}
