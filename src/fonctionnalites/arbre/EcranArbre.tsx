// 🌳 L'Arbre généalogique vivant : la famille élargie par générations,
// branchée sur Les Proches — anniversaires, goûts et anecdotes par personne.
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { lireAvecRepli } from '@/lib/lecture'
import { utiliserSession } from '@/etat/session'
import type { LigneCelebration, LignePersonne } from '@/lib/basedonnees.types'
import { PastilleMembre } from '@/design/composants/PastilleMembre'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Carte } from '@/design/composants/Carte'
import { EtatVide } from '@/design/composants/EtatVide'

const GENERATIONS: { cle: string; libelle: string; motif: RegExp }[] = [
  { cle: 'anciens', libelle: '🌟 Les anciens', motif: /papi|mamie|grand[- ]?p|grand[- ]?m|aïeul|arriere|arrière/i },
  { cle: 'parents', libelle: '🌿 Frères, sœurs, oncles & tantes', motif: /oncle|tante|frère|frere|sœur|soeur|parrain|marraine|beau|belle/i },
  { cle: 'jeunes', libelle: '🌱 Cousins & copains', motif: /cousin|copain|copine|ami|camarade|neveu|nièce|niece/i },
]

export function EcranArbre() {
  const { membres } = utiliserSession()
  const naviguer = useNavigate()

  const proches = useQuery({
    queryKey: ['personnes'],
    queryFn: () =>
      lireAvecRepli<LignePersonne>('personnes', async () => {
        const { data, error } = await supabase.from('personnes').select('*').order('prenom')
        if (error) throw error
        return data
      }),
  })
  const celebrations = useQuery({
    queryKey: ['celebrations-arbre'],
    queryFn: async () => {
      const { data } = await supabase.from('celebrations').select('nom,date,magie')
      return (data ?? []) as Pick<LigneCelebration, 'nom' | 'date' | 'magie'>[]
    },
  })

  const anniversaireDe = (prenom: string): string | null => {
    const fete = (celebrations.data ?? []).find(
      (c) => !c.magie && c.nom.toLowerCase().includes(prenom.toLowerCase()),
    )
    if (!fete) return null
    const [, m, j] = fete.date.split('-').map(Number)
    return new Date(2000, (m ?? 1) - 1, j ?? 1).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  }

  const tous = proches.data ?? []
  const classes = new Set<string>()
  const generations = GENERATIONS.map((g) => {
    const personnes = tous.filter((p) => g.motif.test(p.relation ?? ''))
    personnes.forEach((p) => classes.add(p.id))
    return { ...g, personnes }
  })
  const autres = tous.filter((p) => !classes.has(p.id))

  const CartePersonne = ({ p }: { p: LignePersonne }) => {
    const anniv = anniversaireDe(p.prenom)
    return (
      <button
        onClick={() => naviguer('/nous/personnes')}
        className="flex w-full items-start gap-3 rounded-xl bg-fond-eleve p-3 text-left shadow-carte active:bg-fond-sourd"
      >
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fond-sourd text-[18px] font-[700] text-encre-2"
        >
          {p.prenom.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-corps-2 font-[590] text-encre">
            {p.prenom} {p.relation ? <span className="font-[400] text-encre-3">· {p.relation}</span> : null}
          </p>
          {anniv && <p className="text-legende text-encre-3">🎂 {anniv}</p>}
          {p.gouts && <p className="break-words text-legende text-encre-3">💛 {p.gouts.slice(0, 70)}</p>}
          {p.notes && <p className="break-words text-legende italic text-encre-3">« {p.notes.slice(0, 70)} »</p>}
        </div>
      </button>
    )
  }

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🌳 L'Arbre de la famille</h1>
        <p className="text-legende text-encre-3">Toutes les branches, nourries par « Les proches ».</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        {/* Le tronc : nous trois */}
        <Carte>
          <p className="mb-2 text-center text-note font-[590] uppercase tracking-wide text-encre-3">🏡 Le tronc</p>
          <div className="flex items-center justify-center gap-6">
            {membres.filter((m) => m.role !== 'guest').map((m) => (
              <div key={m.id} className="flex flex-col items-center gap-1">
                <PastilleMembre membre={m} taille={44} />
                <p className="text-legende font-[590] text-encre">{m.prenom}</p>
              </div>
            ))}
          </div>
        </Carte>

        {generations.map((g) =>
          g.personnes.length === 0 ? null : (
            <div key={g.cle} className="flex flex-col gap-2">
              <p className="text-note font-[590] uppercase tracking-wide text-encre-3">{g.libelle}</p>
              {g.personnes.map((p) => <CartePersonne key={p.id} p={p} />)}
            </div>
          ),
        )}
        {autres.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-note font-[590] uppercase tracking-wide text-encre-3">🍃 Les autres branches</p>
            {autres.map((p) => <CartePersonne key={p.id} p={p} />)}
          </div>
        )}

        {!proches.isLoading && tous.length === 0 && (
          <EtatVide
            titre="L'arbre attend ses branches"
            message="Ajoute papi, mamie, les oncles, les cousins dans « Les proches » (avec leur relation) — l'arbre se construit tout seul, avec leurs goûts et anniversaires."
          />
        )}

        <p className="text-legende text-encre-3">
          💡 Astuce : dans « Les proches », renseigne bien la relation (« papi », « tante », « cousin »…) — c'est
          elle qui place chacun sur la bonne branche. Touche une personne pour ouvrir sa fiche complète.
        </p>
      </div>
    </div>
  )
}
