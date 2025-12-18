-- =============================================
-- SCHEMA SUPABASE POUR BUSINESS DASHBOARD
-- =============================================
-- Execute ce script dans: Supabase Dashboard > SQL Editor > New Query

-- Table des utilisateurs
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'TECH' CHECK (role IN ('ADMIN', 'TECH')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table des catégories de charges
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b'
);

-- Table des charges
CREATE TABLE IF NOT EXISTS charges (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  supplier TEXT,
  payment_method TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence TEXT CHECK (recurrence IN ('monthly', 'quarterly', 'yearly')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table des catégories de stock
CREATE TABLE IF NOT EXISTS stock_categories (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b'
);

-- Table des articles en stock
CREATE TABLE IF NOT EXISTS stock_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  category_id TEXT REFERENCES stock_categories(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  alert_threshold INTEGER,
  purchase_price DECIMAL(12,2),
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table des mouvements de stock
CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('IN', 'OUT')),
  quantity INTEGER NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW(),
  comment TEXT
);

-- Table des paramètres utilisateur
CREATE TABLE IF NOT EXISTS settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  currency TEXT DEFAULT 'EUR',
  monthly_budget DECIMAL(12,2)
);

-- =============================================
-- DONNEES INITIALES
-- =============================================

-- Utilisateur admin (mot de passe: admin123)
-- Hash bcrypt pour "admin123"
INSERT INTO users (id, email, password, name, role) VALUES
('admin001', 'admin', '$2a$10$rIC/5H8J8sV6WxC8V8Tq2OJh8ZxV8qJ8H8V8Tq2OJh8ZxV8qJ8H8V', 'Administrateur', 'ADMIN')
ON CONFLICT (id) DO NOTHING;

-- Catégories de charges
INSERT INTO categories (id, name, color) VALUES
('cat001', 'Loyer', '#ef4444'),
('cat002', 'Électricité', '#f59e0b'),
('cat003', 'Internet', '#06b6d4'),
('cat004', 'Salaires', '#8b5cf6'),
('cat005', 'Fournitures', '#10b981'),
('cat006', 'Transport', '#ec4899'),
('cat007', 'Marketing', '#6366f1'),
('cat008', 'Divers', '#64748b')
ON CONFLICT (id) DO NOTHING;

-- Catégories de stock
INSERT INTO stock_categories (id, name, color) VALUES
('scat001', 'Électronique', '#3b82f6'),
('scat002', 'Mobilier', '#a855f7'),
('scat003', 'Consommables', '#22c55e')
ON CONFLICT (id) DO NOTHING;

-- Paramètres admin
INSERT INTO settings (user_id, currency, monthly_budget) VALUES
('admin001', 'EUR', 15000)
ON CONFLICT (user_id) DO NOTHING;

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_charges_user_id ON charges(user_id);
CREATE INDEX IF NOT EXISTS idx_charges_date ON charges(date);
CREATE INDEX IF NOT EXISTS idx_stock_items_user_id ON stock_items(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item_id ON stock_movements(item_id);
