import { motion } from 'framer-motion'

interface Props {
  cochee: boolean
  onBascule: () => void
  etiquette: string
  couleur?: string // couleur de membre, sinon vert « fait »
}

/** La coche — haptique à chaque bascule, ressort 400/32. */
export function Coche({ cochee, onBascule, etiquette, couleur }: Props) {
  const teinte = couleur ?? 'var(--fait)'
  return (
    <button
      role="checkbox"
      aria-checked={cochee}
      aria-label={etiquette}
      onClick={() => {
        navigator.vibrate?.(8)
        onBascule()
      }}
      className="flex min-h-sur-tactile min-w-sur-tactile items-center justify-center"
    >
      <motion.span
        animate={{ scale: cochee ? 1 : 0.92 }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-2"
        style={{
          borderColor: cochee ? teinte : 'var(--trait)',
          background: cochee ? teinte : 'transparent',
        }}
      >
        {cochee && (
          <motion.svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          >
            <motion.path
              d="M2.5 7.5 L5.5 10.5 L11.5 3.5"
              fill="none"
              stroke="var(--fond-eleve)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
            />
          </motion.svg>
        )}
      </motion.span>
    </button>
  )
}
