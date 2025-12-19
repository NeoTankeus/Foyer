import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { getStockByUser, getStockCategories, getUserSettings } from "@/lib/db";
import { StockClient } from "@/components/stock/stock-client";
import { Loader2 } from "lucide-react";

async function getStockData(userId: string) {
  const items = await getStockByUser(userId);
  const categories = await getStockCategories();
  const settings = await getUserSettings(userId);

  return { items, categories, settings };
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-96">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default async function StockPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const data = await getStockData(session.user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stock</h1>
        <p className="text-muted-foreground">Gérez votre inventaire et vos mouvements de stock</p>
      </div>

      <Suspense fallback={<LoadingState />}>
        <StockClient
          initialItems={data.items}
          categories={data.categories}
          currency={data.settings?.currency || "EUR"}
          isReadOnly={session.user.role === "TECH"}
        />
      </Suspense>
    </div>
  );
}
