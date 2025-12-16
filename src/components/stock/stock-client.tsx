"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StockItemWithCategory, StockCategory } from "@/types";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StockItemForm } from "./stock-item-form";
import { StockMovementForm } from "./stock-movement-form";
import { formatCurrency } from "@/lib/utils";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  FileText,
  ArrowUpCircle,
  ArrowDownCircle,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StockClientProps {
  initialItems: StockItemWithCategory[];
  categories: StockCategory[];
  currency: string;
  isReadOnly: boolean;
}

export function StockClient({
  initialItems,
  categories,
  currency,
  isReadOnly,
}: StockClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState(initialItems);
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItemWithCategory | null>(null);
  const [movementItem, setMovementItem] = useState<StockItemWithCategory | null>(null);
  const [movementType, setMovementType] = useState<"IN" | "OUT">("IN");
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Filtrer les articles
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      search === "" ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.sku?.toLowerCase().includes(search.toLowerCase()) ||
      item.location?.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  // Calculer les stats
  const totalValue = items.reduce(
    (sum, item) => sum + item.quantity * (item.purchasePrice || 0),
    0
  );
  const alertCount = items.filter(
    (item) => item.alertThreshold && item.quantity <= item.alertThreshold
  ).length;

  // Supprimer un article
  const handleDelete = async (id: string) => {
    if (isDeleting) return;
    setIsDeleting(id);

    try {
      const response = await fetch(`/api/stock/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();

      setItems(items.filter((i) => i.id !== id));
      toast({ title: "Article supprimé" });
    } catch {
      toast({ title: "Erreur", description: "Impossible de supprimer", variant: "destructive" });
    } finally {
      setIsDeleting(null);
    }
  };

  // Export PDF
  const handleExportPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const doc = new jsPDF();

    // Titre
    doc.setFontSize(18);
    doc.text("Inventaire du stock", 14, 22);

    // Date
    doc.setFontSize(10);
    doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR")}`, 14, 30);

    // Stats
    doc.setFontSize(12);
    doc.text(`Total articles: ${items.length}`, 14, 40);
    doc.text(`Valeur totale: ${formatCurrency(totalValue, currency)}`, 14, 48);
    if (alertCount > 0) {
      doc.text(`Alertes stock: ${alertCount}`, 14, 56);
    }

    // Tableau
    autoTable(doc, {
      startY: 65,
      head: [["Nom", "SKU", "Quantité", "Seuil", "Prix unitaire", "Valeur", "Emplacement"]],
      body: filteredItems.map((item) => [
        item.name,
        item.sku || "-",
        item.quantity.toString(),
        item.alertThreshold?.toString() || "-",
        item.purchasePrice ? formatCurrency(item.purchasePrice, currency) : "-",
        item.purchasePrice ? formatCurrency(item.quantity * item.purchasePrice, currency) : "-",
        item.location || "-",
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] },
    });

    doc.save(`inventaire-${new Date().toISOString().split("T")[0]}.pdf`);
    toast({ title: "Export réussi", description: "Le fichier PDF a été téléchargé" });
  };

  // Callback après ajout/modification d'article
  const handleItemSaved = (item: StockItemWithCategory) => {
    if (editingItem) {
      setItems(items.map((i) => (i.id === item.id ? item : i)));
      setEditingItem(null);
    } else {
      setItems([item, ...items]);
      setIsAddOpen(false);
    }
    router.refresh();
  };

  // Callback après mouvement
  const handleMovementSaved = (updatedItem: StockItemWithCategory) => {
    setItems(items.map((i) => (i.id === updatedItem.id ? updatedItem : i)));
    setMovementItem(null);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Articles</p>
            <p className="text-2xl font-bold">{items.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Valeur totale</p>
            <p className="text-2xl font-bold">{formatCurrency(totalValue, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Alertes</p>
            <p className={`text-2xl font-bold ${alertCount > 0 ? "text-destructive" : ""}`}>
              {alertCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Catégories</p>
            <p className="text-2xl font-bold">{categories.length}</p>
          </CardContent>
        </Card>
      </div>

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

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExportPDF}>
                <FileText className="h-4 w-4 mr-2" />
                PDF
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
                      <DialogTitle>Nouvel article</DialogTitle>
                    </DialogHeader>
                    <StockItemForm
                      categories={categories}
                      onSaved={handleItemSaved}
                      onCancel={() => setIsAddOpen(false)}
                    />
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Article</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-center">Quantité</TableHead>
                  <TableHead className="text-right">Prix unitaire</TableHead>
                  <TableHead>Emplacement</TableHead>
                  {!isReadOnly && <TableHead className="w-[150px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isReadOnly ? 5 : 6} className="text-center py-8">
                      <p className="text-muted-foreground">Aucun article trouvé</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item) => {
                    const isLowStock = item.alertThreshold && item.quantity <= item.alertThreshold;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {isLowStock && (
                              <AlertTriangle className="h-4 w-4 text-destructive" />
                            )}
                            <div>
                              <p className="font-medium">{item.name}</p>
                              {item.category && (
                                <p className="text-xs text-muted-foreground">{item.category.name}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.sku || "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={isLowStock ? "destructive" : "secondary"}>
                            {item.quantity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {item.purchasePrice ? formatCurrency(item.purchasePrice, currency) : "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.location || "-"}
                        </TableCell>
                        {!isReadOnly && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {/* Mouvement Entrée */}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setMovementItem(item);
                                  setMovementType("IN");
                                }}
                                title="Entrée de stock"
                              >
                                <ArrowDownCircle className="h-4 w-4 text-success" />
                              </Button>

                              {/* Mouvement Sortie */}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setMovementItem(item);
                                  setMovementType("OUT");
                                }}
                                title="Sortie de stock"
                              >
                                <ArrowUpCircle className="h-4 w-4 text-destructive" />
                              </Button>

                              {/* Modifier */}
                              <Dialog
                                open={editingItem?.id === item.id}
                                onOpenChange={(open) => !open && setEditingItem(null)}
                              >
                                <DialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setEditingItem(item)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-lg">
                                  <DialogHeader>
                                    <DialogTitle>Modifier l'article</DialogTitle>
                                  </DialogHeader>
                                  <StockItemForm
                                    item={item}
                                    categories={categories}
                                    onSaved={handleItemSaved}
                                    onCancel={() => setEditingItem(null)}
                                  />
                                </DialogContent>
                              </Dialog>

                              {/* Supprimer */}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(item.id)}
                                disabled={isDeleting === item.id}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog mouvement */}
      <Dialog open={!!movementItem} onOpenChange={() => setMovementItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {movementType === "IN" ? "Entrée de stock" : "Sortie de stock"}
            </DialogTitle>
          </DialogHeader>
          {movementItem && (
            <StockMovementForm
              item={movementItem}
              type={movementType}
              onSaved={handleMovementSaved}
              onCancel={() => setMovementItem(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
