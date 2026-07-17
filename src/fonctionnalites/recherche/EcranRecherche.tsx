// Recherche globale : tout le foyer d'abord, le web ensuite.
// Le web passe par Gastif (qui connaît la famille) ou par Google en un tap.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utiliserSession } from '@/etat/session'
import { Bouton } from '@/design/composants/Bouton'
import { formatHeure } from '@/lib/dates'

interface Resultat {
  type: string
  icone: string
  titre: string
  detail: string
  chemin: string
}

export function EcranRecherche() {
  const { membre } = utiliserSession()
  const naviguer = useNavigate()
  const [q, setQ] = useState('')
  const [qStable, setQStable] = useState('')

  useEffect(() => {
    const minuteur = setTimeout(() => setQStable(q.trim()), 250)
    return () => clearTimeout(minuteur)
  }, [q])

  const donnees = useQuery({
    queryKey: ['recherche-globale'],
    queryFn: async () => {
      const [evenements, taches, articles, recettes, celebrations, voyages, documents, mur] =
        await Promise.all([
          supabase.from('evenements').select('*').gte('fin_a', new Date(Date.now() - 7 * 86400000).toISOString()).limit(200),
          supabase.from('taches').select('*').limit(300),
          supabase.from('articles').select('*').limit(300),
          supabase.from('recettes').select('*'),
          supabase.from('celebrations').select('*'),
          supabase.from('voyages').select('*'),
          supabase.from('documents').select('*'),
          supabase.from('mur').select('*').limit(100),
        ])
      return { evenements, taches, articles, recettes, celebrations, voyages, documents, mur }
    },
  })

  const resultats = useMemo((): Resultat[] => {
    if (!qStable || !donnees.data) return []
    const contient = (texte: string | null | undefined) =>
      texte?.toLowerCase().includes(qStable.toLowerCase()) ?? false
    const trouve: Resultat[] = []
    const d = donnees.data

    for (const e of d.evenements.data ?? [])
      if (contient(e.titre) || contient(e.lieu))
        trouve.push({ type: 'Agenda', icone: '📅', titre: e.titre, detail: `${new Date(e.debut_a).toLocaleDateString('fr-FR')} ${formatHeure(e.debut_a)}`, chemin: '/agenda' })
    for (const t of d.taches.data ?? [])
      if (contient(t.titre))
        trouve.push({ type: 'Tâche', icone: '✅', titre: t.titre, detail: t.statut === 'faite' ? 'faite' : t.echeance ?? 'à faire', chemin: '/maison' })
    for (const a of d.articles.data ?? [])
      if (contient(a.libelle))
        trouve.push({ type: 'Courses', icone: '🛒', titre: a.libelle, detail: a.coche ? 'déjà coché' : a.rayon, chemin: '/maison?ajout=courses' })
    for (const r of d.recettes.data ?? [])
      if (contient(r.titre) || r.ingredients.some((i) => contient(i.libelle)))
        trouve.push({ type: 'Recette', icone: '🍽️', titre: r.titre, detail: `${r.ingredients.length} ingrédients`, chemin: '/maison' })
    for (const c of d.celebrations.data ?? [])
      if (contient(c.nom))
        trouve.push({ type: 'Célébration', icone: '🎂', titre: c.nom, detail: new Date(c.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }), chemin: '/nous/celebrations' })
    for (const v of d.voyages.data ?? [])
      if (contient(v.titre) || contient(v.destination))
        trouve.push({ type: 'Voyage', icone: '✈️', titre: v.titre, detail: v.destination ?? '', chemin: `/nous/voyages/${v.id}` })
    for (const doc of d.documents.data ?? [])
      if (contient(doc.titre))
        trouve.push({ type: 'Coffre', icone: '🗄️', titre: doc.titre, detail: doc.expire_le ? `expire le ${new Date(doc.expire_le).toLocaleDateString('fr-FR')}` : '', chemin: '/nous/coffre' })
    for (const n of d.mur.data ?? [])
      if (contient(n.contenu))
        trouve.push({ type: 'Le Mur', icone: '📌', titre: n.contenu?.slice(0, 60) ?? '', detail: '', chemin: '/maison' })

    return trouve.slice(0, 30)
  }, [qStable, donnees.data])

  return (
    <div className="px-5 pt-3 pb-8">
      <h2 className="pb-2 text-titre-3 text-encre">🔍 Recherche</h2>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Chercher dans tout le foyer…"
        aria-label="Recherche globale"
        autoFocus
        className="min-h-sur-tactile w-full rounded-full border border-trait bg-fond-eleve px-4 text-corps"
      />

      {qStable && (
        <div className="mt-3 flex gap-2">
          <Bouton
            variante="soleil"
            pleineLargeur
            onClick={() => {
              sessionStorage.setItem('question-gastif', qStable)
              naviguer('/gastif')
            }}
          >
            Demander à Gastif
          </Bouton>
          <Bouton
            variante="discret"
            pleineLargeur
            onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(qStable)}`, '_blank', 'noopener')}
          >
            Chercher sur le web
          </Bouton>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-1">
        {qStable && resultats.length === 0 && (
          <p className="py-4 text-center text-corps-2 text-encre-3">
            Rien dans le foyer pour « {qStable} » — essaie Gastif ou le web au-dessus.
          </p>
        )}
        {resultats.map((r, i) => (
          <button
            key={i}
            onClick={() => naviguer(r.chemin)}
            className="flex min-h-sur-tactile items-center gap-3 rounded-xl bg-fond-eleve px-3 py-2 text-left shadow-carte"
          >
            <span aria-hidden="true" className="text-[22px]">{r.icone}</span>
            <div className="flex-1">
              <p className="text-corps-2 text-encre">{r.titre}</p>
              <p className="text-legende text-encre-3">{r.type}{r.detail ? ` · ${r.detail}` : ''}</p>
            </div>
            <span aria-hidden="true" className="text-encre-3">›</span>
          </button>
        ))}
      </div>

      {membre?.role !== 'adult' && (
        <p className="mt-4 text-legende text-encre-3">
          La recherche ne montre que ce que ton rôle a le droit de voir.
        </p>
      )}
    </div>
  )
}
