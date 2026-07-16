# FOYER — Architecture

> Document de proposition (étape 3 du brief). À valider avant la construction de la phase 1.

## Décisions actées (réponses aux 5 questions)

| Sujet | Décision |
|---|---|
| Accès enfant | Pas d'interface Gabriel pour l'instant. Le rôle `child` et **toute la RLS enfant existent dès la première migration** — l'interface arrive en phase 2 sans toucher au schéma. |
| Hébergement front | Vercel (déploiement auto depuis GitHub). Supabase pour Auth/Postgres/Realtime/Storage/Edge Functions/Vault. |
| Supabase | Nouveau projet, base vierge. Migrations versionnées dans `supabase/migrations/`. |
| iCloud | Deux comptes Apple (un par parent) → la table `integrations` porte un `membre_id` ; chaque parent connecte son propre mot de passe d'application, stocké dans Vault. |
| Email voyages | Pas de domaine pour l'instant. L'ingestion email est derrière l'interface `SourceReservation` ; en attendant, le Sas (photo / texte collé d'une confirmation) alimente le même parseur Gastif. |

## Arborescence

```
PROJECTNEWONE/
├── index.html
├── package.json
├── vite.config.ts                  # vite-plugin-pwa (manifest, Workbox)
├── tsconfig.json                   # strict: true
├── tailwind.config.ts              # branché sur les variables CSS (§3.1)
├── .env.example                    # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
├── docs/
│   └── ARCHITECTURE.md
├── public/
│   └── icones/                     # maskable 192 / 512, favicon
├── src/
│   ├── main.tsx
│   ├── App.tsx                     # routes + garde d'auth + tab bar par rôle
│   ├── design/
│   │   ├── tokens.css              # les variables du §3.1, clair/sombre
│   │   └── composants/             # Bouton, Carte, Feuille, Coche, PastilleMembre,
│   │                               # ChampRapide, EtatVide… (le kit, rien d'autre)
│   ├── fonctionnalites/            # un dossier par module, autonome
│   │   ├── aujourdhui/
│   │   │   ├── EcranAujourdhui.tsx
│   │   │   ├── fil/                # LeFil.tsx (SVG), tressage.ts (calcul des courbes),
│   │   │   │                       # Perle.tsx, LigneMaintenant.tsx
│   │   │   ├── BriefGastif.tsx
│   │   │   └── CartesDuJour.tsx
│   │   ├── agenda/                 # vues Semaine / Mois / Fil, filtres pastilles
│   │   ├── taches/                 # liste, rotation, RRULE (lib rrule), équilibre
│   │   ├── courses/                # liste temps réel, mode magasin, rayons
│   │   ├── repas/                  # menus semaine → liste de courses (phase 2)
│   │   ├── gastif/                 # conversation, forme organique animée (phase 2)
│   │   ├── sas/                    # capture photo/dictée + share_target (phase 2)
│   │   ├── celebrations/           # anniversaires + coffre à idées (phase 2)
│   │   ├── enfant/                 # Ma journée / Mes missions / routines (phase 2)
│   │   ├── colis/                  # (phase 3)
│   │   ├── voyages/                # (phase 4)
│   │   ├── mur/                    # (phase 4)
│   │   ├── coffre/                 # (phase 4)
│   │   └── nous/                   # membres, réglages, intégrations, équilibre
│   ├── lib/
│   │   ├── supabase.ts             # client typé (types générés)
│   │   ├── basedonnees.types.ts    # `supabase gen types` (généré, non édité)
│   │   ├── dexie.ts                # schéma IndexedDB : cache + file_attente
│   │   ├── sync.ts                 # rejeu des mutations au retour du réseau
│   │   ├── dates.ts                # helpers Europe/Paris (date-fns-tz)
│   │   └── validation/             # schémas Zod (tout ce qui entre)
│   └── etat/                       # stores Zustand (session, ui) — le serveur
│                                   # appartient à TanStack Query, pas à Zustand
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20260716120000_schema.sql   # types, tables, index, triggers
│   │   └── 20260716120100_rls.sql      # helpers + toutes les policies
│   ├── seed.sql                        # le foyer, les 3 membres, données de départ
│   ├── functions/                      # Edge Functions (Deno)
│   │   ├── _partage/                   # clients, adaptateurs (TransporteurAdapter,
│   │   │                               # DriveAdapter, SourceReservation), contexte Gastif
│   │   ├── gastif/                     # chat + function calling (phase 2)
│   │   ├── brief-matin/                # pg_cron 6h (phase 2)
│   │   ├── caldav-sync/                # tsdav ↔ icloud, par membre (phase 3)
│   │   ├── colis-suivi/                # La Poste Suivi v2 (phase 3)
│   │   ├── chronodrive/                # V1 export / V2 Playwright (phase 3)
│   │   └── push/                       # web push VAPID (phase 3)
│   └── tests/
│       └── rls/                        # un fichier pgTAP par table, 3 rôles
└── .github/workflows/ci.yml            # typecheck + lint + tests RLS + build
```

Règles de dépendance : `fonctionnalites/*` ne s'importent pas entre elles (elles passent par `lib/` ou par la base). Tout ce qui touche un service externe vit dans `supabase/functions/`, derrière un adaptateur dans `_partage/`.

## Choix de schéma (écarts assumés par rapport au brief §6)

1. **`idees_cadeaux` sort de `celebrations`** (c'était un jsonb). Raison : le verrou Père Noël doit être du RLS, or la RLS est par *ligne* — un jsonb dans une ligne visible fuit. Table dédiée, adultes uniquement, avec un drapeau `magie` par idée.
2. **`budgets` est une table à part** (au lieu de colonnes `budget` sur `celebrations`/`voyages`). Même raison : le brief interdit les colonnes budget au rôle `child`, et la RLS ne protège pas une colonne. Une table adultes-seulement le fait.
3. **`evenements.visible_enfant`** : drapeau explicite pour les événements adultes (RDV médicaux sensibles, préparation de surprise). La policy enfant l'applique.
4. **`taches`** : l'enfant ne voit que les tâches qui lui sont assignées (« acheter le cadeau de Gabriel » est une tâche adulte, elle ne doit jamais lui apparaître).
5. **`colis` : adultes uniquement.** Un colis « Lego Ninjago » en décembre casse la magie. Non négociable, comme demandé.
6. **`integrations.membre_id`** : nullable — une intégration est soit du foyer (La Poste), soit d'un membre (iCloud de chaque parent).
7. **`routine_executions`** : la définition d'une routine (`routines.etapes`) est stable ; ce qui est coché un matin donné vit dans une table d'exécution datée.
8. **`recompense_echanges`** : l'historique des points dépensés, séparé du catalogue.
9. **`membres.email_invitation`** : un trigger sur `auth.users` relie automatiquement le compte au membre pré-créé (seed) à la première connexion. Aucun `auth_user_id` en dur.
10. **`membres.modules_autorises`** : la liste blanche « à la carte » des invités (nounou → `['routines','evenements','mur']`).

## RLS — principes

- **Deux couches** : une policy *permissive* de périmètre (`foyer_id = prive.foyer_courant()`), puis des policies *restrictives* (`AS RESTRICTIVE`) par rôle. Une faille exige de rater les deux.
- Helpers `SECURITY DEFINER` dans un schéma `prive` (jamais exposé à PostgREST) pour éviter la récursion RLS sur `membres` : `foyer_courant()`, `membre_courant_id()`, `role_courant()`, `est_adulte()`, `acces_actif()`.
- **Invités** : lecture seule, uniquement les tables de leur `modules_autorises`, et seulement si `actif_jusqu_au > now()` — appliqué par une policy restrictive sur *chaque* table.
- **Enfant** — interdits absolus (aucune ligne visible) : `documents`, `idees_cadeaux`, `budgets`, `colis`, `integrations`, `journal_audit`, `sas` des autres, `gastif_conversations` des autres. Filtrés : `celebrations` (`magie = false`), `evenements` (`visible_enfant`), `taches` (assignées à lui).
- **Écritures enfant** : cocher ses tâches, cocher sa valise, cocher les articles en mode magasin, poster sur le Mur, ses exécutions de routine, son Sas, sa conversation Gastif. Rien d'autre.
- `journal_audit` : écrit par triggers `SECURITY DEFINER`, lisible par les adultes, inaltérable (pas de policy UPDATE/DELETE).
- Chaque table a son test pgTAP à 3 rôles dans `supabase/tests/rls/`. La CI les rejoue sur chaque commit.

## Le Fil — approche technique

Une seule passe de layout (`tressage.ts`, fonction pure, testable) : entrée = les événements 6h→22h par membre ; sortie = pour chaque membre une suite de segments `{de, a, x}` où `x` est la voie latérale (les voies convergent vers le centre quand les participants partagent un événement). Les courbes sont des Béziers cubiques verticales ; le tressage est un croisement des chemins sur la durée commune, épaisseur ∝ durée. Perles = événements, posées sur la voie (ou sur la tresse si partagé). Trou de garde = aucune voie adulte ne longe la voie enfant sur l'intervalle → l'écartement est le signal, sans icône d'alerte. Animation d'entrée par `stroke-dasharray`, ligne « maintenant » horizontale discrète, `prefers-reduced-motion` → fondu 120 ms.

## Offline

Dexie : une table cache par ressource + une table `file_attente` (mutations horodatées, idempotentes, clé client `uuid`). TanStack Query lit le cache en premier (`NetworkFirst` côté données) ; les mutations écrivent localement puis s'empilent ; au retour du réseau, rejeu dans l'ordre, `last-write-wins` + journal des écrasements. Realtime (courses) rebranche la souscription et réconcilie par `updated_at`.

## Phase 1 (livrable)

Auth multi-membres + rôles + RLS testée · Écran Aujourd'hui + Le Fil · Tâches + récurrences RRULE + rotation · Courses + Realtime + mode magasin · PWA installable + offline.
