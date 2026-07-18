// « Quoi de neuf » : à chaque mise à jour, un petit pop-up au milieu de
// l'écran résume ce qui change. Une seule fois par version. Signé ILY.
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { NOTES_VERSION } from '@/lib/notes-version'
import { Bouton } from './Bouton'

const CLE = 'foyer-version-vue'

export function PopupNouveautes() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(CLE) !== __DATE_VERSION__) setVisible(true)
    } catch {
      // stockage indisponible : on n'insiste pas
    }
  }, [])

  const fermer = () => {
    try {
      localStorage.setItem(CLE, __DATE_VERSION__)
    } catch {
      // tant pis, il reviendra
    }
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-encre/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={fermer}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Nouveautés de la mise à jour"
            className="fixed inset-x-5 top-1/2 z-50 mx-auto max-w-md rounded-xl bg-fond-eleve p-5 shadow-feuille"
            initial={{ opacity: 0, y: '-42%', scale: 0.92 }}
            animate={{ opacity: 1, y: '-50%', scale: 1 }}
            exit={{ opacity: 0, y: '-46%', scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          >
            <h2 className="text-titre-3 text-encre">Mise à jour installée ✨</h2>
            <p className="mb-3 text-legende text-encre-3">Version du {__DATE_VERSION__}</p>
            <ul className="mb-4 flex flex-col gap-2">
              {NOTES_VERSION.map((note, i) => (
                <li key={i} className="text-corps-2 leading-snug text-encre-2">
                  {note}
                </li>
              ))}
            </ul>
            <Bouton pleineLargeur variante="valider" onClick={fermer}>
              Compris !
            </Bouton>
            {/* La signature de la maison */}
            <div className="mt-4 flex justify-center">
              <span className="badge-ily h-8 w-12 text-[13px]" aria-label="Signé ILY">
                ILY
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
