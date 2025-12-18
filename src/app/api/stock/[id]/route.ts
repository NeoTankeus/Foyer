import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStockByUser, updateStockItem, deleteStockItem } from "@/lib/db";
import { stockItemSchema } from "@/lib/validations";

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
    const items = getStockByUser(session.user.id);
    const item = items.find((i) => i.id === id);

    if (!item) {
      return NextResponse.json({ error: "Article non trouve" }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error("Error fetching stock item:", error);
    return NextResponse.json({ error: "Erreur lors de la recuperation de l'article" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }

    if (session.user.role === "TECH") {
      return NextResponse.json({ error: "Acces en lecture seule" }, { status: 403 });
    }

    const { id } = await context.params;
    const items = getStockByUser(session.user.id);
    const existingItem = items.find((i) => i.id === id);

    if (!existingItem) {
      return NextResponse.json({ error: "Article non trouve" }, { status: 404 });
    }

    const body = await request.json();
    const validatedData = stockItemSchema.parse(body);

    const item = updateStockItem(id, {
      name: validatedData.name,
      sku: validatedData.sku || null,
      categoryId: validatedData.categoryId || null,
      alertThreshold: validatedData.alertThreshold || null,
      purchasePrice: validatedData.purchasePrice || null,
      location: validatedData.location || null,
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error("Error updating stock item:", error);
    return NextResponse.json({ error: "Erreur lors de la modification de l'article" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }

    if (session.user.role === "TECH") {
      return NextResponse.json({ error: "Acces en lecture seule" }, { status: 403 });
    }

    const { id } = await context.params;
    const items = getStockByUser(session.user.id);
    const existingItem = items.find((i) => i.id === id);

    if (!existingItem) {
      return NextResponse.json({ error: "Article non trouve" }, { status: 404 });
    }

    deleteStockItem(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting stock item:", error);
    return NextResponse.json({ error: "Erreur lors de la suppression de l'article" }, { status: 500 });
  }
}
