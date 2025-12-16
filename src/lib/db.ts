import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { hashSync, compareSync } from "bcryptjs";

const DB_PATH = join(process.cwd(), "data.json");

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

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function getDefaultData(): Database {
  const adminId = generateId();
  const categories: Category[] = [
    { id: generateId(), name: "Loyer", color: "#ef4444" },
    { id: generateId(), name: "Électricité", color: "#f59e0b" },
    { id: generateId(), name: "Internet", color: "#06b6d4" },
    { id: generateId(), name: "Salaires", color: "#8b5cf6" },
    { id: generateId(), name: "Fournitures", color: "#10b981" },
    { id: generateId(), name: "Transport", color: "#ec4899" },
    { id: generateId(), name: "Marketing", color: "#6366f1" },
    { id: generateId(), name: "Divers", color: "#64748b" },
  ];

  const stockCategories: Category[] = [
    { id: generateId(), name: "Électronique", color: "#3b82f6" },
    { id: generateId(), name: "Mobilier", color: "#a855f7" },
    { id: generateId(), name: "Consommables", color: "#22c55e" },
  ];

  // Créer des charges de démo pour les 6 derniers mois
  const charges: Charge[] = [];
  const now = new Date();

  for (let month = 0; month < 6; month++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - month, 1);

    charges.push({
      id: generateId(),
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
      id: generateId(),
      userId: adminId,
      date: new Date(monthDate.getFullYear(), monthDate.getMonth(), 15).toISOString(),
      amount: 180 + Math.random() * 50,
      categoryId: categories[1].id,
      supplier: "EDF",
      paymentMethod: "direct_debit",
      isRecurring: true,
      recurrence: "monthly",
      note: null,
    });

    charges.push({
      id: generateId(),
      userId: adminId,
      date: new Date(monthDate.getFullYear(), monthDate.getMonth(), 10).toISOString(),
      amount: 8500 + Math.random() * 1500,
      categoryId: categories[3].id,
      supplier: null,
      paymentMethod: "transfer",
      isRecurring: true,
      recurrence: "monthly",
      note: "Salaires équipe",
    });

    // Charges aléatoires
    for (let i = 0; i < 3; i++) {
      charges.push({
        id: generateId(),
        userId: adminId,
        date: new Date(monthDate.getFullYear(), monthDate.getMonth(), Math.floor(Math.random() * 28) + 1).toISOString(),
        amount: Math.round((50 + Math.random() * 400) * 100) / 100,
        categoryId: categories[Math.floor(Math.random() * categories.length)].id,
        supplier: ["Amazon", "Bureau Vallée", "SNCF"][Math.floor(Math.random() * 3)],
        paymentMethod: "card",
        isRecurring: false,
        recurrence: null,
        note: null,
      });
    }
  }

  // Stock items
  const stockItems: StockItem[] = [
    { id: generateId(), userId: adminId, name: "MacBook Pro 14\"", sku: "APPLE-MBP14", categoryId: stockCategories[0].id, quantity: 5, alertThreshold: 2, purchasePrice: 2499, location: "Bureau A" },
    { id: generateId(), userId: adminId, name: "Écran Dell 27\"", sku: "DELL-MON27", categoryId: stockCategories[0].id, quantity: 8, alertThreshold: 3, purchasePrice: 399, location: "Bureau A" },
    { id: generateId(), userId: adminId, name: "Souris Magic Mouse", sku: "APPLE-MS", categoryId: stockCategories[0].id, quantity: 2, alertThreshold: 5, purchasePrice: 99, location: "Stock" },
    { id: generateId(), userId: adminId, name: "Bureau réglable", sku: "DESK-001", categoryId: stockCategories[1].id, quantity: 4, alertThreshold: 2, purchasePrice: 549, location: "Entrepôt" },
    { id: generateId(), userId: adminId, name: "Ramettes papier A4", sku: "PAPER-A4", categoryId: stockCategories[2].id, quantity: 25, alertThreshold: 10, purchasePrice: 4.99, location: "Salle copies" },
    { id: generateId(), userId: adminId, name: "Cartouches encre", sku: "INK-HP", categoryId: stockCategories[2].id, quantity: 3, alertThreshold: 5, purchasePrice: 35, location: "Salle copies" },
  ];

  return {
    users: [
      {
        id: adminId,
        email: "admin",
        password: hashSync("admin123", 12),
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

function loadDb(): Database {
  if (!existsSync(DB_PATH)) {
    const data = getDefaultData();
    saveDb(data);
    return data;
  }
  try {
    return JSON.parse(readFileSync(DB_PATH, "utf-8"));
  } catch {
    const data = getDefaultData();
    saveDb(data);
    return data;
  }
}

function saveDb(data: Database) {
  writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// User operations
export function findUserByEmail(email: string): User | undefined {
  const db = loadDb();
  return db.users.find((u) => u.email === email);
}

export function findUserById(id: string): User | undefined {
  const db = loadDb();
  return db.users.find((u) => u.id === id);
}

export function getAllUsers(): Omit<User, "password">[] {
  const db = loadDb();
  return db.users.map(({ password, ...user }) => user);
}

export function createUser(email: string, password: string, name: string | null, role: "ADMIN" | "TECH"): User {
  const db = loadDb();
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
  saveDb(db);
  return user;
}

export function updateUserPassword(userId: string, newPassword: string) {
  const db = loadDb();
  const user = db.users.find((u) => u.id === userId);
  if (user) {
    user.password = hashSync(newPassword, 12);
    saveDb(db);
  }
}

export function deleteUser(userId: string) {
  const db = loadDb();
  db.users = db.users.filter((u) => u.id !== userId);
  db.charges = db.charges.filter((c) => c.userId !== userId);
  db.stockItems = db.stockItems.filter((i) => i.userId !== userId);
  db.settings = db.settings.filter((s) => s.userId !== userId);
  saveDb(db);
}

export function verifyPassword(user: User, password: string): boolean {
  return compareSync(password, user.password);
}

// Categories
export function getAllCategories(): Category[] {
  return loadDb().categories;
}

export function createCategory(name: string, color: string): Category {
  const db = loadDb();
  const category: Category = { id: generateId(), name, color };
  db.categories.push(category);
  saveDb(db);
  return category;
}

export function deleteCategory(id: string) {
  const db = loadDb();
  db.categories = db.categories.filter((c) => c.id !== id);
  saveDb(db);
}

// Charges
export function getChargesByUser(userId: string): (Charge & { category: Category })[] {
  const db = loadDb();
  return db.charges
    .filter((c) => c.userId === userId)
    .map((c) => ({ ...c, category: db.categories.find((cat) => cat.id === c.categoryId)! }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function createCharge(data: Omit<Charge, "id">): Charge {
  const db = loadDb();
  const charge: Charge = { id: generateId(), ...data };
  db.charges.push(charge);
  saveDb(db);
  return charge;
}

export function updateCharge(id: string, data: Partial<Charge>) {
  const db = loadDb();
  const idx = db.charges.findIndex((c) => c.id === id);
  if (idx !== -1) {
    db.charges[idx] = { ...db.charges[idx], ...data };
    saveDb(db);
    return db.charges[idx];
  }
  return null;
}

export function deleteCharge(id: string) {
  const db = loadDb();
  db.charges = db.charges.filter((c) => c.id !== id);
  saveDb(db);
}

// Stock
export function getStockByUser(userId: string): (StockItem & { category: Category | null })[] {
  const db = loadDb();
  return db.stockItems
    .filter((i) => i.userId === userId)
    .map((i) => ({ ...i, category: db.stockCategories.find((c) => c.id === i.categoryId) || null }));
}

export function getStockCategories(): Category[] {
  return loadDb().stockCategories;
}

export function createStockItem(data: Omit<StockItem, "id">): StockItem {
  const db = loadDb();
  const item: StockItem = { id: generateId(), ...data };
  db.stockItems.push(item);
  saveDb(db);
  return item;
}

export function updateStockItem(id: string, data: Partial<StockItem>) {
  const db = loadDb();
  const idx = db.stockItems.findIndex((i) => i.id === id);
  if (idx !== -1) {
    db.stockItems[idx] = { ...db.stockItems[idx], ...data };
    saveDb(db);
    return db.stockItems[idx];
  }
  return null;
}

export function deleteStockItem(id: string) {
  const db = loadDb();
  db.stockItems = db.stockItems.filter((i) => i.id !== id);
  saveDb(db);
}

export function addStockMovement(itemId: string, userId: string, type: "IN" | "OUT", quantity: number, comment: string | null) {
  const db = loadDb();
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

  saveDb(db);
  return item;
}

// Settings
export function getUserSettings(userId: string): Settings | undefined {
  return loadDb().settings.find((s) => s.userId === userId);
}

export function updateUserSettings(userId: string, data: Partial<Settings>) {
  const db = loadDb();
  const idx = db.settings.findIndex((s) => s.userId === userId);
  if (idx !== -1) {
    db.settings[idx] = { ...db.settings[idx], ...data };
  } else {
    db.settings.push({ userId, currency: "EUR", monthlyBudget: null, ...data });
  }
  saveDb(db);
}
