import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAllCategories, createCategory } from "@/lib/db";
import { chargeCategorySchema } from "@/lib/validations";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const categories = getAllCategories();

    return NextResponse.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json({ error: "Erreur lors de la récupération des catégories" }, { status: 500 });
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
    const validatedData = chargeCategorySchema.parse(body);

    const existing = getAllCategories().find((c) => c.name === validatedData.name);
    if (existing) {
      return NextResponse.json({ error: "Cette catégorie existe déjà" }, { status: 400 });
    }

    const category = createCategory(validatedData.name, validatedData.color);

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error("Error creating category:", error);
    return NextResponse.json({ error: "Erreur lors de la création de la catégorie" }, { status: 500 });
  }
}
