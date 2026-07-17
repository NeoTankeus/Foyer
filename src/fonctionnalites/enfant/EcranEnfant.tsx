// Le mode enfant — ce n'est pas l'app adulte en plus gros, c'est une autre app.
// Un parent l'active et tend le téléphone à Gabriel : gros pictos, zéro clavier,
// coche plein écran avec confettis. Ni budget, ni cadeaux, ni sujets adultes.
import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { lireAvecRepli } from '@/lib/lecture'
import { utiliserSession } from '@/etat/session'
import { completerTache, utiliserEvenementsDuJour, utiliserTachesOuvertes } from '@/lib/requetes'
import { formatHeure, versLocal } from '@/lib/dates'
import type { LigneRoutine, LigneTache } from '@/lib/basedonnees.types'
import { PastilleMembre } from '@/design/composants/PastilleMembre'
import { ExecutionRoutine } from './ExecutionRoutine'

interface Props {
  onQuitter: () => void
}

function iconePourEvenement(titre: string): string {
  const t = titre.toLowerCase()
  if (/piscine|nage/.test(t)) return '🏊'
  if (/école|ecole|classe/.test(t)) return '🏫'
  if (/foot|sport|judo|tennis/.test(t)) return '⚽'
  if (/dentiste|docteur|médecin|medecin/.test(t)) return '🩺'
  if (/anniversaire|fête|fete/.test(t)) return '🎈'
  if (/dîner|diner|déjeuner|dejeuner|repas|petit-déj/.test(t)) return '🍽️'
  if (/musique|piano|guitare/.test(t)) return '🎵'
  return '⭐'
}

export function EcranEnfant({ onQuitter }: Props) {
  const { membre, membres } = utiliserSession()
  const clientRequetes = useQueryClient()
  const evenements = utiliserEvenementsDuJour()
  const taches = utiliserTachesOuvertes()
  const [volet, setVolet] = useState<'journee' | 'missions'>('journee')
  const [routineEnCours, setRoutineEnCours] = useState<LigneRoutine | null>(null)
  const [bravo, setBravo] = useState(false)

  const gabriel = membres.find((m) => m.role === 'child')

  const routines = useQuery({
    queryKey: ['routines'],
    queryFn: () =>
      lireAvecRepli<LigneRoutine>('routines', async () => {
        const { data, error } = await supabase.from('routines').select('*').eq('active', true)
        if (error) throw error
        return data
      }),
  })

  const missions = useMemo(
    () => (taches.data ?? []).filter((t) => t.assignee_id === gabriel?.id),
    [taches.data, gabriel?.id],
  )

  const journee = useMemo(() => {
    const visibles = (evenements.data ?? []).filter((e) => e.visible_enfant && !e.journee_entiere)
    const creneau = (e: { debut_a: string }) => {
      const h = versLocal(e.debut_a).getHours()
      if (h < 12) return 'Ce matin'
      if (h < 18) return 'Cet après-midi'
      return 'Ce soir'
    }
    const groupes = new Map<string, typeof visibles>()
    for (const e of visibles) {
      const cle = creneau(e)
      groupes.set(cle, [...(groupes.get(cle) ?? []), e])
    }
    return ['Ce matin', 'Cet après-midi', 'Ce soir']
      .filter((c) => groupes.has(c))
      .map((c) => ({ creneau: c, evenements: groupes.get(c) ?? [] }))
  }, [evenements.data])

  const terminerMission = (mission: LigneTache) => {
    if (!membre) return
    navigator.vibrate?.([8, 60, 8])
    setBravo(true)
    setTimeout(() => setBravo(false), 1600)
    void completerTache(mission, gabriel?.id ?? membre.id, membres).then(() =>
      clientRequetes.invalidateQueries({ queryKey: ['taches'] }),
    )
  }

  if (!gabriel) return null

  return (
    <div className="safe-haut safe-bas fixed inset-0 z-40 flex flex-col bg-fond">
      <header className="flex items-center gap-3 px-5 py-3">
        <PastilleMembre membre={gabriel} taille={44} />
        <div className="flex-1">
          <p className="text-titre-3 text-encre">Salut {gabriel.prenom} !</p>
          <p className="chiffres text-note text-encre-3">⭐ {gabriel.points} points</p>
        </div>
        <button
          onClick={onQuitter}
          className="min-h-sur-tactile rounded-xl bg-fond-sourd px-3 text-note text-encre-3"
        >
          Mode parents
        </button>
      </header>

      <div className="flex gap-2 px-5 pb-2">
        {(
          [
            ['journee', '🌞 Ma journée'],
            ['missions', `🚀 Mes missions${missions.length > 0 ? ` (${missions.length})` : ''}`],
          ] as const
        ).map(([valeur, libelle]) => (
          <button
            key={valeur}
            onClick={() => {
              navigator.vibrate?.(4)
              setVolet(valeur)
            }}
            aria-pressed={volet === valeur}
            className={`btn-3d min-h-sur-tactile flex-1 text-corps font-[700]
              ${volet === valeur ? 'btn-ardoise' : 'btn-clair'}`}
          >
            {libelle}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8 pt-2">
        {volet === 'journee' ? (
          <div className="flex flex-col gap-4">
            {journee.length === 0 && (
              <p className="py-10 text-center text-titre-3 text-encre-2">
                Journée tranquille aujourd’hui 🧸
              </p>
            )}
            {journee.map((groupe) => (
              <section key={groupe.creneau}>
                <h2 className="mb-2 text-corps font-[700] text-encre-3">{groupe.creneau}</h2>
                <div className="flex flex-col gap-2">
                  {groupe.evenements.map((e) => (
                    <div key={e.id} className="flex items-center gap-4 rounded-xl bg-fond-eleve p-4 shadow-carte">
                      <span className="text-[40px] leading-none" aria-hidden="true">
                        {iconePourEvenement(e.titre)}
                      </span>
                      <div>
                        <p className="text-titre-3 text-encre">{e.titre}</p>
                        <p className="chiffres text-corps-2 text-encre-3">{formatHeure(e.debut_a)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {(routines.data ?? [])
              .filter((r) => r.membre_id === gabriel.id)
              .map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRoutineEnCours(r)}
                  className="btn-3d btn-sauge flex min-h-[64px] items-center justify-center gap-3 text-titre-3"
                >
                  {r.moment === 'matin' ? '🌞' : '🌙'} {r.nom}
                </button>
              ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {missions.length === 0 && (
              <p className="py-10 text-center text-titre-3 text-encre-2">
                Aucune mission — champion ! 🏆
              </p>
            )}
            {missions.map((mission) => (
              <motion.button
                key={mission.id}
                layout
                whileTap={{ scale: 0.97 }}
                onClick={() => terminerMission(mission)}
                className="flex min-h-[88px] items-center gap-4 rounded-xl bg-fond-eleve p-4 text-left shadow-carte"
              >
                <span
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 text-titre-3"
                  style={{ borderColor: 'var(--sauge)' }}
                  aria-hidden="true"
                />
                <div className="flex-1">
                  <p className="text-titre-3 text-encre">{mission.titre}</p>
                  {mission.points > 0 && (
                    <p className="chiffres text-corps-2 font-[700]" style={{ color: 'var(--ambre)' }}>
                      +{mission.points} points ⭐
                    </p>
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* Confettis discrets quand une mission est finie */}
      <AnimatePresence>
        {bravo && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {Array.from({ length: 14 }, (_, i) => (
              <motion.span
                key={i}
                className="absolute h-3 w-3 rounded-full"
                style={{
                  background: `var(--${['ambre', 'sauge', 'ardoise', 'corail', 'prune', 'or'][i % 6]})`,
                }}
                initial={{ x: 0, y: 0, scale: 1 }}
                animate={{
                  x: Math.cos((i / 14) * Math.PI * 2) * 130,
                  y: Math.sin((i / 14) * Math.PI * 2) * 130 + 40,
                  scale: 0,
                }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              />
            ))}
            <motion.p
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              className="text-titre text-encre"
            >
              Bravo ! 🎉
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {routineEnCours && (
        <ExecutionRoutine
          routine={routineEnCours}
          onTerminer={async () => setRoutineEnCours(null)}
          onFermer={() => setRoutineEnCours(null)}
        />
      )}
    </div>
  )
}
