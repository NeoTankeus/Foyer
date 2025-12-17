"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { StockItemInput, stockItemSchema } from "@/lib/validations";
import { StockItemWithCategory, StockCategory } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface StockItemFormProps {
  item?: StockItemWithCategory;
  categories: StockCategory[];
  onSaved: (item: StockItemWithCategory) => void;
  onCancel: () => void;
}

export function StockItemForm({ item, categories, onSaved, onCancel }: StockItemFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<StockItemInput>({
    resolver: zodResolver(stockItemSchema),
    defaultValues: {
      name: item?.name || "",
      sku: item?.sku || "",
      categoryId: item?.categoryId || "",
      quantity: item?.quantity || 0,
      alertThreshold: item?.alertThreshold || undefined,
      purchasePrice: item?.purchasePrice || undefined,
      location: item?.location || "",
      note: "",
    },
  });

  const categoryId = watch("categoryId");

  const onSubmit = async (data: StockItemInput) => {
    setIsLoading(true);

    try {
      const url = item ? `/api/stock/${item.id}` : "/api/stock";
      const method = item ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Erreur lors de la sauvegarde");
      }

      const savedItem = await response.json();
      toast({ title: item ? "Article modifié" : "Article ajouté" });
      onSaved(savedItem);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder l'article",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nom *</Label>
        <Input
          id="name"
          placeholder="Nom de l'article"
          {...register("name")}
        />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sku">SKU / Référence</Label>
          <Input
            id="sku"
            placeholder="REF-001"
            {...register("sku")}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="categoryId">Catégorie</Label>
          <Select
            value={categoryId || ""}
            onValueChange={(value) => setValue("categoryId", value || null)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Aucune</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!item && (
        <div className="space-y-2">
          <Label htmlFor="quantity">Quantité initiale *</Label>
          <Input
            id="quantity"
            type="number"
            min="0"
            {...register("quantity", { valueAsNumber: true })}
          />
          {errors.quantity && (
            <p className="text-xs text-destructive">{errors.quantity.message}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="alertThreshold">Seuil d'alerte</Label>
          <Input
            id="alertThreshold"
            type="number"
            min="0"
            placeholder="5"
            {...register("alertThreshold", { valueAsNumber: true })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="purchasePrice">Prix d'achat</Label>
          <Input
            id="purchasePrice"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            {...register("purchasePrice", { valueAsNumber: true })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="location">Emplacement</Label>
        <Input
          id="location"
          placeholder="Étagère A, Rayon 3"
          {...register("location")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">Note</Label>
        <Input
          id="note"
          placeholder="Note ou commentaire"
          {...register("note")}
        />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" loading={isLoading}>
          {item ? "Modifier" : "Ajouter"}
        </Button>
      </div>
    </form>
  );
}
