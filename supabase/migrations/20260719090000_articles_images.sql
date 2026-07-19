-- Visuels des articles de courses : une image trouvée sur internet par produit.
alter table articles add column if not exists image_url text;
select 'Visuels des courses installés ✓' as resultat;
