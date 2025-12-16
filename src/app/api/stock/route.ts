import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStockByUser, createStockItem } from "@/lib/db";
import { stockItemSchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const categoryId = searchParams.get("categoryId");
    const alertsOnly = searchParams.get("alertsOnly") === "true";

    let items = getStockByUser(session.user.id);

    if (categoryId) {
      items = items.filter((i) => i.categoryId === categoryId);
    }
    if (alertsOnly) {
      items = items.filter((i) => i.alertThreshold !== null && i.quantity <= i.alertThreshold);
    }

    return NextResponse.json(items);
  } catch (error) {
    console.error("Error fetching stock items:", error);
    return NextResponse.json({ error: "Erreur lors de la récupération du stock" }, { status: 500 });
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
    const validatedData = stockItemSchema.parse(body);

    const item = createStockItem({
      userId: session.user.id,
      name: validatedData.name,
      sku: validatedData.sku || null,
      categoryId: validatedData.categoryId || null,
      quantity: validatedData.quantity || 0,
      alertThreshold: validatedData.alertThreshold || null,
      purchasePrice: validatedData.purchasePrice || null,
      location: validatedData.location || null,
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("Error creating stock item:", error);
    return NextResponse.json({ error: "Erreur lors de la création de l'article" }, { status: 500 });
  }
}
