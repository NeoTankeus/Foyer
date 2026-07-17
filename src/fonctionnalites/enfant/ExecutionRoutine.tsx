// Exécution d'une routine : une étape à la fois, plein écran, chronométrée.
// Grosse coche, haptique, écran qui ne s'éteint pas.
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { LigneRoutine } from '@/lib/basedonnees.types'

interface Props {
  routine: LigneRoutine
  onTerminer: () => Promise<void>
  onFermer: () => void
}

export function ExecutionRoutine({ routine, onTerminer, onFermer }: Props) {
  const [index, setIndex] = useState(0)
  const [restant, setRestant] = useState(routine.etapes[0]?.duree_secondes ?? 0)
  const [finie, setFinie] = useState(false)
  const verrou = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        if ('wakeLock' in navigator) verrou.current = await navigator.wakeLock.request('screen')
      } catch { /* sans Wake Lock, l'écran s'éteindra normalement */ }
    })()
    return () => void verrou.current?.release()
  }, [])

  useEffect(() => {
    if (finie) return
    const minuteur = setInterval(() => setRestant((r) => Math.max(0, r - 1)), 1000)
    return () => clearInterval(minuteur)
  }, [index, finie])

  const etape = routine.etapes[index]
  const total = routine.etapes.length

  const suivante = () => {
    navigator.vibrate?.(8)
    if (index + 1 >= total) {
      setFinie(true)
      navigator.vibrate?.([8, 60, 8, 60, 16])
      void onTerminer()
    } else {
      setIndex(index + 1)
      setRestant(routine.etapes[index + 1]?.duree_secondes ?? 0)
    }
  }

  return (
    <div className="safe-haut safe-bas fixed inset-0 z-50 flex flex-col bg-fond">
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex gap-1" aria-label={`Étape ${index + 1} sur ${total}`}>
          {routine.etapes.map((_, i) => (
            <span
              key={i}
              className="h-1.5 w-6 rounded-full"
              style={{ background: i <= index ? 'var(--ardoise)' : 'var(--trait)' }}
            />
          ))}
        </div>
        <button onClick={onFermer} className="min-h-sur-tactile px-3 text-corps-2 text-encre-3">
          Fermer
        </button>
      </div>

      <AnimatePresence mode="wait">
        {finie ? (
          <motion.div
            key="bravo"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="flex flex-1 flex-col items-center justify-center gap-4 px-8"
          >
            <span className="text-[72px]" aria-hidden="true">🎉</span>
            <p className="text-center text-titre-2 text-encre">Bravo, tout est fait !</p>
          </motion.div>
        ) : etape ? (
          <motion.button
            key={index}
            onClick={suivante}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="flex flex-1 flex-col items-center justify-center gap-5 px-8"
          >
            <span className="text-[96px] leading-none" aria-hidden="true">{etape.icone}</span>
            <p className="text-center text-titre text-encre">{etape.libelle}</p>
            <p
              className="chiffres text-titre-3"
              style={{ color: restant === 0 ? 'var(--corail)' : 'var(--encre-3)' }}
            >
              {Math.floor(restant / 60)}:{String(restant % 60).padStart(2, '0')}
            </p>
            <p className="text-corps-2 text-encre-3">Touche l’écran quand c’est fait</p>
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
