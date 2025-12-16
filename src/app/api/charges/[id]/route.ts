import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chargeSchema } from "@/lib/validations";

// GET - Récupérer une charge spécifique
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const charge = await prisma.charge.findUnique({
      where: { id: params.id },
      include: { category: true },
    });

    if (!charge) {
      return NextResponse.json({ error: "Charge non trouvée" }, { status: 404 });
    }

    if (charge.userId !== session.user.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    return NextResponse.json(charge);
  } catch (error) {
    console.error("Error fetching charge:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération de la charge" },
      { status: 500 }
    );
  }
}

// PUT - Modifier une charge
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

    // Vérifier que la charge existe et appartient à l'utilisateur
    const existingCharge = await prisma.charge.findUnique({
      where: { id: params.id },
    });

    if (!existingCharge) {
      return NextResponse.json({ error: "Charge non trouvée" }, { status: 404 });
    }

    if (existingCharge.userId !== session.user.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = chargeSchema.parse(body);

    const charge = await prisma.charge.update({
      where: { id: params.id },
      data: validatedData,
      include: { category: true },
    });

    // Journal d'audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "UPDATE",
        entity: "charge",
        entityId: charge.id,
        details: JSON.stringify({ amount: charge.amount, categoryId: charge.categoryId }),
      },
    });

    return NextResponse.json(charge);
  } catch (error) {
    console.error("Error updating charge:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Erreur lors de la modification de la charge" },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer une charge
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

    // Vérifier que la charge existe et appartient à l'utilisateur
    const existingCharge = await prisma.charge.findUnique({
      where: { id: params.id },
    });

    if (!existingCharge) {
      return NextResponse.json({ error: "Charge non trouvée" }, { status: 404 });
    }

    if (existingCharge.userId !== session.user.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    await prisma.charge.delete({
      where: { id: params.id },
    });

    // Journal d'audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "DELETE",
        entity: "charge",
        entityId: params.id,
        details: JSON.stringify({ deletedAt: new Date().toISOString() }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting charge:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression de la charge" },
      { status: 500 }
    );
  }
}
