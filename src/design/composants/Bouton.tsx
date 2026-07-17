import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  onClick?: () => void
  variante?: 'primaire' | 'discret' | 'urgent' | 'valider' | 'soleil'
  type?: 'button' | 'submit'
  desactive?: boolean
  pleineLargeur?: boolean
  etiquette?: string // aria-label si le contenu n'est pas du texte
}

// Boutons 3D colorés : ils s'enfoncent quand on appuie (voir tokens.css).
const styles: Record<NonNullable<Props['variante']>, string> = {
  primaire: 'btn-3d btn-ardoise',
  discret: 'btn-3d btn-clair',
  urgent: 'btn-3d btn-corail',
  valider: 'btn-3d btn-sauge',
  soleil: 'btn-3d btn-ambre',
}

export function Bouton({
  children,
  onClick,
  variante = 'primaire',
  type = 'button',
  desactive = false,
  pleineLargeur = false,
  etiquette,
}: Props) {
  return (
    <motion.button
      type={type}
      onClick={() => {
        navigator.vibrate?.(4)
        onClick?.()
      }}
      disabled={desactive}
      aria-label={etiquette}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      className={`min-h-sur-tactile min-w-sur-tactile whitespace-nowrap px-6 py-2.5 text-corps-2
        disabled:opacity-40 ${styles[variante]} ${pleineLargeur ? 'w-full' : ''}`}
    >
      {children}
    </motion.button>
  )
}
