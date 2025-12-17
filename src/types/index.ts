import type { Category, Charge, StockItem, StockMovement, User, Settings } from "@/lib/db";

// Alias pour compatibilité
export type ChargeCategory = Category;
export type StockCategory = Category;
export type UserSettings = Settings;

// Extensions des types avec relations
export type ChargeWithCategory = Charge & {
  category: Category;
};

export type StockItemWithCategory = StockItem & {
  category: Category | null;
};

export type StockItemWithMovements = StockItem & {
  category: Category | null;
  movements: StockMovement[];
};

export type StockMovementWithItem = StockMovement & {
  item: StockItem;
};

export type UserWithSettings = Omit<User, "password"> & {
  settings: Settings | null;
};

// Types pour les statistiques du dashboard
export interface DashboardStats {
  currentMonthTotal: number;
  previousMonthTotal: number;
  variation: number;
  topCategories: CategoryStat[];
  upcomingRecurring: ChargeWithCategory[];
  budgetAlert: boolean;
  monthlyBudget: number | null;
}

export interface CategoryStat {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  total: number;
  percentage: number;
}

// Types pour les graphiques
export interface MonthlyChartData {
  month: string;
  total: number;
}

export interface CategoryChartData {
  name: string;
  value: number;
  color: string;
}

export interface DailyChartData {
  date: string;
  cumulative: number;
  daily: number;
}

// Types pour les alertes stock
export interface StockAlert {
  item: StockItemWithCategory;
  currentQuantity: number;
  threshold: number;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Modes de paiement
export const PAYMENT_METHODS = [
  { value: "card", label: "Carte bancaire" },
  { value: "transfer", label: "Virement" },
  { value: "cash", label: "Espèces" },
  { value: "check", label: "Chèque" },
  { value: "direct_debit", label: "Prélèvement" },
  { value: "other", label: "Autre" },
] as const;

// Récurrences
export const RECURRENCE_OPTIONS = [
  { value: "monthly", label: "Mensuel" },
  { value: "quarterly", label: "Trimestriel" },
  { value: "yearly", label: "Annuel" },
] as const;

// Devises supportées
export const CURRENCIES = [
  { value: "EUR", label: "Euro (€)", symbol: "€" },
  { value: "USD", label: "Dollar ($)", symbol: "$" },
  { value: "GBP", label: "Livre (£)", symbol: "£" },
  { value: "CHF", label: "Franc suisse", symbol: "CHF" },
] as const;

// Re-export des types pour faciliter les imports
export type { Charge, Category, StockItem, StockMovement, User, Settings };
