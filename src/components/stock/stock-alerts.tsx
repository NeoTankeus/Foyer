"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Package } from "lucide-react";
import { StockAlert } from "@/types";
import Link from "next/link";

interface StockAlertsProps {
  alerts: StockAlert[];
}

export function StockAlerts({ alerts }: StockAlertsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="h-4 w-4" />
          Alertes Stock
        </CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Aucune alerte de stock</p>
            <p className="text-xs">Tous les niveaux sont suffisants</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <Link
                key={alert.item.id}
                href={`/stock?item=${alert.item.id}`}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-md bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{alert.item.name}</p>
                    {alert.item.sku && (
                      <p className="text-xs text-muted-foreground">{alert.item.sku}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="destructive">
                    {alert.currentQuantity} / {alert.threshold}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">
                    Seuil atteint
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
