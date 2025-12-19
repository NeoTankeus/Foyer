"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChargeWithCategory, ChargeCategory } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { ChargeForm } from "./charge-form";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Search, Pencil, Trash2, Download, RefreshCcw, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ChargesClientProps {
  initialCharges: ChargeWithCategory[];
  categories: ChargeCategory[];
  currency: string;
  isReadOnly: boolean;
}

export function ChargesClient({
  initialCharges,
  categories: initialCategories,
  currency,
  isReadOnly,
}: ChargesClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [charges, setCharges] = useState(initialCharges);
  const [categories, setCategories] = useState(initialCategories);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState<ChargeWithCategory | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Filtrer les charges
  const filteredCharges = charges.filter((charge) => {
    const matchesSearch =
      search === "" ||
      charge.supplier?.toLowerCase().includes(search.toLowerCase()) ||
      charge.note?.toLowerCase().includes(search.toLowerCase()) ||
      charge.category.name.toLowerCase().includes(search.toLowerCase());

    const matchesCategory =
      categoryFilter === "" || categoryFilter === "all" || charge.categoryId === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  // Calculer le total filtré
  const totalFiltered = filteredCharges.reduce((sum, c) => sum + c.amount, 0);

  // Supprimer une charge
  const handleDelete = async (id: string) => {
    if (isDeleting) return;
    setIsDeleting(id);

    try {
      const response = await fetch(`/api/charges/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include"
      });

      const data = await response.json().catch(() => ({ error: "Erreur reseau" }));

      if (!response.ok) {
        if (response.status === 401) {
          toast({ title: "Session expiree", description: "Vous allez etre redirige...", variant: "destructive" });
          setTimeout(() => window.location.href = "/login", 1500);
          return;
        }
        throw new Error(data.error || "Erreur de suppression");
      }

      // Mise à jour immédiate de l'état local
      setCharges(prev => prev.filter((c) => c.id !== id));
      toast({ title: "Charge supprimée" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Impossible de supprimer";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setIsDeleting(null);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ["Date", "Montant", "Catégorie", "Fournisseur", "Mode de paiement", "Récurrente", "Note"];
    const rows = filteredCharges.map((c) => [
      formatDate(c.date),
      c.amount.toString(),
      c.category.name,
      c.supplier || "",
      c.paymentMethod || "",
      c.isRecurring ? "Oui" : "Non",
      c.note || "",
    ]);

    const csv = [headers, ...rows].map((row) => row.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `charges-${formatDate(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({ title: "Export réussi", description: "Le fichier CSV a été téléchargé" });
  };

  // Callback après ajout/modification
  const handleSaved = (charge: ChargeWithCategory, newCategory?: ChargeCategory) => {
    // Ajouter la nouvelle catégorie si elle existe
    if (newCategory && !categories.find(c => c.id === newCategory.id)) {
      setCategories(prev => [...prev, newCategory]);
    }

    if (editingCharge) {
      // Mise à jour immédiate de l'état local
      setCharges(prev => prev.map((c) => (c.id === charge.id ? charge : c)));
      setEditingCharge(null);
    } else {
      // Ajout immédiat à l'état local
      setCharges(prev => [charge, ...prev]);
      setIsAddOpen(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-2" />
                CSV
              </Button>

              {!isReadOnly && (
                <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Ajouter
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Nouvelle charge</DialogTitle>
                    </DialogHeader>
                    <ChargeForm
                      categories={categories}
                      onSaved={handleSaved}
                      onCancel={() => setIsAddOpen(false)}
                    />
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{filteredCharges.length} charge(s)</span>
        <span className="font-medium text-foreground">
          Total: {formatCurrency(totalFiltered, currency)}
        </span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>Type</TableHead>
                  {!isReadOnly && <TableHead className="w-[100px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCharges.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isReadOnly ? 5 : 6} className="text-center py-8">
                      <p className="text-muted-foreground">Aucune charge trouvée</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCharges.map((charge) => (
                    <TableRow key={charge.id}>
                      <TableCell className="font-medium">
                        {formatDate(charge.date)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: charge.category.color }}
                          />
                          {charge.category.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {charge.supplier || "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(charge.amount, currency)}
                      </TableCell>
                      <TableCell>
                        {charge.isRecurring && (
                          <Badge variant="secondary" className="text-xs">
                            <RefreshCcw className="h-3 w-3 mr-1" />
                            {charge.recurrence}
                          </Badge>
                        )}
                      </TableCell>
                      {!isReadOnly && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Dialog
                              open={editingCharge?.id === charge.id}
                              onOpenChange={(open) => !open && setEditingCharge(null)}
                            >
                              <DialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setEditingCharge(charge)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-lg">
                                <DialogHeader>
                                  <DialogTitle>Modifier la charge</DialogTitle>
                                </DialogHeader>
                                <ChargeForm
                                  charge={charge}
                                  categories={categories}
                                  onSaved={handleSaved}
                                  onCancel={() => setEditingCharge(null)}
                                />
                              </DialogContent>
                            </Dialog>

                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(charge.id)}
                              disabled={isDeleting === charge.id}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
