import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getChargesByUser, createCharge, getAllCategories } from "@/lib/db";
import { chargeSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const categoryId = searchParams.get("categoryId");
    const supplier = searchParams.get("supplier");

    let charges = await getChargesByUser(session.user.id);

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
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorise - reconnectez-vous" }, { status: 401 });
    }

    if (session.user.role === "TECH") {
      return NextResponse.json({ error: "Acces en lecture seule" }, { status: 403 });
    }

    const body = await request.json();
    const result = chargeSchema.safeParse(body);

    if (!result.success) {
      const errorMsg = result.error.errors.map(e => e.message).join(", ");
      console.error("Validation error:", errorMsg);
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    const validatedData = result.data;

    const charge = await createCharge({
      userId: session.user.id,
      date: validatedData.date.toISOString(),
      amount: validatedData.amount,
      categoryId: validatedData.categoryId,
      supplier: validatedData.supplier,
      paymentMethod: validatedData.paymentMethod,
      isRecurring: validatedData.isRecurring || false,
      recurrence: validatedData.recurrence || null,
      note: validatedData.note,
    });

    const categories = await getAllCategories();
    const category = categories.find(c => c.id === charge.categoryId);

    return NextResponse.json({ ...charge, category }, { status: 201 });
  } catch (error) {
    console.error("Error creating charge:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
