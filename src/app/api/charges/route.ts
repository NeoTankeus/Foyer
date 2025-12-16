import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getChargesByUser, createCharge } from "@/lib/db";
import { chargeSchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const categoryId = searchParams.get("categoryId");
    const supplier = searchParams.get("supplier");

    let charges = getChargesByUser(session.user.id);

    if (startDate) {
      charges = charges.filter((c) => new Date(c.date) >= new Date(startDate));
    }
    if (endDate) {
      charges = charges.filter((c) => new Date(c.date) <= new Date(endDate));
    }
    if (categoryId) {
      charges = charges.filter((c) => c.categoryId === categoryId);
    }
    if (supplier) {
      charges = charges.filter((c) => c.supplier?.toLowerCase().includes(supplier.toLowerCase()));
    }

    return NextResponse.json(charges);
  } catch (error) {
    console.error("Error fetching charges:", error);
    return NextResponse.json({ error: "Erreur lors de la récupération des charges" }, { status: 500 });
  }
}

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
    const validatedData = chargeSchema.parse(body);

    const charge = createCharge({
      userId: session.user.id,
      date: validatedData.date.toISOString(),
      amount: validatedData.amount,
      categoryId: validatedData.categoryId,
      supplier: validatedData.supplier || null,
      paymentMethod: validatedData.paymentMethod || null,
      isRecurring: validatedData.isRecurring || false,
      recurrence: validatedData.recurrence || null,
      note: validatedData.note || null,
    });

    return NextResponse.json(charge, { status: 201 });
  } catch (error) {
    console.error("Error creating charge:", error);
    return NextResponse.json({ error: "Erreur lors de la création de la charge" }, { status: 500 });
  }
}
