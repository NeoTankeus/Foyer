import { hashSync, compareSync } from "bcryptjs";
import { supabase, isSupabaseConfigured } from "./supabase";

// ========================================
// INTERFACES
// ========================================

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

// ========================================
// HELPER FUNCTIONS
// ========================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

// Convert snake_case to camelCase
function toCamelCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = obj[key];
  }
  return result;
}

// Convert camelCase to snake_case
function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    result[snakeKey] = obj[key];
  }
  return result;
}

// ========================================
// USER OPERATIONS
// ========================================

export async function findUserByEmail(email: string): Promise<User | undefined> {
  if (!isSupabaseConfigured()) {
    return getMemoryDb().users.find((u) => u.email === email);
  }

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !data) return undefined;

  return {
    id: data.id,
    email: data.email,
    password: data.password,
    name: data.name,
    role: data.role,
    createdAt: data.created_at,
  };
}

export async function findUserById(id: string): Promise<User | undefined> {
  if (!isSupabaseConfigured()) {
    return getMemoryDb().users.find((u) => u.id === id);
  }

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return undefined;

  return {
    id: data.id,
    email: data.email,
    password: data.password,
    name: data.name,
    role: data.role,
    createdAt: data.created_at,
  };
}

export async function getAllUsers(): Promise<Omit<User, "password">[]> {
  if (!isSupabaseConfigured()) {
    return getMemoryDb().users.map(({ password, ...user }) => user);
  }

  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, role, created_at');

  if (error || !data) return [];

  return data.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    createdAt: u.created_at,
  }));
}

export async function createUser(email: string, password: string, name: string | null, role: "ADMIN" | "TECH"): Promise<User> {
  const id = generateId();
  const hashedPassword = hashSync(password, 10);
  const createdAt = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const db = getMemoryDb();
    const user: User = { id, email, password: hashedPassword, name, role, createdAt };
    db.users.push(user);
    db.settings.push({ userId: id, currency: "EUR", monthlyBudget: null });
    return user;
  }

  const { data, error } = await supabase
    .from('users')
    .insert({ id, email, password: hashedPassword, name, role, created_at: createdAt })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Create default settings
  await supabase.from('settings').insert({ user_id: id, currency: 'EUR', monthly_budget: null });

  return { id: data.id, email: data.email, password: data.password, name: data.name, role: data.role, createdAt: data.created_at };
}

export async function updateUserPassword(userId: string, newPassword: string): Promise<void> {
  const hashedPassword = hashSync(newPassword, 10);

  if (!isSupabaseConfigured()) {
    const user = getMemoryDb().users.find((u) => u.id === userId);
    if (user) user.password = hashedPassword;
    return;
  }

  await supabase.from('users').update({ password: hashedPassword }).eq('id', userId);
}

export async function deleteUser(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    const db = getMemoryDb();
    db.users = db.users.filter((u) => u.id !== userId);
    db.charges = db.charges.filter((c) => c.userId !== userId);
    db.stockItems = db.stockItems.filter((i) => i.userId !== userId);
    db.settings = db.settings.filter((s) => s.userId !== userId);
    return;
  }

  await supabase.from('users').delete().eq('id', userId);
}

export function verifyPassword(user: User, password: string): boolean {
  return compareSync(password, user.password);
}

// ========================================
// CATEGORIES
// ========================================

export async function getAllCategories(): Promise<Category[]> {
  if (!isSupabaseConfigured()) {
    return getMemoryDb().categories;
  }

  const { data, error } = await supabase.from('categories').select('*');
  if (error || !data) return [];
  return data;
}

export async function createCategory(name: string, color: string): Promise<Category> {
  const id = generateId();

  if (!isSupabaseConfigured()) {
    const category: Category = { id, name, color };
    getMemoryDb().categories.push(category);
    return category;
  }

  const { data, error } = await supabase
    .from('categories')
    .insert({ id, name, color })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateCategory(id: string, data: Partial<Category>): Promise<Category | null> {
  if (!isSupabaseConfigured()) {
    const db = getMemoryDb();
    const idx = db.categories.findIndex((c) => c.id === id);
    if (idx !== -1) {
      db.categories[idx] = { ...db.categories[idx], ...data };
      return db.categories[idx];
    }
    return null;
  }

  const { data: updated, error } = await supabase
    .from('categories')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) return null;
  return updated;
}

export async function deleteCategory(id: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    const db = getMemoryDb();
    db.categories = db.categories.filter((c) => c.id !== id);
    return;
  }

  await supabase.from('categories').delete().eq('id', id);
}

// ========================================
// CHARGES
// ========================================

export async function getChargesByUser(userId: string): Promise<(Charge & { category: Category })[]> {
  if (!isSupabaseConfigured()) {
    const db = getMemoryDb();
    return db.charges
      .filter((c) => c.userId === userId)
      .map((c) => ({
        ...c,
        category: db.categories.find((cat) => cat.id === c.categoryId) || { id: "", name: "Inconnu", color: "#999" }
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  const { data, error } = await supabase
    .from('charges')
    .select('*, categories(*)')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (error || !data) return [];

  return data.map(c => ({
    id: c.id,
    userId: c.user_id,
    date: c.date,
    amount: parseFloat(c.amount),
    categoryId: c.category_id,
    supplier: c.supplier,
    paymentMethod: c.payment_method,
    isRecurring: c.is_recurring,
    recurrence: c.recurrence,
    note: c.note,
    category: c.categories || { id: "", name: "Inconnu", color: "#999" }
  }));
}

export async function getChargeById(id: string): Promise<Charge | undefined> {
  if (!isSupabaseConfigured()) {
    return getMemoryDb().charges.find((c) => c.id === id);
  }

  const { data, error } = await supabase
    .from('charges')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return undefined;

  return {
    id: data.id,
    userId: data.user_id,
    date: data.date,
    amount: parseFloat(data.amount),
    categoryId: data.category_id,
    supplier: data.supplier,
    paymentMethod: data.payment_method,
    isRecurring: data.is_recurring,
    recurrence: data.recurrence,
    note: data.note,
  };
}

export async function createCharge(chargeData: Omit<Charge, "id">): Promise<Charge> {
  const id = generateId();

  if (!isSupabaseConfigured()) {
    const charge: Charge = { id, ...chargeData };
    getMemoryDb().charges.push(charge);
    return charge;
  }

  const { data, error } = await supabase
    .from('charges')
    .insert({
      id,
      user_id: chargeData.userId,
      date: chargeData.date,
      amount: chargeData.amount,
      category_id: chargeData.categoryId,
      supplier: chargeData.supplier,
      payment_method: chargeData.paymentMethod,
      is_recurring: chargeData.isRecurring,
      recurrence: chargeData.recurrence,
      note: chargeData.note,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return {
    id: data.id,
    userId: data.user_id,
    date: data.date,
    amount: parseFloat(data.amount),
    categoryId: data.category_id,
    supplier: data.supplier,
    paymentMethod: data.payment_method,
    isRecurring: data.is_recurring,
    recurrence: data.recurrence,
    note: data.note,
  };
}

export async function updateCharge(id: string, chargeData: Partial<Charge>): Promise<Charge | null> {
  if (!isSupabaseConfigured()) {
    const db = getMemoryDb();
    const idx = db.charges.findIndex((c) => c.id === id);
    if (idx !== -1) {
      db.charges[idx] = { ...db.charges[idx], ...chargeData };
      return db.charges[idx];
    }
    return null;
  }

  const updateData: Record<string, unknown> = {};
  if (chargeData.date !== undefined) updateData.date = chargeData.date;
  if (chargeData.amount !== undefined) updateData.amount = chargeData.amount;
  if (chargeData.categoryId !== undefined) updateData.category_id = chargeData.categoryId;
  if (chargeData.supplier !== undefined) updateData.supplier = chargeData.supplier;
  if (chargeData.paymentMethod !== undefined) updateData.payment_method = chargeData.paymentMethod;
  if (chargeData.isRecurring !== undefined) updateData.is_recurring = chargeData.isRecurring;
  if (chargeData.recurrence !== undefined) updateData.recurrence = chargeData.recurrence;
  if (chargeData.note !== undefined) updateData.note = chargeData.note;

  const { data, error } = await supabase
    .from('charges')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    date: data.date,
    amount: parseFloat(data.amount),
    categoryId: data.category_id,
    supplier: data.supplier,
    paymentMethod: data.payment_method,
    isRecurring: data.is_recurring,
    recurrence: data.recurrence,
    note: data.note,
  };
}

export async function deleteCharge(id: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    const db = getMemoryDb();
    const initialLength = db.charges.length;
    db.charges = db.charges.filter((c) => c.id !== id);
    return db.charges.length < initialLength;
  }

  const { error } = await supabase.from('charges').delete().eq('id', id);
  return !error;
}

// ========================================
// STOCK
// ========================================

export async function getStockByUser(userId: string): Promise<(StockItem & { category: Category | null })[]> {
  if (!isSupabaseConfigured()) {
    const db = getMemoryDb();
    return db.stockItems
      .filter((i) => i.userId === userId)
      .map((i) => ({
        ...i,
        category: db.stockCategories.find((c) => c.id === i.categoryId) || null
      }));
  }

  const { data, error } = await supabase
    .from('stock_items')
    .select('*, stock_categories(*)')
    .eq('user_id', userId);

  if (error || !data) return [];

  return data.map(i => ({
    id: i.id,
    userId: i.user_id,
    name: i.name,
    sku: i.sku,
    categoryId: i.category_id,
    quantity: i.quantity,
    alertThreshold: i.alert_threshold,
    purchasePrice: i.purchase_price ? parseFloat(i.purchase_price) : null,
    location: i.location,
    category: i.stock_categories || null
  }));
}

export async function getStockCategories(): Promise<Category[]> {
  if (!isSupabaseConfigured()) {
    return getMemoryDb().stockCategories;
  }

  const { data, error } = await supabase.from('stock_categories').select('*');
  if (error || !data) return [];
  return data;
}

export async function getStockItemById(id: string): Promise<StockItem | undefined> {
  if (!isSupabaseConfigured()) {
    return getMemoryDb().stockItems.find((i) => i.id === id);
  }

  const { data, error } = await supabase
    .from('stock_items')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return undefined;

  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    sku: data.sku,
    categoryId: data.category_id,
    quantity: data.quantity,
    alertThreshold: data.alert_threshold,
    purchasePrice: data.purchase_price ? parseFloat(data.purchase_price) : null,
    location: data.location,
  };
}

export async function createStockItem(itemData: Omit<StockItem, "id">): Promise<StockItem> {
  const id = generateId();

  if (!isSupabaseConfigured()) {
    const item: StockItem = { id, ...itemData };
    getMemoryDb().stockItems.push(item);
    return item;
  }

  const { data, error } = await supabase
    .from('stock_items')
    .insert({
      id,
      user_id: itemData.userId,
      name: itemData.name,
      sku: itemData.sku,
      category_id: itemData.categoryId,
      quantity: itemData.quantity,
      alert_threshold: itemData.alertThreshold,
      purchase_price: itemData.purchasePrice,
      location: itemData.location,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    sku: data.sku,
    categoryId: data.category_id,
    quantity: data.quantity,
    alertThreshold: data.alert_threshold,
    purchasePrice: data.purchase_price ? parseFloat(data.purchase_price) : null,
    location: data.location,
  };
}

export async function updateStockItem(id: string, itemData: Partial<StockItem>): Promise<StockItem | null> {
  if (!isSupabaseConfigured()) {
    const db = getMemoryDb();
    const idx = db.stockItems.findIndex((i) => i.id === id);
    if (idx !== -1) {
      db.stockItems[idx] = { ...db.stockItems[idx], ...itemData };
      return db.stockItems[idx];
    }
    return null;
  }

  const updateData: Record<string, unknown> = {};
  if (itemData.name !== undefined) updateData.name = itemData.name;
  if (itemData.sku !== undefined) updateData.sku = itemData.sku;
  if (itemData.categoryId !== undefined) updateData.category_id = itemData.categoryId;
  if (itemData.quantity !== undefined) updateData.quantity = itemData.quantity;
  if (itemData.alertThreshold !== undefined) updateData.alert_threshold = itemData.alertThreshold;
  if (itemData.purchasePrice !== undefined) updateData.purchase_price = itemData.purchasePrice;
  if (itemData.location !== undefined) updateData.location = itemData.location;

  const { data, error } = await supabase
    .from('stock_items')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    sku: data.sku,
    categoryId: data.category_id,
    quantity: data.quantity,
    alertThreshold: data.alert_threshold,
    purchasePrice: data.purchase_price ? parseFloat(data.purchase_price) : null,
    location: data.location,
  };
}

export async function deleteStockItem(id: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    const db = getMemoryDb();
    const initialLength = db.stockItems.length;
    db.stockItems = db.stockItems.filter((i) => i.id !== id);
    return db.stockItems.length < initialLength;
  }

  const { error } = await supabase.from('stock_items').delete().eq('id', id);
  return !error;
}

export async function addStockMovement(itemId: string, userId: string, type: "IN" | "OUT", quantity: number, comment: string | null): Promise<StockItem | null> {
  if (!isSupabaseConfigured()) {
    const db = getMemoryDb();
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

  // Get current item
  const { data: item, error: itemError } = await supabase
    .from('stock_items')
    .select('*')
    .eq('id', itemId)
    .single();

  if (itemError || !item) return null;

  const newQuantity = type === "IN"
    ? item.quantity + quantity
    : Math.max(0, item.quantity - quantity);

  // Update quantity
  await supabase.from('stock_items').update({ quantity: newQuantity }).eq('id', itemId);

  // Record movement
  await supabase.from('stock_movements').insert({
    id: generateId(),
    user_id: userId,
    item_id: itemId,
    type,
    quantity,
    date: new Date().toISOString(),
    comment,
  });

  return {
    id: item.id,
    userId: item.user_id,
    name: item.name,
    sku: item.sku,
    categoryId: item.category_id,
    quantity: newQuantity,
    alertThreshold: item.alert_threshold,
    purchasePrice: item.purchase_price ? parseFloat(item.purchase_price) : null,
    location: item.location,
  };
}

export async function createStockCategory(name: string, color: string): Promise<Category> {
  const id = generateId();

  if (!isSupabaseConfigured()) {
    const category: Category = { id, name, color };
    getMemoryDb().stockCategories.push(category);
    return category;
  }

  const { data, error } = await supabase
    .from('stock_categories')
    .insert({ id, name, color })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteStockCategory(id: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    const db = getMemoryDb();
    db.stockCategories = db.stockCategories.filter((c) => c.id !== id);
    return;
  }

  await supabase.from('stock_categories').delete().eq('id', id);
}

// ========================================
// SETTINGS
// ========================================

export async function getUserSettings(userId: string): Promise<Settings | undefined> {
  if (!isSupabaseConfigured()) {
    return getMemoryDb().settings.find((s) => s.userId === userId);
  }

  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return undefined;

  return {
    userId: data.user_id,
    currency: data.currency,
    monthlyBudget: data.monthly_budget ? parseFloat(data.monthly_budget) : null,
  };
}

export async function updateUserSettings(userId: string, settingsData: Partial<Settings>): Promise<void> {
  if (!isSupabaseConfigured()) {
    const db = getMemoryDb();
    const idx = db.settings.findIndex((s) => s.userId === userId);
    if (idx !== -1) {
      db.settings[idx] = { ...db.settings[idx], ...settingsData };
    } else {
      db.settings.push({ userId, currency: "EUR", monthlyBudget: null, ...settingsData });
    }
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (settingsData.currency !== undefined) updateData.currency = settingsData.currency;
  if (settingsData.monthlyBudget !== undefined) updateData.monthly_budget = settingsData.monthlyBudget;

  const { error } = await supabase
    .from('settings')
    .upsert({ user_id: userId, ...updateData })
    .eq('user_id', userId);

  if (error) console.error('Error updating settings:', error);
}

// ========================================
// IN-MEMORY FALLBACK DATABASE
// ========================================

interface Database {
  users: User[];
  categories: Category[];
  charges: Charge[];
  stockItems: StockItem[];
  stockMovements: StockMovement[];
  stockCategories: Category[];
  settings: Settings[];
}

declare global {
  // eslint-disable-next-line no-var
  var __db: Database | undefined;
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

  return {
    users: [
      {
        id: adminId,
        email: "admin",
        password: hashSync("admin123", 10),
        name: "Administrateur",
        role: "ADMIN",
        createdAt: new Date().toISOString(),
      },
    ],
    categories,
    charges: [],
    stockItems: [],
    stockMovements: [],
    stockCategories,
    settings: [
      { userId: adminId, currency: "EUR", monthlyBudget: 15000 },
    ],
  };
}

function getMemoryDb(): Database {
  if (!global.__db) {
    console.log("[DB] Initialisation de la base de données en mémoire (fallback)");
    global.__db = createDefaultData();
  }
  return global.__db;
}

export function resetDatabase(): void {
  global.__db = createDefaultData();
}

export function getDatabaseStats(): { supabase: boolean } {
  return { supabase: isSupabaseConfigured() };
}
