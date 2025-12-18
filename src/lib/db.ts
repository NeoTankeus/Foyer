import { hashSync, compareSync } from "bcryptjs";

// ========================================
// DATABASE EN MÉMOIRE POUR VERCEL
// ========================================
// Vercel a un système de fichiers en LECTURE SEULE
// On utilise une variable globale pour persister les données
// entre les requêtes (mais reset au cold start)

export interface User {
  id: string;
  email: string;
  password: string;
  name: string | null;
  role: "ADMIN" | "TECH";
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface Charge {
  id: string;
  userId: string;
  date: string;
  amount: number;
  categoryId: string;
  supplier: string | null;
  paymentMethod: string | null;
  isRecurring: boolean;
  recurrence: string | null;
  note: string | null;
}

export interface StockItem {
  id: string;
  userId: string;
  name: string;
  sku: string | null;
  categoryId: string | null;
  quantity: number;
  alertThreshold: number | null;
  purchasePrice: number | null;
  location: string | null;
}

export interface StockMovement {
  id: string;
  userId: string;
  itemId: string;
  type: "IN" | "OUT";
  quantity: number;
  date: string;
  comment: string | null;
}

export interface Settings {
  userId: string;
  currency: string;
  monthlyBudget: number | null;
}

interface Database {
  users: User[];
  categories: Category[];
  charges: Charge[];
  stockItems: StockItem[];
  stockMovements: StockMovement[];
  stockCategories: Category[];
  settings: Settings[];
}

// Global pour persister entre les requêtes sur Vercel
declare global {
  // eslint-disable-next-line no-var
  var __db: Database | undefined;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function createDefaultData(): Database {
  const adminId = "admin001";

  const categories: Category[] = [
    { id: "cat001", name: "Loyer", color: "#ef4444" },
    { id: "cat002", name: "Électricité", color: "#f59e0b" },
    { id: "cat003", name: "Internet", color: "#06b6d4" },
    { id: "cat004", name: "Salaires", color: "#8b5cf6" },
    { id: "cat005", name: "Fournitures", color: "#10b981" },
    { id: "cat006", name: "Transport", color: "#ec4899" },
    { id: "cat007", name: "Marketing", color: "#6366f1" },
    { id: "cat008", name: "Divers", color: "#64748b" },
  ];

  const stockCategories: Category[] = [
    { id: "scat001", name: "Électronique", color: "#3b82f6" },
    { id: "scat002", name: "Mobilier", color: "#a855f7" },
    { id: "scat003", name: "Consommables", color: "#22c55e" },
  ];

  // Créer des charges de démo pour les 6 derniers mois
  const charges: Charge[] = [];
  const now = new Date();

  for (let month = 0; month < 6; month++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - month, 1);
    const monthPrefix = `ch${month}`;

    charges.push({
      id: `${monthPrefix}001`,
      userId: adminId,
      date: new Date(monthDate.getFullYear(), monthDate.getMonth(), 5).toISOString(),
      amount: 2500,
      categoryId: categories[0].id,
      supplier: "SCI Immobilier",
      paymentMethod: "transfer",
      isRecurring: true,
      recurrence: "monthly",
      note: "Loyer bureaux",
    });

    charges.push({
      id: `${monthPrefix}002`,
      userId: adminId,
      date: new Date(monthDate.getFullYear(), monthDate.getMonth(), 15).toISOString(),
      amount: Math.round((180 + Math.random() * 50) * 100) / 100,
      categoryId: categories[1].id,
      supplier: "EDF",
      paymentMethod: "direct_debit",
      isRecurring: true,
      recurrence: "monthly",
      note: null,
    });

    charges.push({
      id: `${monthPrefix}003`,
      userId: adminId,
      date: new Date(monthDate.getFullYear(), monthDate.getMonth(), 10).toISOString(),
      amount: Math.round((8500 + Math.random() * 1500) * 100) / 100,
      categoryId: categories[3].id,
      supplier: null,
      paymentMethod: "transfer",
      isRecurring: true,
      recurrence: "monthly",
      note: "Salaires équipe",
    });
  }

  // Stock items
  const stockItems: StockItem[] = [
    { id: "stock001", userId: adminId, name: "MacBook Pro 14\"", sku: "APPLE-MBP14", categoryId: stockCategories[0].id, quantity: 5, alertThreshold: 2, purchasePrice: 2499, location: "Bureau A" },
    { id: "stock002", userId: adminId, name: "Écran Dell 27\"", sku: "DELL-MON27", categoryId: stockCategories[0].id, quantity: 8, alertThreshold: 3, purchasePrice: 399, location: "Bureau A" },
    { id: "stock003", userId: adminId, name: "Souris Magic Mouse", sku: "APPLE-MS", categoryId: stockCategories[0].id, quantity: 2, alertThreshold: 5, purchasePrice: 99, location: "Stock" },
    { id: "stock004", userId: adminId, name: "Bureau réglable", sku: "DESK-001", categoryId: stockCategories[1].id, quantity: 4, alertThreshold: 2, purchasePrice: 549, location: "Entrepôt" },
    { id: "stock005", userId: adminId, name: "Ramettes papier A4", sku: "PAPER-A4", categoryId: stockCategories[2].id, quantity: 25, alertThreshold: 10, purchasePrice: 4.99, location: "Salle copies" },
    { id: "stock006", userId: adminId, name: "Cartouches encre", sku: "INK-HP", categoryId: stockCategories[2].id, quantity: 3, alertThreshold: 5, purchasePrice: 35, location: "Salle copies" },
  ];

  return {
    users: [
      {
        id: adminId,
        email: "admin",
        password: hashSync("admin123", 10),  // Mot de passe: admin123
        name: "Administrateur",
        role: "ADMIN",
        createdAt: new Date().toISOString(),
      },
    ],
    categories,
    charges,
    stockItems,
    stockMovements: [],
    stockCategories,
    settings: [
      { userId: adminId, currency: "EUR", monthlyBudget: 15000 },
    ],
  };
}

// Obtenir la base de données (crée si n'existe pas)
function getDb(): Database {
  if (!global.__db) {
    console.log("[DB] Initialisation de la base de données en mémoire");
    global.__db = createDefaultData();
  }
  return global.__db;
}

// ========================================
// USER OPERATIONS
// ========================================

export function findUserByEmail(email: string): User | undefined {
  const db = getDb();
  return db.users.find((u) => u.email === email);
}

export function findUserById(id: string): User | undefined {
  const db = getDb();
  return db.users.find((u) => u.id === id);
}

export function getAllUsers(): Omit<User, "password">[] {
  const db = getDb();
  return db.users.map(({ password, ...user }) => user);
}

export function createUser(email: string, password: string, name: string | null, role: "ADMIN" | "TECH"): User {
  const db = getDb();
  const user: User = {
    id: generateId(),
    email,
    password: hashSync(password, 12),
    name,
    role,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  db.settings.push({ userId: user.id, currency: "EUR", monthlyBudget: null });
  return user;
}

export function updateUserPassword(userId: string, newPassword: string) {
  const db = getDb();
  const user = db.users.find((u) => u.id === userId);
  if (user) {
    user.password = hashSync(newPassword, 12);
  }
}

export function deleteUser(userId: string) {
  const db = getDb();
  db.users = db.users.filter((u) => u.id !== userId);
  db.charges = db.charges.filter((c) => c.userId !== userId);
  db.stockItems = db.stockItems.filter((i) => i.userId !== userId);
  db.settings = db.settings.filter((s) => s.userId !== userId);
}

export function verifyPassword(user: User, password: string): boolean {
  return compareSync(password, user.password);
}

// ========================================
// CATEGORIES
// ========================================

export function getAllCategories(): Category[] {
  return getDb().categories;
}

export function createCategory(name: string, color: string): Category {
  const db = getDb();
  const category: Category = { id: generateId(), name, color };
  db.categories.push(category);
  return category;
}

export function updateCategory(id: string, data: Partial<Category>): Category | null {
  const db = getDb();
  const idx = db.categories.findIndex((c) => c.id === id);
  if (idx !== -1) {
    db.categories[idx] = { ...db.categories[idx], ...data };
    return db.categories[idx];
  }
  return null;
}

export function deleteCategory(id: string) {
  const db = getDb();
  db.categories = db.categories.filter((c) => c.id !== id);
}

// ========================================
// CHARGES
// ========================================

export function getChargesByUser(userId: string): (Charge & { category: Category })[] {
  const db = getDb();
  return db.charges
    .filter((c) => c.userId === userId)
    .map((c) => ({
      ...c,
      category: db.categories.find((cat) => cat.id === c.categoryId) || { id: "", name: "Inconnu", color: "#999" }
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getChargeById(id: string): Charge | undefined {
  const db = getDb();
  return db.charges.find((c) => c.id === id);
}

export function createCharge(data: Omit<Charge, "id">): Charge {
  const db = getDb();
  const charge: Charge = { id: generateId(), ...data };
  db.charges.push(charge);
  console.log(`[DB] Charge créée: ${charge.id}`);
  return charge;
}

export function updateCharge(id: string, data: Partial<Charge>): Charge | null {
  const db = getDb();
  const idx = db.charges.findIndex((c) => c.id === id);
  if (idx !== -1) {
    db.charges[idx] = { ...db.charges[idx], ...data };
    console.log(`[DB] Charge mise à jour: ${id}`);
    return db.charges[idx];
  }
  return null;
}

export function deleteCharge(id: string): boolean {
  const db = getDb();
  const initialLength = db.charges.length;
  db.charges = db.charges.filter((c) => c.id !== id);
  const deleted = db.charges.length < initialLength;
  console.log(`[DB] Charge supprimée: ${id}, succès: ${deleted}`);
  return deleted;
}

// ========================================
// STOCK
// ========================================

export function getStockByUser(userId: string): (StockItem & { category: Category | null })[] {
  const db = getDb();
  return db.stockItems
    .filter((i) => i.userId === userId)
    .map((i) => ({
      ...i,
      category: db.stockCategories.find((c) => c.id === i.categoryId) || null
    }));
}

export function getStockCategories(): Category[] {
  return getDb().stockCategories;
}

export function getStockItemById(id: string): StockItem | undefined {
  const db = getDb();
  return db.stockItems.find((i) => i.id === id);
}

export function createStockItem(data: Omit<StockItem, "id">): StockItem {
  const db = getDb();
  const item: StockItem = { id: generateId(), ...data };
  db.stockItems.push(item);
  console.log(`[DB] Stock item créé: ${item.id}`);
  return item;
}

export function updateStockItem(id: string, data: Partial<StockItem>): StockItem | null {
  const db = getDb();
  const idx = db.stockItems.findIndex((i) => i.id === id);
  if (idx !== -1) {
    db.stockItems[idx] = { ...db.stockItems[idx], ...data };
    console.log(`[DB] Stock item mis à jour: ${id}`);
    return db.stockItems[idx];
  }
  return null;
}

export function deleteStockItem(id: string): boolean {
  const db = getDb();
  const initialLength = db.stockItems.length;
  db.stockItems = db.stockItems.filter((i) => i.id !== id);
  const deleted = db.stockItems.length < initialLength;
  console.log(`[DB] Stock item supprimé: ${id}, succès: ${deleted}`);
  return deleted;
}

export function addStockMovement(itemId: string, userId: string, type: "IN" | "OUT", quantity: number, comment: string | null): StockItem | null {
  const db = getDb();
  const item = db.stockItems.find((i) => i.id === itemId);
  if (!item) return null;

  if (type === "IN") {
    item.quantity += quantity;
  } else {
    item.quantity = Math.max(0, item.quantity - quantity);
  }

  db.stockMovements.push({
    id: generateId(),
    userId,
    itemId,
    type,
    quantity,
    date: new Date().toISOString(),
    comment,
  });

  return item;
}

export function createStockCategory(name: string, color: string): Category {
  const db = getDb();
  const category: Category = { id: generateId(), name, color };
  db.stockCategories.push(category);
  return category;
}

export function deleteStockCategory(id: string) {
  const db = getDb();
  db.stockCategories = db.stockCategories.filter((c) => c.id !== id);
}

// ========================================
// SETTINGS
// ========================================

export function getUserSettings(userId: string): Settings | undefined {
  return getDb().settings.find((s) => s.userId === userId);
}

export function updateUserSettings(userId: string, data: Partial<Settings>) {
  const db = getDb();
  const idx = db.settings.findIndex((s) => s.userId === userId);
  if (idx !== -1) {
    db.settings[idx] = { ...db.settings[idx], ...data };
  } else {
    db.settings.push({ userId, currency: "EUR", monthlyBudget: null, ...data });
  }
}

// ========================================
// DEBUG & RESET
// ========================================

export function resetDatabase() {
  console.log("[DB] Reset de la base de données");
  global.__db = createDefaultData();
}

export function getDatabaseStats() {
  const db = getDb();
  return {
    users: db.users.length,
    categories: db.categories.length,
    charges: db.charges.length,
    stockItems: db.stockItems.length,
    stockCategories: db.stockCategories.length,
    settings: db.settings.length,
  };
}
