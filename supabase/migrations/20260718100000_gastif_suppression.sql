-- Suppression des discussions Gastif : chacun peut effacer les siennes
-- (la purge automatique à 6 mois passe par la clé service, elle n'en a pas besoin).
drop policy if exists gastif_suppression on gastif_conversations;
create policy gastif_suppression on gastif_conversations for delete
  using (foyer_id = prive.foyer_courant() and membre_id = prive.membre_courant_id());
select 'Suppression Gastif installée ✓' as resultat;
