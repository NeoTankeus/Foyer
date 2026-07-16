import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  onClick?: () => void
  variante?: 'primaire' | 'discret' | 'urgent'
  type?: 'button' | 'submit'
  desactive?: boolean
  pleineLargeur?: boolean
  etiquette?: string // aria-label si le contenu n'est pas du texte
}

const styles: Record<NonNullable<Props['variante']>, string> = {
  primaire: 'bg-encre text-fond',
  discret: 'bg-fond-sourd text-encre',
  urgent: 'bg-urgent text-fond-eleve',
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
      onClick={onClick}
      disabled={desactive}
      aria-label={etiquette}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      className={`min-h-sur-tactile min-w-sur-tactile rounded-md px-5 text-corps-2 font-[590]
        disabled:opacity-40 ${styles[variante]} ${pleineLargeur ? 'w-full' : ''}`}
    >
      {children}
    </motion.button>
  )
}
