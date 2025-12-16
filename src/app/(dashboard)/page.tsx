import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import { DashboardStats } from "@/components/charges/dashboard-stats";
import { MonthlyChart } from "@/components/charts/monthly-chart";
import { CategoryPieChart } from "@/components/charts/category-pie-chart";
import { CumulativeChart } from "@/components/charts/cumulative-chart";
import { StockAlerts } from "@/components/stock/stock-alerts";
import { calculateVariation } from "@/lib/utils";

async function getDashboardData(userId: string) {
  const now = new Date();
  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfMonth(now);
  const previousMonthStart = startOfMonth(subMonths(now, 1));
  const previousMonthEnd = endOfMonth(subMonths(now, 1));

  // Charges du mois courant
  const currentMonthCharges = await prisma.charge.aggregate({
    where: {
      userId,
      date: { gte: currentMonthStart, lte: currentMonthEnd },
    },
    _sum: { amount: true },
  });

  // Charges du mois précédent
  const previousMonthCharges = await prisma.charge.aggregate({
    where: {
      userId,
      date: { gte: previousMonthStart, lte: previousMonthEnd },
    },
    _sum: { amount: true },
  });

  // Top 5 catégories du mois courant
  const topCategories = await prisma.charge.groupBy({
    by: ["categoryId"],
    where: {
      userId,
      date: { gte: currentMonthStart, lte: currentMonthEnd },
    },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 5,
  });

  const categories = await prisma.chargeCategory.findMany({
    where: { id: { in: topCategories.map((c) => c.categoryId) } },
  });

  const currentTotal = currentMonthCharges._sum.amount || 0;
  const topCategoriesWithDetails = topCategories.map((tc) => {
    const cat = categories.find((c) => c.id === tc.categoryId);
    return {
      categoryId: tc.categoryId,
      categoryName: cat?.name || "Inconnu",
      categoryColor: cat?.color || "#6366f1",
      total: tc._sum.amount || 0,
      percentage: currentTotal > 0 ? ((tc._sum.amount || 0) / currentTotal) * 100 : 0,
    };
  });

  // Charges récurrentes à venir (ce mois)
  const upcomingRecurring = await prisma.charge.findMany({
    where: {
      userId,
      isRecurring: true,
    },
    include: { category: true },
    orderBy: { date: "asc" },
    take: 5,
  });

  // Settings utilisateur
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
  });

  // Données pour graphiques - 12 derniers mois
  const monthlyData = [];
  for (let i = 11; i >= 0; i--) {
    const monthStart = startOfMonth(subMonths(now, i));
    const monthEnd = endOfMonth(subMonths(now, i));
    const charges = await prisma.charge.aggregate({
      where: {
        userId,
        date: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
    });
    monthlyData.push({
      month: format(monthStart, "MMM yy"),
      total: charges._sum.amount || 0,
    });
  }

  // Données cumulées du mois courant
  const dailyCharges = await prisma.charge.findMany({
    where: {
      userId,
      date: { gte: currentMonthStart, lte: currentMonthEnd },
    },
    orderBy: { date: "asc" },
  });

  const dailyMap = new Map<string, number>();
  dailyCharges.forEach((charge) => {
    const dateKey = format(charge.date, "dd/MM");
    dailyMap.set(dateKey, (dailyMap.get(dateKey) || 0) + charge.amount);
  });

  let cumulative = 0;
  const cumulativeData = Array.from(dailyMap.entries()).map(([date, daily]) => {
    cumulative += daily;
    return { date, daily, cumulative };
  });

  // Alertes stock
  const stockAlerts = await prisma.stockItem.findMany({
    where: {
      userId,
      alertThreshold: { not: null },
      quantity: { lte: prisma.stockItem.fields.alertThreshold },
    },
    take: 5,
  });

  return {
    stats: {
      currentMonthTotal: currentTotal,
      previousMonthTotal: previousMonthCharges._sum.amount || 0,
      variation: calculateVariation(
        currentTotal,
        previousMonthCharges._sum.amount || 0
      ),
      topCategories: topCategoriesWithDetails,
      upcomingRecurring,
      budgetAlert: settings?.monthlyBudget
        ? currentTotal > settings.monthlyBudget
        : false,
      monthlyBudget: settings?.monthlyBudget || null,
    },
    monthlyData,
    categoryData: topCategoriesWithDetails.map((c) => ({
      name: c.categoryName,
      value: c.total,
      color: c.categoryColor,
    })),
    cumulativeData,
    stockAlerts: stockAlerts.map((item) => ({
      item,
      currentQuantity: item.quantity,
      threshold: item.alertThreshold!,
    })),
    settings,
  };
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const data = await getDashboardData(session.user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Vue d'ensemble de votre activité</p>
      </div>

      {/* Stats cards */}
      <DashboardStats stats={data.stats} currency={data.settings?.currency || "EUR"} />

      {/* Charts */}
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
