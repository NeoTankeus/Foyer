import type { ReactNode } from 'react'

export function Carte({ children, classe = '' }: { children: ReactNode; classe?: string }) {
  return (
    <div className={`rounded-lg bg-fond-eleve p-4 shadow-carte ${classe}`}>{children}</div>
  )
}
