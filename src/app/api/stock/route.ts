import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStockByUser, createStockItem, getStockCategories } from "@/lib/db";
import { stockItemSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const categoryId = searchParams.get("categoryId");
    const alertsOnly = searchParams.get("alertsOnly") === "true";

    let items = await getStockByUser(session.user.id);

    if (categoryId) {
      items = items.filter((i) => i.categoryId === categoryId);
    }
    if (alertsOnly) {
      items = items.filter((i) => i.alertThreshold !== null && i.quantity <= i.alertThreshold);
    }

    return NextResponse.json(items);
  } catch (error) {
    console.error("Error fetching stock items:", error);
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
    const result = stockItemSchema.safeParse(body);

    if (!result.success) {
      const errorMsg = result.error.errors.map(e => e.message).join(", ");
      console.error("Validation error:", errorMsg);
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    const validatedData = result.data;

    const item = await createStockItem({
      userId: session.user.id,
      name: validatedData.name,
      sku: validatedData.sku,
      categoryId: validatedData.categoryId,
      quantity: validatedData.quantity || 0,
      alertThreshold: validatedData.alertThreshold || null,
      purchasePrice: validatedData.purchasePrice || null,
      location: validatedData.location,
    });

    // Get category for response
    const categories = await getStockCategories();
    const category = categories.find(c => c.id === item.categoryId) || null;

    return NextResponse.json({ ...item, category }, { status: 201 });
  } catch (error) {
    console.error("Error creating stock item:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
