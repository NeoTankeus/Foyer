// 📔 Le Journal du Foyer : chaque jour, STG compile tout seul ce qui s'est
// passé (repas, photos, mur, restos, tâches, sorties…) — et la vue Année
// raconte votre année sans que personne n'ait rien rédigé.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utiliserSession } from '@/etat/session'
import { demanderAStiga } from '@/lib/stiga'
import type { LigneDepense, LigneEvenement, LigneMur, LigneRepas, LigneRestaurant, LigneSouvenir, LigneTache } from '@/lib/basedonnees.types'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Carte } from '@/design/composants/Carte'
import { Bouton } from '@/design/composants/Bouton'
import { EtatVide } from '@/design/composants/EtatVide'

const CRENEAUX: Record<string, string> = { matin: 'Petit-déj', midi: 'Déjeuner', gouter: 'Goûter', soir: 'Dîner' }

function jourIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function libelleJour(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

/** Tout ce qui s'est passé un jour donné, ramassé table par table. */
function utiliserJour(jour: string) {
  return useQuery({
    queryKey: ['journal', jour],
    queryFn: async () => {
      const debut = `${jour}T00:00:00`
      const fin = `${jour}T23:59:59`
      const [evenements, repas, taches, mur, souvenirs, restaurants, depenses] = await Promise.all([
        supabase.from('evenements').select('*').gte('debut_a', debut).lte('debut_a', fin).order('debut_a'),
        supabase.from('repas').select('*').eq('date', jour),
        supabase.from('taches').select('*').gte('faite_le', debut).lte('faite_le', fin),
        supabase.from('mur').select('*').gte('cree_le', debut).lte('cree_le', fin),
        supabase.from('souvenirs').select('*').gte('pris_le', debut).lte('pris_le', fin).limit(12),
        supabase.from('restaurants').select('*').gte('cree_le', debut).lte('cree_le', fin),
        supabase.from('depenses').select('*').eq('date_depense', jour),
      ])
      return {
        evenements: (evenements.data ?? []) as LigneEvenement[],
        repas: (repas.data ?? []) as LigneRepas[],
        taches: (taches.data ?? []) as LigneTache[],
        mur: (mur.data ?? []) as LigneMur[],
        souvenirs: (souvenirs.data ?? []) as LigneSouvenir[],
        restaurants: (restaurants.data ?? []) as LigneRestaurant[],
        depenses: (depenses.data ?? []) as LigneDepense[],
      }
    },
  })
}

/** Le portrait de l'année : compteurs et plus beaux moments. */
function utiliserAnnee(annee: number) {
  return useQuery({
    queryKey: ['journal-annee', annee],
    queryFn: async () => {
      const debut = `${annee}-01-01`
      const fin = `${annee}-12-31T23:59:59`
      const [souvenirs, restaurants, taches, repas, mur, favoris] = await Promise.all([
        supabase.from('souvenirs').select('id', { count: 'exact', head: true }).gte('pris_le', debut).lte('pris_le', fin),
        supabase.from('restaurants').select('*').gte('cree_le', debut).lte('cree_le', fin),
        supabase.from('taches').select('id', { count: 'exact', head: true }).gte('faite_le', debut).lte('faite_le', fin),
        supabase.from('repas').select('id', { count: 'exact', head: true }).gte('date', debut).lte('date', `${annee}-12-31`),
        supabase.from('mur').select('id', { count: 'exact', head: true }).gte('cree_le', debut).lte('cree_le', fin),
        supabase.from('souvenirs').select('*').eq('favori', true).gte('pris_le', debut).lte('pris_le', fin).limit(6),
      ])
      const restos = (restaurants.data ?? []) as LigneRestaurant[]
      const meilleur = [...restos].sort((a, b) => (b.note ?? 0) - (a.note ?? 0))[0] ?? null
      return {
        photos: souvenirs.count ?? 0,
        restos: restos.length,
        meilleurResto: meilleur && (meilleur.note ?? 0) >= 4 ? meilleur : null,
        taches: taches.count ?? 0,
        repas: repas.count ?? 0,
        mur: mur.count ?? 0,
        plusBelles: (favoris.data ?? []) as LigneSouvenir[],
      }
    },
  })
}

export function EcranJournal() {
  const { membres } = utiliserSession()
  const naviguer = useNavigate()
  const [vue, setVue] = useState<'jour' | 'annee'>('jour')
  const [jour, setJour] = useState(jourIso(new Date()))
  const [recit, setRecit] = useState<{ jour: string; texte: string } | null>(null)
  const [raconte, setRaconte] = useState(false)
  const annee = new Date().getFullYear()
  const duJour = utiliserJour(jour)
  const deLAnnee = utiliserAnnee(annee)

  const prenom = (id: string | null) => membres.find((m) => m.id === id)?.prenom ?? ''
  const decaler = (n: number) => {
    const d = new Date(`${jour}T12:00:00`)
    d.setDate(d.getDate() + n)
    setJour(jourIso(d))
  }

  const j = duJour.data
  const vide =
    j &&
    j.evenements.length + j.repas.length + j.taches.length + j.mur.length + j.souvenirs.length +
      j.restaurants.length + j.depenses.length === 0

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">📔 Le Journal</h1>
        <div className="mt-1 flex gap-2">
          {(['jour', 'annee'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVue(v)}
              aria-pressed={vue === v}
              className={`min-h-sur-tactile rounded-full px-4 text-note font-[590]
                ${vue === v ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
            >
              {v === 'jour' ? 'Au jour le jour' : `L’année ${annee}`}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        {vue === 'jour' && (
          <>
            <div className="flex items-center justify-between">
              <button onClick={() => decaler(-1)} aria-label="Jour précédent" className="min-h-sur-tactile min-w-sur-tactile text-titre-3 text-encre-2">‹</button>
              <p className="text-corps font-[590] capitalize text-encre">{libelleJour(jour)}</p>
              <button
                onClick={() => decaler(1)}
                aria-label="Jour suivant"
                disabled={jour >= jourIso(new Date())}
                className="min-h-sur-tactile min-w-sur-tactile text-titre-3 text-encre-2 disabled:opacity-30"
              >
                ›
              </button>
            </div>

            {duJour.isLoading && <p className="py-6 text-center text-corps-2 text-encre-3">STG feuillette le journal…</p>}
            {duJour.isError && <p className="py-6 text-center text-corps-2 text-encre-3">Le journal a besoin de réseau pour se relire.</p>}
            {vide && <EtatVide titre="Page blanche" message="Rien d'enregistré ce jour-là — c'était peut-être un dimanche parfait à ne rien faire." />}

            {/* ⏳ La Machine à remonter le temps : STG raconte la journée comme une histoire */}
            {j && !vide && (
              <Bouton
                pleineLargeur
                variante="soleil"
                desactive={raconte}
                onClick={() => {
                  setRaconte(true)
                  const morceaux = [
                    j.evenements.length ? `événements : ${j.evenements.map((e) => e.titre).join(', ')}` : '',
                    j.repas.length ? `repas : ${j.repas.map((r) => `${r.creneau} ${r.notes ?? ''}`).join(', ')}` : '',
                    j.restaurants.length ? `nouveau resto : ${j.restaurants.map((r) => r.nom).join(', ')}` : '',
                    j.taches.length ? `accompli : ${j.taches.map((t) => t.titre).join(', ')}` : '',
                    j.souvenirs.length ? `${j.souvenirs.length} photo(s) prise(s)${j.souvenirs[0]?.titre ? ` dont « ${j.souvenirs[0].titre} »` : ''}` : '',
                    j.mur.length ? `mots laissés : ${j.mur.map((m) => m.contenu).filter(Boolean).slice(0, 3).join(' / ')}` : '',
                  ].filter(Boolean).join(' ; ')
                  void demanderAStiga(
                    `Raconte la journée du ${libelleJour(jour)} de notre famille (Stéphane, Tiphaine, Gabriel 7 ans) ` +
                      `comme une petite histoire chaleureuse de 6-9 lignes, à partir de ces traces réelles : ${morceaux}. ` +
                      `Uniquement ces faits — pas d'invention, mais de la tendresse et un sourire.`,
                  )
                    .then((texte) => setRecit({ jour, texte }))
                    .catch(() => setRecit({ jour, texte: 'La machine à remonter le temps a calé — réessaie.' }))
                    .finally(() => setRaconte(false))
                }}
              >
                {raconte ? '⏳ STG remonte le temps…' : '⏳ Raconte-moi cette journée'}
              </Bouton>
            )}
            {recit && recit.jour === jour && (
              <Carte>
                <p className="whitespace-pre-wrap text-corps-2 leading-relaxed text-encre">{recit.texte}</p>
              </Carte>
            )}

            {j && j.souvenirs.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {j.souvenirs.map((s) => (
                  <img key={s.id} src={s.image_donnees} alt={s.titre ?? 'Souvenir'} loading="lazy" className="h-28 w-full rounded-lg object-cover shadow-carte" />
                ))}
              </div>
            )}

            {j && j.evenements.length > 0 && (
              <Carte>
                <p className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">📅 Au programme</p>
                {j.evenements.map((e) => (
                  <p key={e.id} className="border-b border-trait py-1.5 text-corps-2 text-encre last:border-0">
                    {e.journee_entiere ? '' : `${new Date(e.debut_a).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · `}
                    {e.titre}{e.lieu ? ` — ${e.lieu}` : ''}
                  </p>
                ))}
              </Carte>
            )}

            {j && j.repas.length > 0 && (
              <Carte>
                <p className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">🍽 À table</p>
                {j.repas.map((r) => (
                  <p key={r.id} className="py-1 text-corps-2 text-encre">
                    {CRENEAUX[r.creneau] ?? r.creneau} : {r.notes ?? 'menu prévu'}
                  </p>
                ))}
              </Carte>
            )}

            {j && j.restaurants.length > 0 && (
              <Carte>
                <p className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">🍴 Nouvelle adresse</p>
                {j.restaurants.map((r) => (
                  <p key={r.id} className="py-1 text-corps-2 text-encre">
                    {r.nom}{r.note ? ` — ${'⭐'.repeat(Math.round(r.note))}` : ''}{r.favori ? ' 💛' : ''}
                  </p>
                ))}
              </Carte>
            )}

            {j && j.mur.length > 0 && (
              <Carte>
                <p className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">📌 Sur le mur</p>
                {j.mur.map((m) => (
                  <div key={m.id} className="border-b border-trait py-1.5 last:border-0">
                    {m.contenu && <p className="text-corps-2 text-encre">{m.contenu}</p>}
                    {m.media_url && <img src={m.media_url} alt="" loading="lazy" className="mt-1 max-h-40 rounded-lg object-cover" />}
                    <p className="text-legende text-encre-3">{prenom(m.auteur_id)}</p>
                  </div>
                ))}
              </Carte>
            )}

            {j && j.taches.length > 0 && (
              <Carte>
                <p className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">✓ Accompli</p>
                {j.taches.map((t) => (
                  <p key={t.id} className="py-1 text-corps-2 text-encre">
                    {t.titre} <span className="text-legende text-encre-3">— {prenom(t.faite_par)}</span>
                  </p>
                ))}
              </Carte>
            )}

            {j && j.depenses.length > 0 && (
              <Carte>
                <p className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">💶 Dépenses du jour</p>
                {j.depenses.map((d) => (
                  <p key={d.id} className="py-1 text-corps-2 text-encre">
                    {d.libelle} — {d.montant.toFixed(2).replace('.', ',')} €
                  </p>
                ))}
              </Carte>
            )}
          </>
        )}

        {vue === 'annee' && (
          <>
            {deLAnnee.isLoading && <p className="py-6 text-center text-corps-2 text-encre-3">STG relit votre année…</p>}
            {deLAnnee.data && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['📷', deLAnnee.data.photos, 'photos souvenirs'],
                    ['🍴', deLAnnee.data.restos, 'restos découverts'],
                    ['✓', deLAnnee.data.taches, 'tâches accomplies'],
                    ['🍽', deLAnnee.data.repas, 'repas planifiés'],
                  ].map(([icone, n, libelle]) => (
                    <Carte key={String(libelle)}>
                      <p className="text-titre-2 text-encre">{icone} {n}</p>
                      <p className="text-legende text-encre-3">{libelle}</p>
                    </Carte>
                  ))}
                </div>
                {deLAnnee.data.meilleurResto && (
                  <Carte>
                    <p className="text-note font-[590] uppercase tracking-wide text-encre-3">🏆 Votre table de l'année</p>
                    <p className="mt-1 text-corps font-[590] text-encre">
                      {deLAnnee.data.meilleurResto.nom} — {'⭐'.repeat(Math.round(deLAnnee.data.meilleurResto.note ?? 0))}
                    </p>
                  </Carte>
                )}
                {deLAnnee.data.plusBelles.length > 0 && (
                  <>
                    <p className="text-note font-[590] uppercase tracking-wide text-encre-3">💛 Vos plus beaux moments</p>
                    <div className="grid grid-cols-3 gap-2">
                      {deLAnnee.data.plusBelles.map((s) => (
                        <img key={s.id} src={s.image_donnees} alt={s.titre ?? ''} loading="lazy" className="h-28 w-full rounded-lg object-cover shadow-carte" />
                      ))}
                    </div>
                  </>
                )}
                <Bouton pleineLargeur variante="soleil" onClick={() => naviguer('/nous/livre')}>
                  📖 Générer le Livre de l'année (imprimable)
                </Bouton>
                <p className="text-legende text-encre-3">
                  Le Journal s'écrit tout seul : tout ce que vous faites dans STG devient une page. Au 31 décembre, cette vue devient votre rétrospective.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
