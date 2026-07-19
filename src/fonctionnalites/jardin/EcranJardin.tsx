// 🌱 Le Jardin des habitudes : chacun plante une graine (sport, lecture,
// pas d'écran après 21h…). Chaque jour tenu la fait grandir — un jardin
// visuel de vos bonnes habitudes, entre adultes.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { lireAvecRepli } from '@/lib/lecture'
import { utiliserSession } from '@/etat/session'
import type { LigneHabitude } from '@/lib/basedonnees.types'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'
import { EtatVide } from '@/design/composants/EtatVide'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'

const GRAINES = ['🏃', '📖', '🧘', '💤', '🚭', '🥗', '💧', '📵', '🎸', '🌱']

function jourIso(decalage = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + decalage)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Jours consécutifs tenus, en comptant depuis aujourd'hui (ou hier). */
function serie(jours: string[]): number {
  const tenus = new Set(jours)
  let n = 0
  let depart = tenus.has(jourIso(0)) ? 0 : tenus.has(jourIso(-1)) ? -1 : null
  if (depart === null) return 0
  while (tenus.has(jourIso(depart - n))) n += 1
  return n
}

/** La plante grandit avec la série : graine → pousse → plante → arbre. */
function plante(streak: number): { stade: string; suivant: string } {
  if (streak >= 30) return { stade: '🌳✨', suivant: 'majestueux !' }
  if (streak >= 14) return { stade: '🌳', suivant: `arbre étoilé à 30 j (encore ${30 - streak})` }
  if (streak >= 7) return { stade: '🪴', suivant: `arbre à 14 j (encore ${14 - streak})` }
  if (streak >= 3) return { stade: '🌿', suivant: `pot à 7 j (encore ${7 - streak})` }
  if (streak >= 1) return { stade: '🌱', suivant: `feuilles à 3 j (encore ${3 - streak})` }
  return { stade: '🌰', suivant: 'premier jour pour germer' }
}

export function EcranJardin() {
  const { membre, membres, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const [creation, setCreation] = useState(false)
  const [nom, setNom] = useState('')
  const [emoji, setEmoji] = useState('🌱')

  const habitudes = useQuery({
    queryKey: ['habitudes'],
    queryFn: () =>
      lireAvecRepli<LigneHabitude>('habitudes', async () => {
        const { data, error } = await supabase.from('habitudes').select('*')
        if (error) throw error
        return data
      }),
  })

  const rafraichir = () => clientRequetes.invalidateQueries({ queryKey: ['habitudes'] })
  const prenom = (id: string) => membres.find((m) => m.id === id)?.prenom ?? '?'
  const aujourdHui = jourIso(0)

  const planter = async () => {
    if (!foyer || !membre || !nom.trim()) return
    const id = crypto.randomUUID()
    await muter({
      table: 'habitudes', type: 'insert', cible_id: id,
      charge: {
        id, foyer_id: foyer.id, membre_id: membre.id,
        nom: nom.trim(), emoji, jours: [], cree_le: new Date().toISOString(),
      },
    })
    setCreation(false)
    setNom('')
    await rafraichir()
  }

  const basculerAujourdhui = async (h: LigneHabitude) => {
    navigator.vibrate?.(6)
    const jours = h.jours.includes(aujourdHui)
      ? h.jours.filter((j) => j !== aujourdHui)
      : [...h.jours, aujourdHui]
    await muter({ table: 'habitudes', type: 'update', cible_id: h.id, charge: { jours } })
    await rafraichir()
  }

  const jardins = membres
    .filter((m) => m.role === 'adult')
    .map((m) => ({ membre: m, pousses: (habitudes.data ?? []).filter((h) => h.membre_id === m.id) }))

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 flex items-start justify-between px-5 pb-2 pt-3">
        <div>
          <BarreRetour />
          <h1 className="text-titre-2 text-encre">🌱 Le Jardin</h1>
          <p className="text-legende text-encre-3">Vos habitudes poussent un jour à la fois.</p>
        </div>
        <Bouton variante="primaire" onClick={() => setCreation(true)}>+ Planter</Bouton>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        {!habitudes.isLoading && (habitudes.data ?? []).length === 0 && (
          <EtatVide
            titre="Le jardin est en friche"
            message="Plante ta première graine : « 20 min de lecture », « courir mardi-jeudi », « pas d'écran après 21h »… Chaque jour tenu la fait grandir."
          />
        )}

        {jardins.map(({ membre: m, pousses }) =>
          pousses.length === 0 ? null : (
            <Carte key={m.id}>
              <p className="mb-2 text-note font-[590] uppercase tracking-wide text-encre-3">
                Le jardin de {m.prenom}
              </p>
              <ul className="flex flex-col gap-3">
                {pousses.map((h) => {
                  const streak = serie(h.jours)
                  const p = plante(streak)
                  const faitCeJour = h.jours.includes(aujourdHui)
                  const aMoi = h.membre_id === membre?.id
                  return (
                    <li key={h.id} className="flex items-center gap-3">
                      <span className="text-[34px] leading-none" aria-hidden="true">{p.stade}</span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-corps-2 font-[590] text-encre">{h.emoji} {h.nom}</p>
                        <p className="text-legende text-encre-3">
                          {streak > 0 ? `${streak} jour${streak > 1 ? 's' : ''} d'affilée — ${p.suivant}` : p.suivant}
                          {!aMoi ? ` · ${prenom(h.membre_id)}` : ''}
                        </p>
                      </div>
                      {aMoi ? (
                        <Bouton
                          variante={faitCeJour ? 'valider' : 'discret'}
                          onClick={() => void basculerAujourdhui(h)}
                        >
                          {faitCeJour ? '✓ Fait' : 'Fait aujourd’hui ?'}
                        </Bouton>
                      ) : (
                        <span className="text-[18px]" aria-hidden="true">{faitCeJour ? '✓' : ''}</span>
                      )}
                      {aMoi && (
                        <button
                          aria-label={`Arracher ${h.nom}`}
                          onClick={() => {
                            if (confirm(`Arracher « ${h.nom} » du jardin ?`))
                              void muter({ table: 'habitudes', type: 'delete', cible_id: h.id, charge: {} }).then(rafraichir)
                          }}
                          className="min-h-sur-tactile text-encre-3"
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Carte>
          ),
        )}

        <p className="text-legende text-encre-3">
          🌰 graine → 🌱 1 j → 🌿 3 j → 🪴 7 j → 🌳 14 j → 🌳✨ 30 j. Un jour raté ne détruit pas tout : la série repart, la plante attend.
        </p>
      </div>

      <Feuille ouverte={creation} onFermer={() => setCreation(false)} titre="Planter une graine">
        <div className="flex flex-col gap-3">
          <ChampTexte etiquette="L'habitude" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="20 min de lecture le soir" />
          <div className="flex flex-wrap gap-2">
            {GRAINES.map((g) => (
              <button
                key={g}
                onClick={() => setEmoji(g)}
                aria-pressed={emoji === g}
                className={`flex h-11 w-11 items-center justify-center rounded-2xl text-[20px]
                  ${emoji === g ? 'bg-encre/10 ring-2 ring-encre' : 'bg-fond-sourd'}`}
              >
                {g}
              </button>
            ))}
          </div>
          <Bouton pleineLargeur variante="valider" desactive={!nom.trim()} onClick={() => void planter()}>
            🌱 Planter
          </Bouton>
        </div>
      </Feuille>
    </div>
  )
}
