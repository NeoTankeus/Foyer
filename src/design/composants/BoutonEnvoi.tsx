// 🟢 Le bouton d'envoi : pendant un téléversement ou un traitement, il se
// remplit de vert de gauche à droite (progression), se VERROUILLE contre les
// doubles appuis (fini les doublons !), puis affiche ✓ un instant.
// La progression avance en douceur vers 90 % et ne se complète qu'à la fin
// réelle du travail — jamais bloquée, jamais menteuse.
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Le travail asynchrone : le bouton se remplit tant qu'il n'est pas fini. */
  onEnvoi?: () => Promise<unknown>
  /**
   * Mode piloté : si fourni, le bouton ne lance pas le travail lui-même.
   * Il se remplit tant que `enCours` est vrai, puis affiche ✓ quand il
   * repasse à faux. Utile quand le travail part d'un onChange (input file).
   */
  enCours?: boolean
  /** En mode piloté : l'appui (ouvre par ex. le sélecteur de fichiers). */
  onClick?: () => void
  variante?: 'primaire' | 'discret' | 'urgent' | 'valider' | 'soleil'
  desactive?: boolean
  pleineLargeur?: boolean
  etiquette?: string
  /** Texte affiché pendant le travail (sinon le contenu du bouton reste). */
  enfantsPendant?: ReactNode
}

const styles: Record<NonNullable<Props['variante']>, string> = {
  primaire: 'btn-3d btn-ardoise',
  discret: 'btn-3d btn-clair',
  urgent: 'btn-3d btn-corail',
  valider: 'btn-3d btn-sauge',
  soleil: 'btn-3d btn-ambre',
}

export function BoutonEnvoi({
  children,
  onEnvoi,
  enCours,
  onClick,
  variante = 'primaire',
  desactive = false,
  pleineLargeur = false,
  etiquette,
  enfantsPendant,
}: Props) {
  const [etat, setEtat] = useState<'repos' | 'envoi' | 'fait'>('repos')
  const [progres, setProgres] = useState(0)
  const vivant = useRef(true)
  // Mode piloté : c'est le parent qui dit quand le travail commence et finit.
  const pilote = enCours !== undefined

  useEffect(() => () => {
    vivant.current = false
  }, [])

  // En mode piloté, on suit `enCours` : vrai → remplissage, faux → ✓ puis repos.
  useEffect(() => {
    if (!pilote) return
    if (enCours) {
      setProgres(6)
      setEtat('envoi')
      return
    }
    setEtat((e) => {
      if (e !== 'envoi') return e
      setProgres(100)
      window.setTimeout(() => {
        if (vivant.current) {
          setEtat('repos')
          setProgres(0)
        }
      }, 1200)
      return 'fait'
    })
  }, [pilote, enCours])

  // Le remplissage : rapide au départ, puis il ralentit en approchant 90 %.
  useEffect(() => {
    if (etat !== 'envoi') return
    const glissement = window.setInterval(() => {
      setProgres((p) => (p < 90 ? p + Math.max(0.6, (90 - p) / 12) : p))
    }, 120)
    return () => window.clearInterval(glissement)
  }, [etat])

  const lancer = async () => {
    if (etat !== 'repos' || desactive) return
    navigator.vibrate?.(4)
    // En mode piloté, l'appui ne fait qu'ouvrir (le parent gère le reste).
    if (pilote) {
      onClick?.()
      return
    }
    if (!onEnvoi) return
    setProgres(6)
    setEtat('envoi')
    try {
      await onEnvoi()
    } finally {
      if (vivant.current) {
        setProgres(100)
        setEtat('fait')
        window.setTimeout(() => {
          if (vivant.current) {
            setEtat('repos')
            setProgres(0)
          }
        }, 1200)
      }
    }
  }

  const occupe = etat !== 'repos'
  return (
    <motion.button
      type="button"
      onClick={() => void lancer()}
      disabled={desactive || occupe}
      aria-label={etiquette}
      aria-busy={etat === 'envoi'}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      className={`relative inline-flex min-h-sur-tactile min-w-sur-tactile shrink-0 items-center justify-center
        overflow-hidden px-4 py-2.5 text-center text-corps-2 leading-tight
        ${desactive && !occupe ? 'opacity-40' : ''} ${styles[variante]} ${pleineLargeur ? 'w-full' : ''}`}
    >
      {/* La vague verte qui remplit le bouton pendant le travail. */}
      {occupe && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 bg-sauge/70"
          style={{ width: `${progres}%`, transition: 'width 200ms linear' }}
        />
      )}
      <span className="relative z-[1] inline-flex items-center gap-1.5">
        {etat === 'fait' ? '✓ Bien reçu !' : etat === 'envoi' ? (enfantsPendant ?? children) : children}
      </span>
    </motion.button>
  )
}
