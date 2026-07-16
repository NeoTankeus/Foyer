interface Props {
  titre: string
  message: string
}

/** Un écran vide est une invitation, pas un trou (§10). */
export function EtatVide({ titre, message }: Props) {
  return (
    <div className="flex flex-col items-center gap-1 px-8 py-12 text-center">
      <p className="text-corps font-[590] text-encre-2">{titre}</p>
      <p className="text-corps-2 text-encre-3">{message}</p>
    </div>
  )
}
