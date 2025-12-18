import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getChargesByUser, updateCharge, deleteCharge, getAllCategories } from "@/lib/db";
import { chargeSchema } from "@/lib/validations";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }

    const { id } = await context.params;
    const charges = getChargesByUser(session.user.id);
    const charge = charges.find((c) => c.id === id);

    if (!charge) {
      return NextResponse.json({ error: "Charge non trouvee" }, { status: 404 });
    }

    return NextResponse.json(charge);
  } catch (error) {
    console.error("Error fetching charge:", error);
    return NextResponse.json({ error: "Erreur lors de la recuperation de la charge" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Session expiree - reconnectez-vous" }, { status: 401 });
    }

    if (session.user.role === "TECH") {
      return NextResponse.json({ error: "Acces en lecture seule" }, { status: 403 });
    }

    const params = await context.params;
    const id = params.id;

    if (!id) {
      return NextResponse.json({ error: "ID manquant" }, { status: 400 });
    }

    const charges = getChargesByUser(session.user.id);
    const existingCharge = charges.find((c) => c.id === id);

    if (!existingCharge) {
      return NextResponse.json({ error: "Charge non trouvee" }, { status: 404 });
    }

    const body = await request.json();
    const result = chargeSchema.safeParse(body);

    if (!result.success) {
      const errorMsg = result.error.errors.map(e => e.message).join(", ");
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    const validatedData = result.data;

    const charge = updateCharge(id, {
      date: validatedData.date.toISOString(),
      amount: validatedData.amount,
      categoryId: validatedData.categoryId,
      supplier: validatedData.supplier,
      paymentMethod: validatedData.paymentMethod,
      isRecurring: validatedData.isRecurring || false,
      recurrence: validatedData.recurrence || null,
      note: validatedData.note,
    });

    const categories = getAllCategories();
    const category = categories.find(c => c.id === charge?.categoryId);

    return NextResponse.json({ ...charge, category });
  } catch (error) {
    console.error("PUT charge error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Session expiree - reconnectez-vous" }, { status: 401 });
    }

    if (session.user.role === "TECH") {
      return NextResponse.json({ error: "Acces en lecture seule" }, { status: 403 });
    }

    const params = await context.params;
    const id = params.id;

    if (!id) {
      return NextResponse.json({ error: "ID manquant" }, { status: 400 });
    }

    const charges = getChargesByUser(session.user.id);
    const existingCharge = charges.find((c) => c.id === id);

    if (!existingCharge) {
      return NextResponse.json({ error: "Charge non trouvee" }, { status: 404 });
    }

    deleteCharge(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE charge error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
