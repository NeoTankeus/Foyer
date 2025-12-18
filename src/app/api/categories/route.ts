import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAllCategories, createCategory } from "@/lib/db";
import { chargeCategorySchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }

    const categories = await getAllCategories();
    return NextResponse.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }

    if (session.user.role === "TECH") {
      return NextResponse.json({ error: "Acces en lecture seule" }, { status: 403 });
    }

    const body = await request.json();
    const result = chargeCategorySchema.safeParse(body);

    if (!result.success) {
      const errorMsg = result.error.errors.map(e => e.message).join(", ");
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    const validatedData = result.data;

    const allCategories = await getAllCategories();
    const existing = allCategories.find((c) => c.name.toLowerCase() === validatedData.name.toLowerCase());
    if (existing) {
      return NextResponse.json({ error: "Cette categorie existe deja" }, { status: 400 });
    }

    const category = await createCategory(validatedData.name, validatedData.color);
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error("Error creating category:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
