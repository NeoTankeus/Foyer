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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Plus, Loader2 } from "lucide-react";

interface ChargeFormProps {
  charge?: ChargeWithCategory;
  categories: ChargeCategory[];
  onSaved: (charge: ChargeWithCategory, newCategory?: ChargeCategory) => void;
  onCancel: () => void;
}

// Couleurs prédéfinies pour les catégories
const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#64748b", "#78716c", "#71717a"
];

export function ChargeForm({ charge, categories, onSaved, onCancel }: ChargeFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showOptional, setShowOptional] = useState(!!charge);
  const [localCategories, setLocalCategories] = useState(categories);

  // État pour la création de nouvelle catégorie
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState(PRESET_COLORS[0]);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

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

  // Créer une nouvelle catégorie
  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      toast({ title: "Erreur", description: "Nom de catégorie requis", variant: "destructive" });
      return;
    }

    setIsCreatingCategory(true);
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim(), color: newCategoryColor }),
        credentials: "include"
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erreur lors de la création");
      }

      // Ajouter la nouvelle catégorie et la sélectionner
      setLocalCategories([...localCategories, result]);
      setValue("categoryId", result.id);
      setShowNewCategory(false);
      setNewCategoryName("");
      toast({ title: "Catégorie créée", description: `"${result.name}" a été ajoutée` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible de créer la catégorie";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setIsCreatingCategory(false);
    }
  };

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

      toast({ title: charge ? "Charge modifiée" : "Charge ajoutée" });

      // Trouver si une nouvelle catégorie a été créée
      const newCat = localCategories.find(c => !categories.find(oc => oc.id === c.id));
      onSaved(result, newCat);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible de sauvegarder";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
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
          <div className="flex gap-2">
            <Select
              value={categoryId}
              onValueChange={(value) => setValue("categoryId", value)}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Sélectionner une catégorie" />
              </SelectTrigger>
              <SelectContent>
                {localCategories.map((cat) => (
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
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowNewCategory(true)}
              title="Nouvelle catégorie"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
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
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {charge ? "Modifier" : "Ajouter"}
          </Button>
        </div>
      </form>

      {/* Dialog pour nouvelle catégorie */}
      <Dialog open={showNewCategory} onOpenChange={setShowNewCategory}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouvelle catégorie</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newCatName">Nom de la catégorie</Label>
              <Input
                id="newCatName"
                placeholder="Ex: Fournitures bureau"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateCategory()}
              />
            </div>

            <div className="space-y-2">
              <Label>Couleur</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                      newCategoryColor === color ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewCategoryColor(color)}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowNewCategory(false)}>
                Annuler
              </Button>
              <Button onClick={handleCreateCategory} disabled={isCreatingCategory}>
                {isCreatingCategory && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Créer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
