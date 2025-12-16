import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stockItemSchema } from "@/lib/validations";

// GET - Récupérer tous les articles de stock
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const categoryId = searchParams.get("categoryId");
    const alertsOnly = searchParams.get("alertsOnly") === "true";

    const items = await prisma.stockItem.findMany({
      where: {
        userId: session.user.id,
        ...(categoryId && { categoryId }),
        ...(alertsOnly && {
          alertThreshold: { not: null },
          quantity: { lte: prisma.stockItem.fields.alertThreshold },
        }),
      },
      include: { category: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error("Error fetching stock items:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération du stock" },
      { status: 500 }
    );
  }
}

// POST - Créer un nouvel article
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
    const validatedData = stockItemSchema.parse(body);

    const item = await prisma.stockItem.create({
      data: {
        ...validatedData,
        userId: session.user.id,
      },
      include: { category: true },
    });

    // Créer un mouvement initial si quantité > 0
    if (validatedData.quantity > 0) {
      await prisma.stockMovement.create({
        data: {
          userId: session.user.id,
          itemId: item.id,
          type: "IN",
          quantity: validatedData.quantity,
          comment: "Stock initial",
        },
      });
    }

    // Journal d'audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CREATE",
        entity: "stock_item",
        entityId: item.id,
        details: JSON.stringify({ name: item.name, quantity: item.quantity }),
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("Error creating stock item:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Erreur lors de la création de l'article" },
      { status: 500 }
    );
  }
}
