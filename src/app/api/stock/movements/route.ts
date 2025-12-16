import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stockMovementSchema } from "@/lib/validations";

// POST - Créer un mouvement de stock
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    if (session.user.role === "TECH") {
      return NextResponse.json({ error: "Accès en lecture seule" }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = stockMovementSchema.parse(body);

    // Vérifier que l'article existe et appartient à l'utilisateur
    const item = await prisma.stockItem.findUnique({
      where: { id: validatedData.itemId },
    });

    if (!item) {
      return NextResponse.json({ error: "Article non trouvé" }, { status: 404 });
    }

    if (item.userId !== session.user.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    // Vérifier qu'on ne sort pas plus que le stock disponible
    if (validatedData.type === "OUT" && item.quantity < validatedData.quantity) {
      return NextResponse.json(
        { error: "Stock insuffisant" },
        { status: 400 }
      );
    }

    // Créer le mouvement et mettre à jour la quantité
    const [movement] = await prisma.$transaction([
      prisma.stockMovement.create({
        data: {
          userId: session.user.id,
          itemId: validatedData.itemId,
          type: validatedData.type,
          quantity: validatedData.quantity,
          date: validatedData.date,
          comment: validatedData.comment,
        },
        include: { item: true },
      }),
      prisma.stockItem.update({
        where: { id: validatedData.itemId },
        data: {
          quantity:
            validatedData.type === "IN"
              ? { increment: validatedData.quantity }
              : { decrement: validatedData.quantity },
        },
      }),
    ]);

    // Journal d'audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CREATE",
        entity: "stock_movement",
        entityId: movement.id,
        details: JSON.stringify({
          type: movement.type,
          quantity: movement.quantity,
          itemId: movement.itemId,
        }),
      },
    });

    // Récupérer l'article mis à jour
    const updatedItem = await prisma.stockItem.findUnique({
      where: { id: validatedData.itemId },
      include: { category: true },
    });

    return NextResponse.json({ movement, item: updatedItem }, { status: 201 });
  } catch (error) {
    console.error("Error creating stock movement:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Erreur lors de la création du mouvement" },
      { status: 500 }
    );
  }
}
