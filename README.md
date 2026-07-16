# FOYER

*Le quotidien, en paix.*

PWA familiale : tu ouvres, tu vois ta journée, tu la fermes. Le reste, Gastif s'en charge (phase 2).

**Phase actuelle : 1 — le socle.** Auth multi-membres + RLS testée · Écran Aujourd'hui + Le Fil · Tâches (récurrences RRULE, rotation) · Courses (temps réel, mode magasin, dictée) · PWA installable + hors ligne.

L'architecture complète (arborescence, schéma, choix RLS) est dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Stack

Vite + React 18 + TypeScript strict · Tailwind (tokens CSS) · Framer Motion · Zustand + TanStack Query · Supabase (Auth, Postgres + RLS, Realtime) · Dexie (hors ligne) · date-fns-tz · Zod.

## Mise en route

### 1. Le projet Supabase (une fois)

1. Crée un projet sur [supabase.com](https://supabase.com) (région `eu-west-3` de préférence).
2. **Avant d'appliquer le seed**, édite `supabase/seed.sql` : prénoms des deux adultes et l'email du second (`adulte2@remplacer.fr`).
3. Dans l'éditeur SQL du dashboard (ou `supabase db push` avec la CLI), exécute dans l'ordre :
   - `supabase/migrations/20260716120000_schema.sql`
   - `supabase/migrations/20260716120100_rls.sql`
   - `supabase/seed.sql`
4. Dans **Authentication → Users**, crée un utilisateur par adulte avec **exactement** les emails du seed (mot de passe choisi par chacun). À la première connexion, le compte est relié automatiquement à son membre.

### 2. En local

```bash
cp .env.example .env.local   # renseigner l'URL et la clé anon du projet
npm install
npm run dev
```

### 3. Vercel

Importer le dépôt sur [vercel.com](https://vercel.com) (framework : Vite), et déclarer les deux
variables d'environnement `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`. C'est tout —
`vercel.json` gère le routage SPA.

### 4. Sur iPhone

Ouvrir l'URL dans Safari → Partager → **Sur l'écran d'accueil**. L'app est alors plein écran,
hors ligne, avec son icône. À savoir : les notifications push web n'existent sur iOS (≥ 16.4)
**que** si l'app est installée sur l'écran d'accueil — elles arrivent en phase 3.

## Tests

```bash
npm run typecheck        # TypeScript strict, zéro any
npm run build            # build de production + PWA
bash scripts/tester-rls.sh   # les 37 tests RLS (pgTAP) sur un Postgres jetable
```

Les tests RLS vérifient, rôle par rôle (`adult`, `child`, `guest` actif et expiré), ce que
chaque table laisse voir et écrire — dont le **verrou Père Noël** : idées cadeaux, budgets,
colis, célébrations `magie`, Coffre et journal d'audit sont invisibles au rôle enfant, au
niveau de la base, pas du front. La CI (`.github/workflows/ci.yml`) rejoue tout à chaque commit.

## Ce qui vient ensuite

- **Phase 2 — le cerveau** : Gastif (contexte ~8 000 mots + outils, Edge Function), le Sas, menus → courses, anniversaires + coffre à idées, mode enfant (points, routines).
- **Phase 3 — le monde extérieur** : CalDAV iCloud bidirectionnel (un compte par parent), suivi colis La Poste, Chronodrive V1/V2, push web.
- **Phase 4 — le voyage** : voyages + valise intelligente, le Coffre, mode Nounou, Équilibre.
