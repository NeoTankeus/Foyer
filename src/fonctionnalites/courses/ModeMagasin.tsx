// Mode magasin : gros texte, coche au tap n'importe où sur la ligne,
// les cochés glissent en bas, l'écran ne s'éteint pas (Wake Lock API).
import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { LigneArticle } from '@/lib/basedonnees.types'
import { indexRayon } from './rayons'

interface Props {
  ouvert: boolean
  onFermer: () => void
  articles: LigneArticle[]
  onBascule: (article: LigneArticle) => void
}

export function ModeMagasin({ ouvert, onFermer, articles, onBascule }: Props) {
  const verrouEcran = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!ouvert) return
    let annule = false
    const demander = async () => {
      try {
        if ('wakeLock' in navigator) {
          const verrou = await navigator.wakeLock.request('screen')
          if (annule) void verrou.release()
          else verrouEcran.current = verrou
        }
      } catch {
        // pas de Wake Lock : on continue sans, l'écran s'éteindra normalement
      }
    }
    void demander()
    const surVisibilite = () => {
      if (document.visibilityState === 'visible') void demander()
    }
    document.addEventListener('visibilitychange', surVisibilite)
    return () => {
      annule = true
      document.removeEventListener('visibilitychange', surVisibilite)
      void verrouEcran.current?.release()
      verrouEcran.current = null
    }
  }, [ouvert])

  const tries = [...articles].sort((a, b) => {
    if (a.coche !== b.coche) return a.coche ? 1 : -1
    return indexRayon(a.rayon) - indexRayon(b.rayon) || a.libelle.localeCompare(b.libelle)
  })

  return (
    <AnimatePresence>
      {ouvert && (
        <motion.div
          className="safe-haut safe-bas fixed inset-0 z-50 flex flex-col bg-fond"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="flex items-center justify-between px-5 py-3">
            <h2 className="text-titre-2 text-encre">Magasin</h2>
            <button
              onClick={onFermer}
              className="min-h-sur-tactile rounded-md bg-fond-sourd px-4 text-corps font-[590] text-encre"
            >
              Terminé
            </button>
          </div>
          <ul className="flex-1 overflow-y-auto px-3 pb-8">
            <AnimatePresence initial={false}>
              {tries.map((article) => (
                <motion.li
                  key={article.id}
                  layout
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                >
                  <button
                    onClick={() => {
                      navigator.vibrate?.(8)
                      onBascule(article)
                    }}
                    className={`mb-1 flex w-full items-center gap-3 rounded-md px-4 py-4 text-left
                      ${article.coche ? 'opacity-40' : 'bg-fond-eleve shadow-carte'}`}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2"
                      style={{
                        borderColor: article.coche ? 'var(--fait)' : 'var(--trait)',
                        background: article.coche ? 'var(--fait)' : 'transparent',
                        color: 'var(--fond-eleve)',
                      }}
                    >
                      {article.coche ? '✓' : ''}
                    </span>
                    <span
                      className={`text-titre-3 ${article.coche ? 'text-encre-3 line-through' : 'text-encre'}`}
                    >
                      {article.libelle}
                    </span>
                    <span className="ml-auto text-note text-encre-3">{article.rayon}</span>
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
