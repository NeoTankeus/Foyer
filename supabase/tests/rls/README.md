# Tests RLS — un fichier par table, trois rôles

Chaque table du schéma a son test pgTAP ici. Le principe, systématique :

1. Créer trois utilisateurs de test (`adult`, `child`, `guest` expiré + `guest` actif).
2. Pour chaque table : vérifier ce que chaque rôle **voit** (SELECT), **peut écrire**
   (INSERT/UPDATE/DELETE), et ce qui lui est **refusé**.
3. Les cas non négociables ont leur test nominatif :
   - `verrou_pere_noel.sql` — le rôle `child` ne voit **aucune** ligne de
     `idees_cadeaux`, aucune `celebrations.magie = true`, aucun `colis`,
     aucun `budgets`, y compris via jointure.
   - `coffre.sql` — `documents` inaccessible aux rôles `child` et `guest`.
   - `invite_expire.sql` — un `guest` dont `actif_jusqu_au < now()` ne voit
     plus **rien**, même les modules de sa liste blanche.

Exécution locale : `supabase test db` (les tests tournent aussi en CI).

Les tests des tables de la phase 1 (`foyers`, `membres`, `evenements`, `taches`,
`listes`, `articles`) sont livrés avec la phase 1 ; chaque phase suivante livre
les siens. **Une fonctionnalité sans son test RLS n'est pas « done »** (§10 du brief).
