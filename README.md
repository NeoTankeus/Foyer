# Business Dashboard

Un tableau de bord d'entreprise moderne et professionnel pour le suivi des charges et la gestion de stock. Application web PWA installable sur mobile (iPhone, Android) et desktop.

## Fonctionnalités

### Module Charges
- **CRUD complet** : Ajouter, modifier, supprimer des charges
- **Catégorisation** : Catégories personnalisables avec couleurs
- **Charges récurrentes** : Support mensuel, trimestriel, annuel
- **Dashboard** :
  - Total mois courant vs précédent avec variation
  - Top 5 catégories
  - Alerte dépassement budget
- **Graphiques** :
  - Histogramme des 12 derniers mois
  - Camembert par catégorie
  - Courbe cumulée du mois
- **Filtres** : Par période, catégorie, fournisseur
- **Export CSV**

### Module Stock
- **CRUD articles** : Nom, SKU, catégorie, prix, emplacement
- **Mouvements** : Entrées/sorties avec historique
- **Alertes** : Stock sous seuil
- **Export PDF** : Inventaire détaillé

### Authentification & Sécurité
- Login email/mot de passe
- Mots de passe hashés (bcrypt)
- Sessions JWT sécurisées
- 2 rôles : Admin (complet) / Tech (lecture seule)
- Validation Zod client/serveur

### PWA
- Installable sur iPhone (Add to Home Screen)
- Offline minimal (app shell en cache)
- Notifications (optionnel)

---

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Framework | Next.js 14 (App Router) |
| Langage | TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Graphiques | Recharts |
| Auth | NextAuth.js v5 |
| Base de données | SQLite (dev) / PostgreSQL (prod) |
| ORM | Prisma |
| Validation | Zod |
| PWA | Serwist |
| Déploiement | Vercel |
| CI/CD | GitHub Actions |

---

## Installation locale

### Prérequis
- Node.js 20+
- npm ou pnpm

### Étapes

1. **Cloner le repository**
```bash
git clone <repo-url>
cd business-dashboard
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configurer les variables d'environnement**
```bash
cp .env.example .env
```

Modifier `.env` si nécessaire :
```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="votre-secret-genere-avec-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"
```

4. **Initialiser la base de données**
```bash
# Créer les tables
npm run db:push

# Peupler avec les données de démo
npm run db:seed
```

5. **Lancer le serveur de développement**
```bash
npm run dev
```

6. **Accéder à l'application**
- URL : http://localhost:3000
- Compte admin : `admin@demo.com` / `admin123`
- Compte tech : `tech@demo.com` / `admin123`

---

## Variables d'environnement

| Variable | Description | Exemple |
|----------|-------------|---------|
| `DATABASE_URL` | URL de connexion à la base de données | `file:./dev.db` ou `postgresql://...` |
| `AUTH_SECRET` | Secret pour les sessions (générer avec `openssl rand -base64 32`) | `abc123...` |
| `NEXTAUTH_URL` | URL de base de l'application | `http://localhost:3000` |
| `DEFAULT_CURRENCY` | Devise par défaut | `EUR` |
| `DEFAULT_LOCALE` | Locale pour les dates | `fr-FR` |

---

## Scripts disponibles

```bash
# Développement
npm run dev          # Serveur de développement
npm run build        # Build de production
npm run start        # Démarrer en production

# Qualité de code
npm run lint         # ESLint
npm run lint:fix     # ESLint avec corrections
npm run typecheck    # Vérification TypeScript
npm run test         # Tests unitaires

# Base de données
npm run db:generate  # Générer le client Prisma
npm run db:push      # Pousser le schéma (dev)
npm run db:migrate   # Créer une migration
npm run db:seed      # Peupler avec données de démo
npm run db:studio    # Interface graphique Prisma
```

---

## Déploiement

### Vercel (recommandé)

1. **Connecter le repository à Vercel**
   - Aller sur [vercel.com](https://vercel.com)
   - Importer le projet depuis GitHub

2. **Configurer les variables d'environnement**
   - `DATABASE_URL` : URL PostgreSQL (Vercel Postgres, Supabase, Neon...)
   - `AUTH_SECRET` : Secret généré
   - Vercel configure automatiquement `AUTH_URL`

3. **Déployer**
   - Le déploiement est automatique à chaque push sur `main`

### CI/CD avec GitHub Actions

Le workflow `.github/workflows/ci-cd.yml` inclut :
- **Lint & TypeCheck** : Vérifie le code
- **Tests** : Lance les tests
- **Build** : Vérifie la compilation
- **Deploy** : Déploie sur Vercel (production sur `main`, preview sur PR)

**Configuration requise** (GitHub Secrets) :
- `VERCEL_TOKEN` : Token Vercel (Settings > Tokens)
- `VERCEL_ORG_ID` : ID de l'organisation
- `VERCEL_PROJECT_ID` : ID du projet

---

## Architecture

```
├── .github/
│   └── workflows/
│       └── ci-cd.yml          # Pipeline CI/CD
├── prisma/
│   ├── schema.prisma          # Schéma de la base de données
│   └── seed.ts                # Données de démonstration
├── public/
│   ├── manifest.json          # Manifest PWA
│   └── icons/                 # Icônes PWA
├── src/
│   ├── app/
│   │   ├── (auth)/            # Pages d'authentification
│   │   │   └── login/
│   │   ├── (dashboard)/       # Pages protégées
│   │   │   ├── charges/
│   │   │   ├── stock/
│   │   │   └── settings/
│   │   ├── api/               # API Routes
│   │   │   ├── auth/
│   │   │   ├── charges/
│   │   │   ├── stock/
│   │   │   ├── categories/
│   │   │   └── settings/
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                # Composants shadcn/ui
│   │   ├── charges/           # Composants module charges
│   │   ├── stock/             # Composants module stock
│   │   ├── charts/            # Graphiques Recharts
│   │   ├── layout/            # Navigation, sidebar
│   │   └── providers/         # Providers React
│   ├── lib/
│   │   ├── prisma.ts          # Client Prisma
│   │   ├── auth.ts            # Configuration NextAuth
│   │   ├── validations.ts     # Schémas Zod
│   │   └── utils.ts           # Utilitaires
│   ├── hooks/                 # Hooks React personnalisés
│   ├── types/                 # Types TypeScript
│   └── sw.ts                  # Service Worker PWA
├── .env.example
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Sauvegarde de la base de données

### SQLite (développement)
Le fichier `prisma/dev.db` contient toutes les données. Copier ce fichier pour sauvegarder.

### PostgreSQL (production)

**Backup manuel :**
```bash
pg_dump -h <host> -U <user> -d <database> > backup.sql
```

**Restauration :**
```bash
psql -h <host> -U <user> -d <database> < backup.sql
```

**Recommandations :**
- Utiliser les backups automatiques du provider (Vercel Postgres, Supabase, etc.)
- Configurer des backups quotidiens
- Tester régulièrement la restauration

---

## Plan d'évolution (V2)

### Fonctionnalités prévues
- [ ] **Multi-sociétés** : Gérer plusieurs entreprises
- [ ] **Multi-utilisateurs** : Équipes avec permissions granulaires
- [ ] **OCR factures** : Scan et extraction automatique des données
- [ ] **Rapports avancés** : Export Excel, rapports personnalisés
- [ ] **Intégrations** : Quickbooks, Xero, bancaires
- [ ] **Notifications** : Email/push pour alertes stock et budget
- [ ] **Historique complet** : Audit trail détaillé
- [ ] **API publique** : REST/GraphQL pour intégrations tierces
- [ ] **Mode hors-ligne avancé** : Synchronisation différée
- [ ] **Tableaux de bord personnalisables** : Widgets drag & drop

### Améliorations techniques
- [ ] Tests E2E (Playwright)
- [ ] Monitoring (Sentry)
- [ ] Cache Redis
- [ ] Optimisation images (upload S3)
- [ ] Documentation API (OpenAPI)

---

## Support

Pour signaler un bug ou demander une fonctionnalité :
- Ouvrir une issue sur GitHub
- Décrire le problème avec étapes de reproduction

---

## Licence

MIT License - Voir [LICENSE](LICENSE) pour plus de détails.
