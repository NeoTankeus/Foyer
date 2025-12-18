"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { StockMovementInput, stockMovementSchema } from "@/lib/validations";
import { StockItemWithCategory } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";

interface StockMovementFormProps {
  item: StockItemWithCategory;
  type: "IN" | "OUT";
  onSaved: (item: StockItemWithCategory) => void;
  onCancel: () => void;
}

export function StockMovementForm({
  item,
  type,
  onSaved,
  onCancel,
}: StockMovementFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StockMovementInput>({
    resolver: zodResolver(stockMovementSchema),
    defaultValues: {
      itemId: item.id,
      type: type,
      quantity: 1,
      date: new Date(),
      comment: "",
    },
  });

  const onSubmit = async (data: StockMovementInput) => {
    // Vérifier le stock disponible pour les sorties
    if (type === "OUT" && data.quantity > item.quantity) {
      toast({
        title: "Stock insuffisant",
        description: `Stock disponible: ${item.quantity}`,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/stock/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erreur");
      }

      const result = await response.json();
      toast({
        title: type === "IN" ? "Entrée enregistrée" : "Sortie enregistrée",
        description: `Nouveau stock: ${result.item.quantity}`,
      });
      onSaved(result.item);
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de sauvegarder",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Info article */}
      <div className="p-4 rounded-lg bg-muted">
        <div className="flex items-center gap-3">
          {type === "IN" ? (
            <ArrowDownCircle className="h-8 w-8 text-success" />
          ) : (
            <ArrowUpCircle className="h-8 w-8 text-destructive" />
          )}
          <div>
            <p className="font-medium">{item.name}</p>
            <p className="text-sm text-muted-foreground">
              Stock actuel: <span className="font-medium">{item.quantity}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="quantity">Quantité *</Label>
        <Input
          id="quantity"
          type="number"
          min="1"
          max={type === "OUT" ? item.quantity : undefined}
          {...register("quantity", { valueAsNumber: true })}
        />
        {errors.quantity && (
          <p className="text-xs text-destructive">{errors.quantity.message}</p>
        )}
        {type === "OUT" && (
          <p className="text-xs text-muted-foreground">
            Maximum: {item.quantity}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="comment">Commentaire</Label>
        <Input
          id="comment"
          placeholder="Raison du mouvement..."
          {...register("comment")}
        />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button
          type="submit"
          loading={isLoading}
          variant={type === "IN" ? "default" : "destructive"}
        >
          {type === "IN" ? "Ajouter au stock" : "Retirer du stock"}
        </Button>
      </div>
    </form>
  );
}
