"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChargeInput, chargeSchema } from "@/lib/validations";
import { ChargeWithCategory, ChargeCategory, PAYMENT_METHODS, RECURRENCE_OPTIONS } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface ChargeFormProps {
  charge?: ChargeWithCategory;
  categories: ChargeCategory[];
  onSaved: (charge: ChargeWithCategory) => void;
  onCancel: () => void;
}

export function ChargeForm({ charge, categories, onSaved, onCancel }: ChargeFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showOptional, setShowOptional] = useState(!!charge);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ChargeInput>({
    resolver: zodResolver(chargeSchema),
    defaultValues: {
      date: charge ? new Date(charge.date) : new Date(),
      amount: charge?.amount || undefined,
      categoryId: charge?.categoryId || "",
      supplier: charge?.supplier || "",
      paymentMethod: charge?.paymentMethod || "",
      isRecurring: charge?.isRecurring || false,
      recurrence: (charge?.recurrence as "monthly" | "quarterly" | "yearly" | null) || undefined,
      note: charge?.note || "",
      attachmentUrl: "",
    },
  });

  const isRecurring = watch("isRecurring");
  const categoryId = watch("categoryId");

  const onSubmit = async (data: ChargeInput) => {
    setIsLoading(true);

    try {
      const url = charge ? `/api/charges/${charge.id}` : "/api/charges";
      const method = charge ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include"
      });

      const result = await response.json().catch(() => ({ error: "Erreur reseau" }));

      if (!response.ok) {
        if (response.status === 401) {
          toast({ title: "Session expiree", description: "Reconnectez-vous", variant: "destructive" });
          setTimeout(() => window.location.href = "/login", 1500);
          return;
        }
        throw new Error(result.error || "Erreur lors de la sauvegarde");
      }

      toast({ title: charge ? "Charge modifiee" : "Charge ajoutee" });
      onSaved(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible de sauvegarder";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Champs obligatoires */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="date">Date *</Label>
          <Input
            id="date"
            type="date"
            {...register("date", { valueAsDate: true })}
            defaultValue={charge ? format(new Date(charge.date), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")}
          />
          {errors.date && (
            <p className="text-xs text-destructive">{errors.date.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="amount">Montant *</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            {...register("amount", { valueAsNumber: true })}
          />
          {errors.amount && (
            <p className="text-xs text-destructive">{errors.amount.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="categoryId">Catégorie *</Label>
        <Select
          value={categoryId}
          onValueChange={(value) => setValue("categoryId", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Sélectionner une catégorie" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  {cat.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.categoryId && (
          <p className="text-xs text-destructive">{errors.categoryId.message}</p>
        )}
      </div>

      {/* Toggle champs optionnels */}
      {!showOptional && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowOptional(true)}
          className="w-full"
        >
          + Plus d'options
        </Button>
      )}

      {/* Champs optionnels */}
      {showOptional && (
        <div className="space-y-4 pt-2 border-t">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="supplier">Fournisseur</Label>
              <Input
                id="supplier"
                placeholder="Nom du fournisseur"
                {...register("supplier")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Mode de paiement</Label>
              <Select
                value={watch("paymentMethod") || ""}
                onValueChange={(value) => setValue("paymentMethod", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="isRecurring"
              checked={isRecurring}
              onCheckedChange={(checked) => setValue("isRecurring", !!checked)}
            />
            <Label htmlFor="isRecurring" className="cursor-pointer">
              Charge récurrente
            </Label>
          </div>

          {isRecurring && (
            <div className="space-y-2">
              <Label htmlFor="recurrence">Périodicité</Label>
              <Select
                value={watch("recurrence") || ""}
                onValueChange={(value) => setValue("recurrence", value as "monthly" | "quarterly" | "yearly")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Input
              id="note"
              placeholder="Note ou commentaire"
              {...register("note")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="attachmentUrl">Pièce jointe (URL)</Label>
            <Input
              id="attachmentUrl"
              type="url"
              placeholder="https://..."
              {...register("attachmentUrl")}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" loading={isLoading}>
          {charge ? "Modifier" : "Ajouter"}
        </Button>
      </div>
    </form>
  );
}
