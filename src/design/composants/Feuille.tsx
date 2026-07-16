import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface Props {
  ouverte: boolean
  onFermer: () => void
  titre: string
  children: ReactNode
}

/** Feuille modale iOS : monte du bas, ressort 320/34, fond translucide. */
export function Feuille({ ouverte, onFermer, titre, children }: Props) {
  return (
    <AnimatePresence>
      {ouverte && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-encre/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onFermer}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={titre}
            className="verre verre-clair safe-bas fixed inset-x-0 bottom-0 z-50 rounded-t-xl
              shadow-feuille"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          >
            <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-encre-3/40" />
            <div className="flex items-center justify-between px-5 pb-1 pt-3">
              <h2 className="text-titre-3 text-encre">{titre}</h2>
              <button
                onClick={onFermer}
                aria-label="Fermer"
                className="flex min-h-sur-tactile min-w-sur-tactile items-center justify-center
                  rounded-full text-encre-3"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto px-5 pb-6">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
