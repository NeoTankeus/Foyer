// Points → récompenses réelles. Pas de monnaie virtuelle abstraite :
// « choisir le film du samedi » à 50 points, c'est concret.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { lireAvecRepli } from '@/lib/lecture'
import { utiliserSession } from '@/etat/session'
import type { LigneRecompense } from '@/lib/basedonnees.types'
import { Bouton } from '@/design/composants/Bouton'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { EtatVide } from '@/design/composants/EtatVide'
import { PastilleMembre } from '@/design/composants/PastilleMembre'
import { BarreRetour } from '@/design/composants/BarreRetour'

export function EcranRecompenses() {
  const { membre, membres, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const [creation, setCreation] = useState(false)

  const enfant = membres.find((m) => m.role === 'child')

  const recompenses = useQuery({
    queryKey: ['recompenses'],
    queryFn: () =>
      lireAvecRepli<LigneRecompense>('recompenses', async () => {
        const { data, error } = await supabase.from('recompenses').select('*').eq('active', true)
        if (error) throw error
        return data
      }),
  })

  const echanger = async (r: LigneRecompense) => {
    if (!enfant || enfant.points < r.cout_points) return
    const id = crypto.randomUUID()
    await muter({
      table: 'recompense_echanges', type: 'insert', cible_id: id,
      charge: { id, recompense_id: r.id, membre_id: enfant.id, points_depenses: r.cout_points },
    })
    await muter({
      table: 'membres', type: 'update', cible_id: enfant.id,
      charge: { points: enfant.points - r.cout_points },
    })
    window.location.reload() // recharge le solde de points du foyer
  }

  return (
    <div className="px-5 pt-3">
      <BarreRetour vers="/nous" />
      <div className="flex items-center justify-between gap-3 pb-3">
        <h2 className="text-titre-3 text-encre">Récompenses</h2>
        {membre?.role === 'adult' && (
          <Bouton variante="discret" onClick={() => setCreation(true)} etiquette="Nouvelle récompense">+</Bouton>
        )}
      </div>

      {enfant && (
        <div className="mb-3 flex items-center gap-3 rounded-md bg-fond-eleve p-3 shadow-carte">
          <PastilleMembre membre={enfant} taille={34} />
          <p className="flex-1 text-corps text-encre">{enfant.prenom}</p>
          <p className="chiffres text-titre-3 text-encre">{enfant.points} pts</p>
        </div>
      )}
      <p className="mb-3 text-note text-encre-3">
        Gabriel gagne des points en finissant ses missions (les tâches à points qui lui sont assignées).
      </p>

      {(recompenses.data?.length ?? 0) === 0 && !recompenses.isLoading && (
        <EtatVide titre="Pas encore de récompense" message="« Choisir le film du samedi » à 50 pts — c’est vous qui fixez le catalogue." />
      )}

      <ul className="flex flex-col gap-1">
        {(recompenses.data ?? []).map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-md bg-fond-eleve px-3 py-2 shadow-carte">
            <p className="flex-1 text-corps text-encre">{r.libelle}</p>
            <span className="chiffres text-note text-encre-3">{r.cout_points} pts</span>
            {membre?.role === 'adult' && enfant && (
              <Bouton
                variante="discret"
                desactive={enfant.points < r.cout_points}
                onClick={() => void echanger(r)}
              >
                Échanger
              </Bouton>
            )}
          </li>
        ))}
      </ul>

      <Feuille ouverte={creation} onFermer={() => setCreation(false)} titre="Nouvelle récompense">
        {foyer && (
          <FormRecompense
            surCreation={async (libelle, cout) => {
              const id = crypto.randomUUID()
              await muter({
                table: 'recompenses', type: 'insert', cible_id: id,
                charge: { id, foyer_id: foyer.id, libelle, cout_points: cout, image_url: null, active: true },
              })
              await clientRequetes.invalidateQueries({ queryKey: ['recompenses'] })
              setCreation(false)
            }}
          />
        )}
      </Feuille>
    </div>
  )
}

function FormRecompense({ surCreation }: { surCreation: (libelle: string, cout: number) => Promise<void> }) {
  const [libelle, setLibelle] = useState('')
  const [cout, setCout] = useState(50)
  return (
    <div className="flex flex-col gap-3">
      <ChampTexte etiquette="Récompense" value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Choisir le film du samedi" />
      <label className="block">
        <span className="mb-1 block text-note font-[500] text-encre-2">Coût en points</span>
        <select
          value={cout}
          onChange={(e) => setCout(Number(e.target.value))}
          className="min-h-sur-tactile w-full rounded-md border border-trait bg-fond-eleve px-3 text-corps"
        >
          {[20, 50, 100, 200].map((c) => (
            <option key={c} value={c}>{c} points</option>
          ))}
        </select>
      </label>
      <Bouton pleineLargeur onClick={() => { if (libelle.trim()) void surCreation(libelle.trim(), cout) }}>
        Ajouter au catalogue
      </Bouton>
    </div>
  )
}
