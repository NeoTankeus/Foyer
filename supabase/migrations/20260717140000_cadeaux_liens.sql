-- Liste de cadeaux par liens : URL du produit + image, prix suivi par l'IA.
alter table idees_cadeaux add column if not exists url text;
alter table idees_cadeaux add column if not exists image_url text;
select 'Liens cadeaux installés ✓' as resultat;
