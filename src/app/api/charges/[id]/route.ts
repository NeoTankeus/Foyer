import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getChargesByUser, updateCharge, deleteCharge, getAllCategories } from "@/lib/db";
import { chargeSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const charges = getChargesByUser(session.user.id);
    const charge = charges.find((c) => c.id === params.id);

    if (!charge) {
      return NextResponse.json({ error: "Charge non trouvée" }, { status: 404 });
    }

    return NextResponse.json(charge);
  } catch (error) {
    console.error("Error fetching charge:", error);
    return NextResponse.json({ error: "Erreur lors de la récupération de la charge" }, { status: 500 });
  }
}

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

    const charges = getChargesByUser(session.user.id);
    const existingCharge = charges.find((c) => c.id === params.id);

    if (!existingCharge) {
      return NextResponse.json({ error: "Charge non trouvée" }, { status: 404 });
    }

    const body = await request.json();
    const validatedData = chargeSchema.parse(body);

    const charge = updateCharge(params.id, {
      date: validatedData.date.toISOString(),
      amount: validatedData.amount,
      categoryId: validatedData.categoryId,
      supplier: validatedData.supplier || null,
      paymentMethod: validatedData.paymentMethod || null,
      isRecurring: validatedData.isRecurring || false,
      recurrence: validatedData.recurrence || null,
      note: validatedData.note || null,
    });

    // Get category for response
    const categories = getAllCategories();
    const category = categories.find(c => c.id === charge?.categoryId);

    return NextResponse.json({ ...charge, category });
  } catch (error) {
    console.error("Error updating charge:", error);
    return NextResponse.json({ error: "Erreur lors de la modification de la charge" }, { status: 500 });
  }
}

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

    const charges = getChargesByUser(session.user.id);
    const existingCharge = charges.find((c) => c.id === params.id);

    if (!existingCharge) {
      return NextResponse.json({ error: "Charge non trouvée" }, { status: 404 });
    }

    deleteCharge(params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting charge:", error);
    return NextResponse.json({ error: "Erreur lors de la suppression de la charge" }, { status: 500 });
  }
}
