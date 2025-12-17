import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStockByUser, addStockMovement } from "@/lib/db";
import { stockMovementSchema } from "@/lib/validations";

export const runtime = "nodejs";

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

    const items = getStockByUser(session.user.id);
    const item = items.find((i) => i.id === validatedData.itemId);

    if (!item) {
      return NextResponse.json({ error: "Article non trouvé" }, { status: 404 });
    }

    if (validatedData.type === "OUT" && item.quantity < validatedData.quantity) {
      return NextResponse.json({ error: "Stock insuffisant" }, { status: 400 });
    }

    const updatedItem = addStockMovement(
      validatedData.itemId,
      session.user.id,
      validatedData.type as "IN" | "OUT",
      validatedData.quantity,
      validatedData.comment || null
    );

    return NextResponse.json({ item: updatedItem }, { status: 201 });
  } catch (error) {
    console.error("Error creating stock movement:", error);
    return NextResponse.json({ error: "Erreur lors de la création du mouvement" }, { status: 500 });
  }
}
