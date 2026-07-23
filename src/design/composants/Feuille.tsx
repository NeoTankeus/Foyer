import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface Props {
  ouverte: boolean
  onFermer: () => void
  titre: string
  children: ReactNode
}

/**
 * Feuille modale iOS : monte du bas, ressort 320/34, fond translucide.
 * Au-dessus de TOUT (barre d'onglets et boutons flottants compris), et
 * quand le clavier s'ouvre, la feuille REMONTE d'autant — le bouton
 * « Enregistrer » reste toujours atteignable, le contenu défile à l'intérieur.
 */
export function Feuille({ ouverte, onFermer, titre, children }: Props) {
  // La hauteur du clavier, mesurée en direct via le visualViewport.
  const [clavier, setClavier] = useState(0)
  useEffect(() => {
    if (!ouverte) {
      setClavier(0)
      return
    }
    const vv = window.visualViewport
    if (!vv) return
    const mesurer = () => setClavier(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    mesurer()
    vv.addEventListener('resize', mesurer)
    vv.addEventListener('scroll', mesurer)
    return () => {
      vv.removeEventListener('resize', mesurer)
      vv.removeEventListener('scroll', mesurer)
    }
  }, [ouverte])

  return (
    <AnimatePresence>
      {ouverte && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-encre/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onFermer}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={titre}
            className="verre verre-clair safe-bas fixed inset-x-0 z-[70] rounded-t-xl
              shadow-feuille"
            style={{ bottom: clavier }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          >
            <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-encre-3/40" />
            <div className="flex items-center justify-between px-5 pb-1 pt-3">
              <h2 className="min-w-0 flex-1 truncate text-titre-3 text-encre">{titre}</h2>
              <button
                onClick={onFermer}
                aria-label="Fermer"
                className="flex min-h-sur-tactile min-w-sur-tactile items-center justify-center
                  rounded-full text-encre-3"
              >
                ✕
              </button>
            </div>
            <div
              className="overflow-y-auto px-5 pb-6"
              style={{ maxHeight: `calc(100dvh - ${clavier}px - 150px)` }}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
