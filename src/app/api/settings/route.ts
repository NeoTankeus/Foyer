import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserSettings, updateUserSettings } from "@/lib/db";
import { userSettingsSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    let settings = await getUserSettings(session.user.id);

    if (!settings) {
      await updateUserSettings(session.user.id, { currency: "EUR" });
      settings = await getUserSettings(session.user.id);
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json({ error: "Erreur lors de la récupération des paramètres" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    if (session.user.role === "TECH") {
      return NextResponse.json({ error: "Accès en lecture seule" }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = userSettingsSchema.parse(body);

    await updateUserSettings(session.user.id, {
      currency: validatedData.currency,
      monthlyBudget: validatedData.monthlyBudget || null,
    });

    const settings = await getUserSettings(session.user.id);

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json({ error: "Erreur lors de la mise à jour des paramètres" }, { status: 500 });
  }
}
