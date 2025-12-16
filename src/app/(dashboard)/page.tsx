import { auth } from "@/lib/auth";
import { getChargesByUser, getStockByUser, getAllCategories, getUserSettings } from "@/lib/db";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import { DashboardStats } from "@/components/charges/dashboard-stats";
import { MonthlyChart } from "@/components/charts/monthly-chart";
import { CategoryPieChart } from "@/components/charts/category-pie-chart";
import { CumulativeChart } from "@/components/charts/cumulative-chart";
import { StockAlerts } from "@/components/stock/stock-alerts";
import { calculateVariation } from "@/lib/utils";

function getDashboardData(userId: string) {
  const now = new Date();
  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfMonth(now);
  const previousMonthStart = startOfMonth(subMonths(now, 1));
  const previousMonthEnd = endOfMonth(subMonths(now, 1));

  const allCharges = getChargesByUser(userId);
  const categories = getAllCategories();
  const settings = getUserSettings(userId);
  const stockItems = getStockByUser(userId);

  // Charges du mois courant
  const currentMonthCharges = allCharges.filter((c) => {
    const d = new Date(c.date);
    return d >= currentMonthStart && d <= currentMonthEnd;
  });
  const currentTotal = currentMonthCharges.reduce((sum, c) => sum + c.amount, 0);

  // Charges du mois précédent
  const previousMonthCharges = allCharges.filter((c) => {
    const d = new Date(c.date);
    return d >= previousMonthStart && d <= previousMonthEnd;
  });
  const previousTotal = previousMonthCharges.reduce((sum, c) => sum + c.amount, 0);

  // Top 5 catégories du mois courant
  const categoryTotals = new Map<string, number>();
  currentMonthCharges.forEach((c) => {
    categoryTotals.set(c.categoryId, (categoryTotals.get(c.categoryId) || 0) + c.amount);
  });

  const topCategoriesWithDetails = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([categoryId, total]) => {
      const cat = categories.find((c) => c.id === categoryId);
      return {
        categoryId,
        categoryName: cat?.name || "Inconnu",
        categoryColor: cat?.color || "#6366f1",
        total,
        percentage: currentTotal > 0 ? (total / currentTotal) * 100 : 0,
      };
    });

  // Charges récurrentes
  const upcomingRecurring = allCharges
    .filter((c) => c.isRecurring)
    .slice(0, 5)
    .map((c) => ({ ...c, category: c.category }));

  // Données pour graphiques - 12 derniers mois
  const monthlyData = [];
  for (let i = 11; i >= 0; i--) {
    const monthStart = startOfMonth(subMonths(now, i));
    const monthEnd = endOfMonth(subMonths(now, i));
    const monthCharges = allCharges.filter((c) => {
      const d = new Date(c.date);
      return d >= monthStart && d <= monthEnd;
    });
    monthlyData.push({
      month: format(monthStart, "MMM yy"),
      total: monthCharges.reduce((sum, c) => sum + c.amount, 0),
    });
  }

  // Données cumulées du mois courant
  const dailyMap = new Map<string, number>();
  currentMonthCharges
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .forEach((charge) => {
      const dateKey = format(new Date(charge.date), "dd/MM");
      dailyMap.set(dateKey, (dailyMap.get(dateKey) || 0) + charge.amount);
    });

  let cumulative = 0;
  const cumulativeData = Array.from(dailyMap.entries()).map(([date, daily]) => {
    cumulative += daily;
    return { date, daily, cumulative };
  });

  // Alertes stock
  const stockAlerts = stockItems
    .filter((item) => item.alertThreshold !== null && item.quantity <= item.alertThreshold)
    .slice(0, 5)
    .map((item) => ({
      item,
      currentQuantity: item.quantity,
      threshold: item.alertThreshold!,
    }));

  return {
    stats: {
      currentMonthTotal: currentTotal,
      previousMonthTotal: previousTotal,
      variation: calculateVariation(currentTotal, previousTotal),
      topCategories: topCategoriesWithDetails,
      upcomingRecurring,
      budgetAlert: settings?.monthlyBudget ? currentTotal > settings.monthlyBudget : false,
      monthlyBudget: settings?.monthlyBudget || null,
    },
    monthlyData,
    categoryData: topCategoriesWithDetails.map((c) => ({
      name: c.categoryName,
      value: c.total,
      color: c.categoryColor,
    })),
    cumulativeData,
    stockAlerts,
    settings,
  };
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const data = getDashboardData(session.user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Vue d&apos;ensemble de votre activité</p>
      </div>

      <DashboardStats stats={data.stats} currency={data.settings?.currency || "EUR"} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MonthlyChart data={data.monthlyData} />
        <CategoryPieChart data={data.categoryData} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CumulativeChart data={data.cumulativeData} />
        <StockAlerts alerts={data.stockAlerts} />
      </div>
    </div>
  );
}
