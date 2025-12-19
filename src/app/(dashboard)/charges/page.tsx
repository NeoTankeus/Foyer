import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { getChargesByUser, getAllCategories, getUserSettings } from "@/lib/db";
import { ChargesClient } from "@/components/charges/charges-client";
import { Loader2 } from "lucide-react";

async function getChargesData(userId: string) {
  const charges = await getChargesByUser(userId);
  const categories = await getAllCategories();
  const settings = await getUserSettings(userId);

  return { charges, categories, settings };
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-96">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default async function ChargesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const data = await getChargesData(session.user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Charges</h1>
        <p className="text-muted-foreground">Gérez vos dépenses et suivez votre budget</p>
      </div>

      <Suspense fallback={<LoadingState />}>
        <ChargesClient
          initialCharges={data.charges}
          categories={data.categories}
          currency={data.settings?.currency || "EUR"}
          isReadOnly={session.user.role === "TECH"}
        />
      </Suspense>
    </div>
  );
}
