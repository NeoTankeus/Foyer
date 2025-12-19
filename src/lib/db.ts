import { hashSync, compareSync } from "bcryptjs";
import { supabase, isSupabaseReady } from "./supabase";

// ========================================
// TYPES
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
// HELPERS
// ========================================

function genId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function logError(fn: string, error: unknown): void {
  console.error(`[DB Error] ${fn}:`, error);
}

// ========================================
// USERS
// ========================================

export async function findUserByEmail(email: string): Promise<User | undefined> {
  if (!isSupabaseReady()) {
    return memDb().users.find(u => u.email === email);
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data) {
      return memDb().users.find(u => u.email === email);
    }
    return { id: data.id, email: data.email, password: data.password, name: data.name, role: data.role, createdAt: data.created_at };
  } catch (e) {
    logError('findUserByEmail', e);
    return memDb().users.find(u => u.email === email);
  }
}

export async function findUserById(id: string): Promise<User | undefined> {
  if (!isSupabaseReady()) {
    return memDb().users.find(u => u.id === id);
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return memDb().users.find(u => u.id === id);
    }
    return { id: data.id, email: data.email, password: data.password, name: data.name, role: data.role, createdAt: data.created_at };
  } catch (e) {
    logError('findUserById', e);
    return memDb().users.find(u => u.id === id);
  }
}

export async function getAllUsers(): Promise<Omit<User, "password">[]> {
  if (!isSupabaseReady()) {
    return memDb().users.map(({ password, ...u }) => u);
  }

  try {
    const { data, error } = await supabase.from('users').select('id, email, name, role, created_at');
    if (error || !data) {
      return memDb().users.map(({ password, ...u }) => u);
    }
    return data.map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.created_at }));
  } catch (e) {
    logError('getAllUsers', e);
    return memDb().users.map(({ password, ...u }) => u);
  }
}

export async function createUser(email: string, password: string, name: string | null, role: "ADMIN" | "TECH"): Promise<User> {
  const id = genId();
  const hash = hashSync(password, 10);
  const createdAt = new Date().toISOString();
  const user: User = { id, email, password: hash, name, role, createdAt };

  if (!isSupabaseReady()) {
    memDb().users.push(user);
    memDb().settings.push({ userId: id, currency: "EUR", monthlyBudget: null });
    return user;
  }

  try {
    const { error } = await supabase.from('users').insert({ id, email, password: hash, name, role, created_at: createdAt });
    if (error) throw error;
    await supabase.from('settings').insert({ user_id: id, currency: 'EUR', monthly_budget: null });
    return user;
  } catch (e) {
    logError('createUser', e);
    memDb().users.push(user);
    memDb().settings.push({ userId: id, currency: "EUR", monthlyBudget: null });
    return user;
  }
}

export async function updateUserPassword(userId: string, newPassword: string): Promise<void> {
  const hash = hashSync(newPassword, 10);

  if (!isSupabaseReady()) {
    const user = memDb().users.find(u => u.id === userId);
    if (user) user.password = hash;
    return;
  }

  try {
    const { error } = await supabase.from('users').update({ password: hash }).eq('id', userId);
    if (error) throw error;
  } catch (e) {
    logError('updateUserPassword', e);
    const user = memDb().users.find(u => u.id === userId);
    if (user) user.password = hash;
  }
}

export async function deleteUser(userId: string): Promise<void> {
  if (!isSupabaseReady()) {
    const db = memDb();
    db.users = db.users.filter(u => u.id !== userId);
    db.charges = db.charges.filter(c => c.userId !== userId);
    db.stockItems = db.stockItems.filter(i => i.userId !== userId);
    db.settings = db.settings.filter(s => s.userId !== userId);
    return;
  }

  try {
    const { error } = await supabase.from('users').delete().eq('id', userId);
    if (error) throw error;
  } catch (e) {
    logError('deleteUser', e);
    const db = memDb();
    db.users = db.users.filter(u => u.id !== userId);
    db.charges = db.charges.filter(c => c.userId !== userId);
    db.stockItems = db.stockItems.filter(i => i.userId !== userId);
    db.settings = db.settings.filter(s => s.userId !== userId);
  }
}

export function verifyPassword(user: User, password: string): boolean {
  return compareSync(password, user.password);
}

// ========================================
// CATEGORIES
// ========================================

export async function getAllCategories(): Promise<Category[]> {
  if (!isSupabaseReady()) {
    return memDb().categories;
  }

  try {
    const { data, error } = await supabase.from('categories').select('*').order('name');
    if (error || !data) {
      return memDb().categories;
    }
    return data;
  } catch (e) {
    logError('getAllCategories', e);
    return memDb().categories;
  }
}

export async function createCategory(name: string, color: string): Promise<Category> {
  const id = genId();
  const cat: Category = { id, name, color };

  if (!isSupabaseReady()) {
    memDb().categories.push(cat);
    return cat;
  }

  try {
    const { error } = await supabase.from('categories').insert({ id, name, color });
    if (error) throw error;
    return cat;
  } catch (e) {
    logError('createCategory', e);
    memDb().categories.push(cat);
    return cat;
  }
}

export async function deleteCategory(id: string): Promise<void> {
  if (!isSupabaseReady()) {
    memDb().categories = memDb().categories.filter(c => c.id !== id);
    return;
  }

  try {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw error;
  } catch (e) {
    logError('deleteCategory', e);
    memDb().categories = memDb().categories.filter(c => c.id !== id);
  }
}

// ========================================
// CHARGES
// ========================================

export async function getChargesByUser(userId: string): Promise<(Charge & { category: Category })[]> {
  if (!isSupabaseReady()) {
    const db = memDb();
    return db.charges
      .filter(c => c.userId === userId)
      .map(c => ({
        ...c,
        category: db.categories.find(cat => cat.id === c.categoryId) || { id: "", name: "?", color: "#999" }
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  try {
    const { data, error } = await supabase
      .from('charges')
      .select('*, categories(*)')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (error || !data) {
      const db = memDb();
      return db.charges
        .filter(c => c.userId === userId)
        .map(c => ({
          ...c,
          category: db.categories.find(cat => cat.id === c.categoryId) || { id: "", name: "?", color: "#999" }
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    return data.map(c => ({
      id: c.id,
      userId: c.user_id,
      date: c.date,
      amount: Number(c.amount),
      categoryId: c.category_id,
      supplier: c.supplier,
      paymentMethod: c.payment_method,
      isRecurring: c.is_recurring,
      recurrence: c.recurrence,
      note: c.note,
      category: c.categories || { id: "", name: "?", color: "#999" }
    }));
  } catch (e) {
    logError('getChargesByUser', e);
    const db = memDb();
    return db.charges
      .filter(c => c.userId === userId)
      .map(c => ({
        ...c,
        category: db.categories.find(cat => cat.id === c.categoryId) || { id: "", name: "?", color: "#999" }
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
}

export async function createCharge(data: Omit<Charge, "id">): Promise<Charge> {
  const id = genId();
  const charge: Charge = { id, ...data };

  if (!isSupabaseReady()) {
    memDb().charges.push(charge);
    return charge;
  }

  try {
    const { error } = await supabase.from('charges').insert({
      id,
      user_id: data.userId,
      date: data.date,
      amount: data.amount,
      category_id: data.categoryId,
      supplier: data.supplier,
      payment_method: data.paymentMethod,
      is_recurring: data.isRecurring,
      recurrence: data.recurrence,
      note: data.note,
    });
    if (error) throw error;
    return charge;
  } catch (e) {
    logError('createCharge', e);
    memDb().charges.push(charge);
    return charge;
  }
}

export async function updateCharge(id: string, data: Partial<Charge>): Promise<Charge | null> {
  if (!isSupabaseReady()) {
    const db = memDb();
    const idx = db.charges.findIndex(c => c.id === id);
    if (idx === -1) return null;
    db.charges[idx] = { ...db.charges[idx], ...data };
    return db.charges[idx];
  }

  try {
    const updates: Record<string, unknown> = {};
    if (data.date !== undefined) updates.date = data.date;
    if (data.amount !== undefined) updates.amount = data.amount;
    if (data.categoryId !== undefined) updates.category_id = data.categoryId;
    if (data.supplier !== undefined) updates.supplier = data.supplier;
    if (data.paymentMethod !== undefined) updates.payment_method = data.paymentMethod;
    if (data.isRecurring !== undefined) updates.is_recurring = data.isRecurring;
    if (data.recurrence !== undefined) updates.recurrence = data.recurrence;
    if (data.note !== undefined) updates.note = data.note;

    const { data: updated, error } = await supabase
      .from('charges')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !updated) {
      const db = memDb();
      const idx = db.charges.findIndex(c => c.id === id);
      if (idx === -1) return null;
      db.charges[idx] = { ...db.charges[idx], ...data };
      return db.charges[idx];
    }

    return {
      id: updated.id,
      userId: updated.user_id,
      date: updated.date,
      amount: Number(updated.amount),
      categoryId: updated.category_id,
      supplier: updated.supplier,
      paymentMethod: updated.payment_method,
      isRecurring: updated.is_recurring,
      recurrence: updated.recurrence,
      note: updated.note,
    };
  } catch (e) {
    logError('updateCharge', e);
    const db = memDb();
    const idx = db.charges.findIndex(c => c.id === id);
    if (idx === -1) return null;
    db.charges[idx] = { ...db.charges[idx], ...data };
    return db.charges[idx];
  }
}

export async function deleteCharge(id: string): Promise<boolean> {
  if (!isSupabaseReady()) {
    const db = memDb();
    const len = db.charges.length;
    db.charges = db.charges.filter(c => c.id !== id);
    return db.charges.length < len;
  }

  try {
    const { error } = await supabase.from('charges').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    logError('deleteCharge', e);
    const db = memDb();
    const len = db.charges.length;
    db.charges = db.charges.filter(c => c.id !== id);
    return db.charges.length < len;
  }
}

// ========================================
// STOCK
// ========================================

export async function getStockByUser(userId: string): Promise<(StockItem & { category: Category | null })[]> {
  if (!isSupabaseReady()) {
    const db = memDb();
    return db.stockItems
      .filter(i => i.userId === userId)
      .map(i => ({ ...i, category: db.stockCategories.find(c => c.id === i.categoryId) || null }));
  }

  try {
    const { data, error } = await supabase
      .from('stock_items')
      .select('*, stock_categories(*)')
      .eq('user_id', userId);

    if (error || !data) {
      const db = memDb();
      return db.stockItems
        .filter(i => i.userId === userId)
        .map(i => ({ ...i, category: db.stockCategories.find(c => c.id === i.categoryId) || null }));
    }

    return data.map(i => ({
      id: i.id,
      userId: i.user_id,
      name: i.name,
      sku: i.sku,
      categoryId: i.category_id,
      quantity: i.quantity,
      alertThreshold: i.alert_threshold,
      purchasePrice: i.purchase_price ? Number(i.purchase_price) : null,
      location: i.location,
      category: i.stock_categories || null
    }));
  } catch (e) {
    logError('getStockByUser', e);
    const db = memDb();
    return db.stockItems
      .filter(i => i.userId === userId)
      .map(i => ({ ...i, category: db.stockCategories.find(c => c.id === i.categoryId) || null }));
  }
}

export async function getStockCategories(): Promise<Category[]> {
  if (!isSupabaseReady()) {
    return memDb().stockCategories;
  }

  try {
    const { data, error } = await supabase.from('stock_categories').select('*').order('name');
    if (error || !data) {
      return memDb().stockCategories;
    }
    return data;
  } catch (e) {
    logError('getStockCategories', e);
    return memDb().stockCategories;
  }
}

export async function createStockItem(data: Omit<StockItem, "id">): Promise<StockItem> {
  const id = genId();
  const item: StockItem = { id, ...data };

  if (!isSupabaseReady()) {
    memDb().stockItems.push(item);
    return item;
  }

  try {
    const { error } = await supabase.from('stock_items').insert({
      id,
      user_id: data.userId,
      name: data.name,
      sku: data.sku,
      category_id: data.categoryId,
      quantity: data.quantity,
      alert_threshold: data.alertThreshold,
      purchase_price: data.purchasePrice,
      location: data.location,
    });
    if (error) throw error;
    return item;
  } catch (e) {
    logError('createStockItem', e);
    memDb().stockItems.push(item);
    return item;
  }
}

export async function updateStockItem(id: string, data: Partial<StockItem>): Promise<StockItem | null> {
  if (!isSupabaseReady()) {
    const db = memDb();
    const idx = db.stockItems.findIndex(i => i.id === id);
    if (idx === -1) return null;
    db.stockItems[idx] = { ...db.stockItems[idx], ...data };
    return db.stockItems[idx];
  }

  try {
    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.sku !== undefined) updates.sku = data.sku;
    if (data.categoryId !== undefined) updates.category_id = data.categoryId;
    if (data.quantity !== undefined) updates.quantity = data.quantity;
    if (data.alertThreshold !== undefined) updates.alert_threshold = data.alertThreshold;
    if (data.purchasePrice !== undefined) updates.purchase_price = data.purchasePrice;
    if (data.location !== undefined) updates.location = data.location;

    const { data: updated, error } = await supabase
      .from('stock_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !updated) {
      const db = memDb();
      const idx = db.stockItems.findIndex(i => i.id === id);
      if (idx === -1) return null;
      db.stockItems[idx] = { ...db.stockItems[idx], ...data };
      return db.stockItems[idx];
    }

    return {
      id: updated.id,
      userId: updated.user_id,
      name: updated.name,
      sku: updated.sku,
      categoryId: updated.category_id,
      quantity: updated.quantity,
      alertThreshold: updated.alert_threshold,
      purchasePrice: updated.purchase_price ? Number(updated.purchase_price) : null,
      location: updated.location,
    };
  } catch (e) {
    logError('updateStockItem', e);
    const db = memDb();
    const idx = db.stockItems.findIndex(i => i.id === id);
    if (idx === -1) return null;
    db.stockItems[idx] = { ...db.stockItems[idx], ...data };
    return db.stockItems[idx];
  }
}

export async function deleteStockItem(id: string): Promise<boolean> {
  if (!isSupabaseReady()) {
    const db = memDb();
    const len = db.stockItems.length;
    db.stockItems = db.stockItems.filter(i => i.id !== id);
    return db.stockItems.length < len;
  }

  try {
    const { error } = await supabase.from('stock_items').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    logError('deleteStockItem', e);
    const db = memDb();
    const len = db.stockItems.length;
    db.stockItems = db.stockItems.filter(i => i.id !== id);
    return db.stockItems.length < len;
  }
}

export async function addStockMovement(itemId: string, userId: string, type: "IN" | "OUT", quantity: number, comment: string | null): Promise<StockItem | null> {
  if (!isSupabaseReady()) {
    const db = memDb();
    const item = db.stockItems.find(i => i.id === itemId);
    if (!item) return null;
    item.quantity = type === "IN" ? item.quantity + quantity : Math.max(0, item.quantity - quantity);
    db.stockMovements.push({ id: genId(), userId, itemId, type, quantity, date: new Date().toISOString(), comment });
    return item;
  }

  try {
    const { data: item, error: fetchError } = await supabase.from('stock_items').select('*').eq('id', itemId).single();
    if (fetchError || !item) {
      const db = memDb();
      const memItem = db.stockItems.find(i => i.id === itemId);
      if (!memItem) return null;
      memItem.quantity = type === "IN" ? memItem.quantity + quantity : Math.max(0, memItem.quantity - quantity);
      db.stockMovements.push({ id: genId(), userId, itemId, type, quantity, date: new Date().toISOString(), comment });
      return memItem;
    }

    const newQty = type === "IN" ? item.quantity + quantity : Math.max(0, item.quantity - quantity);
    await supabase.from('stock_items').update({ quantity: newQty }).eq('id', itemId);
    await supabase.from('stock_movements').insert({ id: genId(), user_id: userId, item_id: itemId, type, quantity, comment });

    return { id: item.id, userId: item.user_id, name: item.name, sku: item.sku, categoryId: item.category_id, quantity: newQty, alertThreshold: item.alert_threshold, purchasePrice: item.purchase_price, location: item.location };
  } catch (e) {
    logError('addStockMovement', e);
    const db = memDb();
    const memItem = db.stockItems.find(i => i.id === itemId);
    if (!memItem) return null;
    memItem.quantity = type === "IN" ? memItem.quantity + quantity : Math.max(0, memItem.quantity - quantity);
    db.stockMovements.push({ id: genId(), userId, itemId, type, quantity, date: new Date().toISOString(), comment });
    return memItem;
  }
}

export async function createStockCategory(name: string, color: string): Promise<Category> {
  const id = genId();
  const cat: Category = { id, name, color };

  if (!isSupabaseReady()) {
    memDb().stockCategories.push(cat);
    return cat;
  }

  try {
    const { error } = await supabase.from('stock_categories').insert({ id, name, color });
    if (error) throw error;
    return cat;
  } catch (e) {
    logError('createStockCategory', e);
    memDb().stockCategories.push(cat);
    return cat;
  }
}

export async function deleteStockCategory(id: string): Promise<void> {
  if (!isSupabaseReady()) {
    memDb().stockCategories = memDb().stockCategories.filter(c => c.id !== id);
    return;
  }

  try {
    const { error } = await supabase.from('stock_categories').delete().eq('id', id);
    if (error) throw error;
  } catch (e) {
    logError('deleteStockCategory', e);
    memDb().stockCategories = memDb().stockCategories.filter(c => c.id !== id);
  }
}

// ========================================
// SETTINGS
// ========================================

export async function getUserSettings(userId: string): Promise<Settings | undefined> {
  if (!isSupabaseReady()) {
    return memDb().settings.find(s => s.userId === userId);
  }

  try {
    const { data, error } = await supabase.from('settings').select('*').eq('user_id', userId).single();
    if (error || !data) {
      return memDb().settings.find(s => s.userId === userId);
    }
    return { userId: data.user_id, currency: data.currency, monthlyBudget: data.monthly_budget ? Number(data.monthly_budget) : null };
  } catch (e) {
    logError('getUserSettings', e);
    return memDb().settings.find(s => s.userId === userId);
  }
}

export async function updateUserSettings(userId: string, data: Partial<Settings>): Promise<void> {
  if (!isSupabaseReady()) {
    const db = memDb();
    const idx = db.settings.findIndex(s => s.userId === userId);
    if (idx !== -1) {
      db.settings[idx] = { ...db.settings[idx], ...data };
    } else {
      db.settings.push({ userId, currency: "EUR", monthlyBudget: null, ...data });
    }
    return;
  }

  try {
    const updates: Record<string, unknown> = { user_id: userId };
    if (data.currency !== undefined) updates.currency = data.currency;
    if (data.monthlyBudget !== undefined) updates.monthly_budget = data.monthlyBudget;

    const { error } = await supabase.from('settings').upsert(updates);
    if (error) throw error;
  } catch (e) {
    logError('updateUserSettings', e);
    const db = memDb();
    const idx = db.settings.findIndex(s => s.userId === userId);
    if (idx !== -1) {
      db.settings[idx] = { ...db.settings[idx], ...data };
    } else {
      db.settings.push({ userId, currency: "EUR", monthlyBudget: null, ...data });
    }
  }
}

// ========================================
// IN-MEMORY DATABASE (VIDE PAR DEFAUT)
// ========================================

interface MemoryDB {
  users: User[];
  categories: Category[];
  charges: Charge[];
  stockItems: StockItem[];
  stockMovements: StockMovement[];
  stockCategories: Category[];
  settings: Settings[];
}

declare global {
  var __memdb: MemoryDB | undefined;
}

function memDb(): MemoryDB {
  if (!global.__memdb) {
    global.__memdb = {
      users: [{
        id: "admin001",
        email: "admin",
        password: hashSync("admin123", 10),
        name: "Administrateur",
        role: "ADMIN",
        createdAt: new Date().toISOString(),
      }],
      categories: [],
      charges: [],
      stockItems: [],
      stockMovements: [],
      stockCategories: [],
      settings: [{ userId: "admin001", currency: "EUR", monthlyBudget: null }],
    };
  }
  return global.__memdb;
}

export function resetDatabase(): void {
  global.__memdb = undefined;
}
