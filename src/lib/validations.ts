import { z } from "zod";

// ===========================================
// AUTH
// ===========================================

export const loginSchema = z.object({
  email: z.string().min(1, "Identifiant requis"),
  password: z.string().min(1, "Mot de passe requis"),
});

export const registerSchema = loginSchema.extend({
  name: z.string().min(2, "Nom: 2 caractères minimum").optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

// ===========================================
// CHARGES
// ===========================================

export const chargeSchema = z.object({
  date: z.coerce.date(),
  amount: z.coerce.number().positive("Le montant doit être positif"),
  categoryId: z.string().min(1, "Catégorie requise"),
  supplier: z.string().optional().nullable().transform(v => v || null),
  paymentMethod: z.string().optional().nullable().transform(v => v || null),
  isRecurring: z.boolean().default(false),
  recurrence: z.enum(["monthly", "quarterly", "yearly"]).optional().nullable(),
  note: z.string().optional().nullable().transform(v => v || null),
  attachmentUrl: z.string().optional().nullable().transform(v => v || null),
});

export const chargeFilterSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  categoryId: z.string().optional(),
  supplier: z.string().optional(),
});

export type ChargeInput = z.infer<typeof chargeSchema>;
export type ChargeFilter = z.infer<typeof chargeFilterSchema>;

// ===========================================
// CATÉGORIES DE CHARGES
// ===========================================

export const chargeCategorySchema = z.object({
  name: z.string().min(1, "Nom requis").max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Couleur hexadécimale invalide").default("#6366f1"),
  icon: z.string().optional().nullable(),
});

export type ChargeCategoryInput = z.infer<typeof chargeCategorySchema>;

// ===========================================
// STOCK
// ===========================================

export const stockItemSchema = z.object({
  name: z.string().min(1, "Nom requis").max(100),
  sku: z.string().optional().nullable().transform(v => v || null),
  categoryId: z.string().optional().nullable().transform(v => v || null),
  quantity: z.coerce.number().int().min(0).default(0),
  alertThreshold: z.coerce.number().int().min(0).optional().nullable(),
  purchasePrice: z.coerce.number().min(0).optional().nullable(),
  location: z.string().optional().nullable().transform(v => v || null),
  note: z.string().optional().nullable().transform(v => v || null),
});

export const stockMovementSchema = z.object({
  itemId: z.string().min(1, "Article requis"),
  type: z.enum(["IN", "OUT"]),
  quantity: z.coerce.number().int().positive("Quantité positive requise"),
  date: z.coerce.date().default(() => new Date()),
  comment: z.string().optional().nullable(),
});

export const stockCategorySchema = z.object({
  name: z.string().min(1, "Nom requis").max(50),
});

export type StockItemInput = z.infer<typeof stockItemSchema>;
export type StockMovementInput = z.infer<typeof stockMovementSchema>;
export type StockCategoryInput = z.infer<typeof stockCategorySchema>;

// ===========================================
// SETTINGS
// ===========================================

export const userSettingsSchema = z.object({
  currency: z.string().default("EUR"),
  locale: z.string().default("fr-FR"),
  monthlyBudget: z.coerce.number().min(0).optional().nullable(),
});

export type UserSettingsInput = z.infer<typeof userSettingsSchema>;

// ===========================================
// HELPERS
// ===========================================

// Valider et parser les données avec gestion d'erreur
export function safeParseJSON<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errorMessage = result.error.errors.map((e) => e.message).join(", ");
  return { success: false, error: errorMessage };
}
