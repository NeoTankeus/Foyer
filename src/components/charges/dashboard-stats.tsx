"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, AlertTriangle, CreditCard, Target } from "lucide-react";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { DashboardStats as DashboardStatsType } from "@/types";

interface DashboardStatsProps {
  stats: DashboardStatsType;
  currency: string;
}

export function DashboardStats({ stats, currency }: DashboardStatsProps) {
  const isPositiveVariation = stats.variation > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total mois courant */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Mois courant</CardTitle>
          <CreditCard className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(stats.currentMonthTotal, currency)}
          </div>
          <div className="flex items-center gap-1 mt-1">
            {isPositiveVariation ? (
              <TrendingUp className="h-3 w-3 text-destructive" />
            ) : (
              <TrendingDown className="h-3 w-3 text-success" />
            )}
            <span
              className={`text-xs ${
                isPositiveVariation ? "text-destructive" : "text-success"
              }`}
            >
              {formatPercent(stats.variation)} vs mois précédent
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Mois précédent */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Mois précédent</CardTitle>
          <CreditCard className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(stats.previousMonthTotal, currency)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Total des dépenses
          </p>
        </CardContent>
      </Card>

      {/* Budget */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Budget mensuel</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {stats.monthlyBudget ? (
            <>
              <div className="text-2xl font-bold">
                {formatCurrency(stats.monthlyBudget, currency)}
              </div>
              <div className="flex items-center gap-2 mt-1">
                {stats.budgetAlert ? (
                  <Badge variant="destructive" className="text-xs">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Dépassé
                  </Badge>
                ) : (
                  <Badge variant="success" className="text-xs">
                    Dans le budget
                  </Badge>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-muted-foreground">--</div>
              <p className="text-xs text-muted-foreground mt-1">
                Non défini
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Top catégorie */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Top catégorie</CardTitle>
          <div
            className="h-4 w-4 rounded-full"
            style={{
              backgroundColor: stats.topCategories[0]?.categoryColor || "#6366f1",
            }}
          />
        </CardHeader>
        <CardContent>
          {stats.topCategories[0] ? (
            <>
              <div className="text-2xl font-bold truncate">
                {stats.topCategories[0].categoryName}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatCurrency(stats.topCategories[0].total, currency)} (
                {stats.topCategories[0].percentage.toFixed(1)}%)
              </p>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-muted-foreground">--</div>
              <p className="text-xs text-muted-foreground mt-1">Aucune charge</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
