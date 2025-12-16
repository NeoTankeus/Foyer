import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StockClient } from "@/components/stock/stock-client";
import { Loader2 } from "lucide-react";

async function getStockData(userId: string) {
  const [items, categories, settings] = await Promise.all([
    prisma.stockItem.findMany({
      where: { userId },
      include: { category: true },
      orderBy: { name: "asc" },
    }),
    prisma.stockCategory.findMany({
      orderBy: { name: "asc" },
    }),
    prisma.userSettings.findUnique({
      where: { userId },
    }),
  ]);

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
