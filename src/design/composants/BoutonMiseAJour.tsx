// Le nuage vert : un appui = vérification + installation de la mise à jour
// sur place, sans fermer l'app ni toucher au raccourci.
import { useEffect, useRef, useState } from 'react'
import { verifierMiseAJour } from '@/lib/maj'

type Etat = 'repos' | 'verifie' | 'installe' | 'a_jour'

export function BoutonMiseAJour() {
  const [etat, setEtat] = useState<Etat>('repos')
  const minuteur = useRef<number | null>(null)

  useEffect(() => () => {
    if (minuteur.current !== null) window.clearTimeout(minuteur.current)
  }, [])

  const verifier = async () => {
    if (etat === 'verifie' || etat === 'installe') return
    navigator.vibrate?.(4)
    setEtat('verifie')
    const resultat = await verifierMiseAJour()
    if (resultat === 'nouvelle') {
      // La nouvelle version s'active : l'app se recharge automatiquement.
      // Filet de sécurité si le rechargement ne vient pas tout seul.
      setEtat('installe')
      minuteur.current = window.setTimeout(() => window.location.reload(), 8000)
    } else {
      setEtat('a_jour')
      minuteur.current = window.setTimeout(() => setEtat('repos'), 2500)
    }
  }

  const CONTENU: Record<Etat, string> = {
    repos: '☁️',
    verifie: '☁️',
    installe: '⬇️',
    a_jour: '✓',
  }

  return (
    <button
      onClick={() => void verifier()}
      aria-label="Vérifier les mises à jour de l’application"
      title="Mise à jour de l’app"
      className={`flex min-h-sur-tactile min-w-sur-tactile shrink-0 items-center justify-center rounded-full
        text-[17px] transition-colors
        ${etat === 'a_jour' ? 'font-[700] text-white' : ''}
        ${etat === 'verifie' ? 'animate-pulse' : ''}`}
      style={{
        background:
          etat === 'a_jour'
            ? 'var(--sauge)'
            : 'color-mix(in srgb, var(--sauge) 22%, transparent)',
      }}
    >
      {CONTENU[etat]}
    </button>
  )
}
