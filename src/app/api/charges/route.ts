import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chargeSchema, chargeFilterSchema } from "@/lib/validations";

// GET - Récupérer toutes les charges avec filtres
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const filters = chargeFilterSchema.parse({
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      categoryId: searchParams.get("categoryId") || undefined,
      supplier: searchParams.get("supplier") || undefined,
    });

    const where = {
      userId: session.user.id,
      ...(filters.startDate && { date: { gte: filters.startDate } }),
      ...(filters.endDate && { date: { lte: filters.endDate } }),
      ...(filters.categoryId && { categoryId: filters.categoryId }),
      ...(filters.supplier && { supplier: { contains: filters.supplier } }),
    };

    const charges = await prisma.charge.findMany({
      where,
      include: { category: true },
      orderBy: { date: "desc" },
    });

    return NextResponse.json(charges);
  } catch (error) {
    console.error("Error fetching charges:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des charges" },
      { status: 500 }
    );
  }
}

// POST - Créer une nouvelle charge
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Vérifier le rôle
    if (session.user.role === "TECH") {
      return NextResponse.json({ error: "Accès en lecture seule" }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = chargeSchema.parse(body);

    const charge = await prisma.charge.create({
      data: {
        ...validatedData,
        userId: session.user.id,
      },
      include: { category: true },
    });

    // Journal d'audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CREATE",
        entity: "charge",
        entityId: charge.id,
        details: JSON.stringify({ amount: charge.amount, categoryId: charge.categoryId }),
      },
    });

    return NextResponse.json(charge, { status: 201 });
  } catch (error) {
    console.error("Error creating charge:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Erreur lors de la création de la charge" },
      { status: 500 }
    );
  }
}
