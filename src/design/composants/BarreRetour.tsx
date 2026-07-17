import { useNavigate } from 'react-router-dom'

/** La barre de retour commune à toutes les sous-pages. */
export function BarreRetour({ titre, vers }: { titre?: string; vers?: string }) {
  const naviguer = useNavigate()
  return (
    <button
      onClick={() => {
        navigator.vibrate?.(4)
        if (vers) naviguer(vers)
        else if (window.history.length > 1) naviguer(-1)
        else naviguer('/')
      }}
      className="mb-1 flex min-h-sur-tactile items-center gap-1 text-corps-2 font-[590] text-ardoise"
    >
      <span aria-hidden="true" className="text-[20px] leading-none">‹</span>
      {titre ?? 'Retour'}
    </button>
  )
}
