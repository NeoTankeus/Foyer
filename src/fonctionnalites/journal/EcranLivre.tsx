// 📖 Le Livre de l'année : le Journal transformé en pages élégantes prêtes à
// imprimer (bouton Imprimer → « Enregistrer en PDF » sur iPhone) — couverture,
// un chapitre par mois, les photos, les grandes dates. Le cadeau automatique.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utiliserSession } from '@/etat/session'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

export function EcranLivre() {
  const { foyer } = utiliserSession()
  const annee = new Date().getFullYear()

  const livre = useQuery({
    queryKey: ['livre', annee],
    staleTime: 3600 * 1000,
    queryFn: async () => {
      const debut = `${annee}-01-01`
      const fin = `${annee}-12-31T23:59:59`
      const [souvenirs, restaurants, taches, mur] = await Promise.all([
        supabase.from('souvenirs').select('titre,lieu,image_donnees,pris_le,favori').gte('pris_le', debut).lte('pris_le', fin).order('pris_le').limit(120),
        supabase.from('restaurants').select('nom,ville,note,cree_le').gte('cree_le', debut).lte('cree_le', fin),
        supabase.from('taches').select('id', { count: 'exact', head: true }).gte('faite_le', debut).lte('faite_le', fin),
        supabase.from('mur').select('contenu,cree_le').not('contenu', 'is', null).gte('cree_le', debut).lte('cree_le', fin).limit(60),
      ])
      return {
        souvenirs: souvenirs.data ?? [],
        restaurants: restaurants.data ?? [],
        nbTaches: taches.count ?? 0,
        mots: mur.data ?? [],
      }
    },
  })

  const d = livre.data
  const parMois = (numero: number) => ({
    photos: (d?.souvenirs ?? []).filter((s) => new Date(s.pris_le).getMonth() === numero),
    restos: (d?.restaurants ?? []).filter((r) => new Date(r.cree_le).getMonth() === numero),
    mots: (d?.mots ?? []).filter((m) => new Date(m.cree_le).getMonth() === numero).slice(0, 3),
  })
  const moisRemplis = MOIS.map((nom, i) => ({ nom, ...parMois(i) })).filter(
    (m) => m.photos.length + m.restos.length + m.mots.length > 0,
  )

  return (
    <div className="pb-4">
      {/* À l'impression : seules les pages du livre existent. */}
      <style>{`@media print {
        .pas-imprime { display: none !important; }
        .page-livre { page-break-after: always; }
        body { background: #fff !important; }
      }`}</style>

      <header className="verre verre-clair safe-haut pas-imprime sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">📖 Le Livre de l'année</h1>
      </header>

      <div className="pas-imprime flex flex-col gap-2 px-5 pt-3">
        <Bouton pleineLargeur variante="primaire" onClick={() => window.print()}>
          🖨 Imprimer / Enregistrer en PDF
        </Bouton>
        <p className="text-legende text-encre-3">
          Sur iPhone : ce bouton → pince pour zoomer l'aperçu → partager → « Enregistrer dans Fichiers » en PDF.
          Ensuite, n'importe quel imprimeur en ligne en fait un vrai livre relié. 🎁
        </p>
      </div>

      {/* ——— Le livre lui-même ——— */}
      <div className="mx-auto max-w-2xl px-5">
        <div className="page-livre flex min-h-[70vh] flex-col items-center justify-center text-center">
          <p className="text-[56px]" aria-hidden="true">📖</p>
          <h2 className="mt-2 text-[34px] font-[700] leading-tight text-encre">{foyer?.nom ?? 'Notre famille'}</h2>
          <p className="mt-1 text-titre-3 text-encre-2">L'année {annee}</p>
          <p className="mt-6 text-corps-2 italic text-encre-3">
            {d ? `${d.souvenirs.length} photos · ${d.restaurants.length} restos découverts · ${d.nbTaches} choses accomplies` : ''}
          </p>
          <p className="mt-10 text-corps-2 text-encre-3">Écrit tout seul, avec amour — STG · ILY</p>
        </div>

        {livre.isLoading && <p className="pas-imprime py-8 text-center text-corps-2 text-encre-3">📖 Reliure en cours…</p>}

        {moisRemplis.map((m) => (
          <div key={m.nom} className="page-livre py-6">
            <h3 className="mb-3 border-b-2 border-trait pb-1 text-titre-3 text-encre">{m.nom} {annee}</h3>
            {m.photos.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {m.photos.slice(0, 6).map((p, i) => (
                  <figure key={i} className="m-0">
                    <img src={p.image_donnees} alt={p.titre ?? ''} className="h-44 w-full rounded-lg object-cover" />
                    {(p.titre || p.lieu) && (
                      <figcaption className="mt-0.5 text-legende text-encre-3">
                        {[p.titre, p.lieu].filter(Boolean).join(' — ')}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            )}
            {m.restos.length > 0 && (
              <p className="mt-3 text-corps-2 text-encre">
                🍴 Découvert ce mois-ci : {m.restos.map((r) => `${r.nom}${r.note ? ` (${'⭐'.repeat(Math.round(r.note))})` : ''}`).join(' · ')}
              </p>
            )}
            {m.mots.length > 0 && (
              <div className="mt-3">
                {m.mots.map((mot, i) => (
                  <p key={i} className="text-corps-2 italic text-encre-2">« {mot.contenu} »</p>
                ))}
              </div>
            )}
          </div>
        ))}

        {d && moisRemplis.length === 0 && (
          <p className="pas-imprime py-8 text-center text-corps-2 text-encre-3">
            Le livre se remplira tout seul au fil de l'année — photos, restos, petits mots.
          </p>
        )}
      </div>
    </div>
  )
}
