// Équilibre — la répartition réelle de la charge, en minutes complétées.
// Sans jugement, sans emoji, sans notification. Juste le chiffre, consultable.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utiliserSession } from '@/etat/session'
import { couleurMembre } from '@/lib/couleurs'
import type { LigneTache } from '@/lib/basedonnees.types'
import { BarreRetour } from '@/design/composants/BarreRetour'

export function EcranEquilibre() {
  const { membres } = utiliserSession()
  const [fenetre, setFenetre] = useState<7 | 30>(7)

  const faites = useQuery({
    queryKey: ['equilibre', fenetre],
    queryFn: async (): Promise<LigneTache[]> => {
      const depuis = new Date(Date.now() - fenetre * 24 * 3600 * 1000).toISOString()
      const { data, error } = await supabase
        .from('taches')
        .select('*')
        .eq('statut', 'faite')
        .gte('faite_le', depuis)
      if (error) throw error
      return data
    },
  })

  const adultes = membres.filter((m) => m.role === 'adult')
  const minutes = new Map<string, number>()
  for (const t of faites.data ?? []) {
    if (t.faite_par) minutes.set(t.faite_par, (minutes.get(t.faite_par) ?? 0) + t.effort_minutes)
  }
  const total = adultes.reduce((s, a) => s + (minutes.get(a.id) ?? 0), 0)

  return (
    <div className="px-5 pt-3">
      <BarreRetour vers="/nous" />
      <h2 className="pb-1 text-titre-3 text-encre">Équilibre</h2>
      <p className="mb-3 text-note text-encre-3">
        Minutes d’effort réellement complétées — la charge invisible (« penser à », « prendre RDV ») compte aussi.
      </p>

      <div className="mb-4 flex rounded-md bg-fond-sourd p-0.5" role="tablist">
        {([7, 30] as const).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={fenetre === f}
            onClick={() => setFenetre(f)}
            className={`min-h-sur-tactile flex-1 rounded-[8px] text-corps-2 font-[590]
              ${fenetre === f ? 'bg-fond-eleve text-encre shadow-carte' : 'text-encre-3'}`}
          >
            {f} jours
          </button>
        ))}
      </div>

      {total === 0 ? (
        <p className="text-corps-2 text-encre-3">
          Rien de complété sur la période. Le chiffre apparaîtra tout seul, en vivant.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex h-3 overflow-hidden rounded-full">
            {adultes.map((a) => {
              const part = (minutes.get(a.id) ?? 0) / total
              return (
                <div
                  key={a.id}
                  style={{ width: `${part * 100}%`, background: couleurMembre(a.couleur) }}
                  aria-hidden="true"
                />
              )
            })}
          </div>
          {adultes.map((a) => {
            const m = minutes.get(a.id) ?? 0
            const part = total === 0 ? 0 : Math.round((m / total) * 100)
            return (
              <div key={a.id} className="flex items-baseline justify-between rounded-md bg-fond-eleve px-4 py-3 shadow-carte">
                <span className="flex items-center gap-2 text-corps text-encre">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: couleurMembre(a.couleur) }} />
                  {a.prenom}
                </span>
                <span className="chiffres text-corps text-encre">
                  {part} %<span className="ml-2 text-note text-encre-3">{Math.round(m / 60)} h {m % 60} min</span>
                </span>
              </div>
            )
          })}
          <p className="text-legende text-encre-3">
            L’app n’enverra jamais de notification là-dessus. C’est un miroir, pas un juge.
          </p>
        </div>
      )}
    </div>
  )
}
