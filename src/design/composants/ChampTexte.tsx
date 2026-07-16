import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  etiquette: string
}

export const ChampTexte = forwardRef<HTMLInputElement, Props>(function ChampTexte(
  { etiquette, id, ...reste },
  ref,
) {
  const identifiant = id ?? etiquette.toLowerCase().replace(/\W+/g, '-')
  return (
    <label htmlFor={identifiant} className="block">
      <span className="mb-1 block text-note font-[500] text-encre-2">{etiquette}</span>
      <input
        ref={ref}
        id={identifiant}
        className="min-h-sur-tactile w-full rounded-md border border-trait bg-fond-eleve px-3
          text-corps text-encre placeholder:text-encre-3"
        {...reste}
      />
    </label>
  )
})
