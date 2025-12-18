-- COPIE CE SCRIPT DANS: https://supabase.com/dashboard/project/jeiezgjvlsjygqypbtoe/sql/new
-- PUIS CLIQUE "Run"

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'TECH',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS charges (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  category_id TEXT REFERENCES categories(id),
  supplier TEXT,
  payment_method TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS stock_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_items (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  category_id TEXT REFERENCES stock_categories(id),
  quantity INTEGER DEFAULT 0,
  alert_threshold INTEGER,
  purchase_price DECIMAL(12,2),
  location TEXT
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES stock_items(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW(),
  comment TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  currency TEXT DEFAULT 'EUR',
  monthly_budget DECIMAL(12,2)
);

-- Admin: admin / admin123
INSERT INTO users (id, email, password, name, role) VALUES
('admin001', 'admin', '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqrqIuQJ0ZzJGNOZ7v8F1Fq0NjhV1Hy', 'Administrateur', 'ADMIN')
ON CONFLICT (id) DO NOTHING;

INSERT INTO settings (user_id, currency) VALUES ('admin001', 'EUR')
ON CONFLICT (user_id) DO NOTHING;
