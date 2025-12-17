"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserSettings, ChargeCategory, CURRENCIES } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Save } from "lucide-react";

interface SettingsClientProps {
  settings: UserSettings | null;
  categories: ChargeCategory[];
  isReadOnly: boolean;
}

export function SettingsClient({ settings, categories, isReadOnly }: SettingsClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [currency, setCurrency] = useState(settings?.currency || "EUR");
  const [monthlyBudget, setMonthlyBudget] = useState(settings?.monthlyBudget?.toString() || "");
  const [localCategories, setLocalCategories] = useState(categories);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#6366f1");
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);

  // Sauvegarder les paramètres
  const handleSaveSettings = async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency,
          monthlyBudget: monthlyBudget ? parseFloat(monthlyBudget) : null,
        }),
      });

      if (!response.ok) throw new Error();

      toast({ title: "Paramètres sauvegardés" });
      router.refresh();
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder les paramètres",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Ajouter une catégorie
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;

    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCategoryName.trim(),
          color: newCategoryColor,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }

      const category = await response.json();
      setLocalCategories([...localCategories, category]);
      setNewCategoryName("");
      setNewCategoryColor("#6366f1");
      setIsAddCategoryOpen(false);
      toast({ title: "Catégorie ajoutée" });
      router.refresh();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur",
        variant: "destructive",
      });
    }
  };

  // Supprimer une catégorie
  const handleDeleteCategory = async (id: string) => {
    try {
      const response = await fetch(`/api/categories/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }

      setLocalCategories(localCategories.filter((c) => c.id !== id));
      toast({ title: "Catégorie supprimée" });
      router.refresh();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="grid gap-6 max-w-2xl">
      {/* Préférences générales */}
      <Card>
        <CardHeader>
          <CardTitle>Préférences</CardTitle>
          <CardDescription>Personnalisez l'affichage de votre tableau de bord</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="currency">Devise</Label>
              <Select value={currency} onValueChange={setCurrency} disabled={isReadOnly}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((curr) => (
                    <SelectItem key={curr.value} value={curr.value}>
                      {curr.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget">Budget mensuel</Label>
              <Input
                id="budget"
                type="number"
                min="0"
                step="100"
                placeholder="Optionnel"
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(e.target.value)}
                disabled={isReadOnly}
              />
            </div>
          </div>

          {!isReadOnly && (
            <Button onClick={handleSaveSettings} loading={isLoading}>
              <Save className="h-4 w-4 mr-2" />
              Sauvegarder
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Gestion des catégories */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Catégories de charges</CardTitle>
              <CardDescription>Gérez les catégories pour classer vos dépenses</CardDescription>
            </div>
            {!isReadOnly && (
              <Dialog open={isAddCategoryOpen} onOpenChange={setIsAddCategoryOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Ajouter
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nouvelle catégorie</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="categoryName">Nom</Label>
                      <Input
                        id="categoryName"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="Ex: Transport"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="categoryColor">Couleur</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          id="categoryColor"
                          value={newCategoryColor}
                          onChange={(e) => setNewCategoryColor(e.target.value)}
                          className="h-10 w-20 rounded cursor-pointer"
                        />
                        <Input
                          value={newCategoryColor}
                          onChange={(e) => setNewCategoryColor(e.target.value)}
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsAddCategoryOpen(false)}>
                        Annuler
                      </Button>
                      <Button onClick={handleAddCategory}>Ajouter</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {localCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Aucune catégorie définie
              </p>
            ) : (
              localCategories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="font-medium">{category.name}</span>
                  </div>
                  {!isReadOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteCategory(category.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
