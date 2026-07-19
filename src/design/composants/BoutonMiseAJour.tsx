// Le nuage vert : un appui = vérification + installation de la mise à jour
// sur place, sans fermer l'app ni toucher au raccourci.
import { useEffect, useRef, useState } from 'react'
import { mettreAJourMaintenant, surMiseAJourDisponible, verifierMiseAJour } from '@/lib/maj'

type Etat = 'repos' | 'verifie' | 'installe' | 'a_jour' | 'dispo'

export function BoutonMiseAJour() {
  const [etat, setEtat] = useState<Etat>('repos')
  const minuteur = useRef<number | null>(null)

  // Pastille rouge dès qu'une nouvelle version est prête en coulisses.
  useEffect(() => surMiseAJourDisponible(() => setEtat('dispo')), [])

  useEffect(() => () => {
    if (minuteur.current !== null) window.clearTimeout(minuteur.current)
  }, [])

  const verifier = async () => {
    if (etat === 'verifie' || etat === 'installe') return
    navigator.vibrate?.(4)
    if (etat === 'dispo') {
      // La nouvelle version est là : installation garantie, rechargement inclus.
      setEtat('installe')
      await mettreAJourMaintenant()
      return
    }
    setEtat('verifie')
    const resultat = await verifierMiseAJour()
    if (resultat === 'nouvelle') {
      setEtat('installe')
      await mettreAJourMaintenant()
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
    dispo: '☁️',
  }

  return (
    <button
      onClick={() => void verifier()}
      aria-label={etat === 'dispo' ? 'Mise à jour disponible — toucher pour installer' : 'Vérifier les mises à jour'}
      title="Mise à jour de l’app"
      className={`relative flex min-h-sur-tactile min-w-sur-tactile shrink-0 items-center justify-center rounded-full
        text-[17px] transition-colors
        ${etat === 'a_jour' ? 'font-[700] text-white' : ''}
        ${etat === 'verifie' || etat === 'installe' ? 'animate-pulse' : ''}`}
      style={{
        background:
          etat === 'a_jour'
            ? 'var(--sauge)'
            : 'color-mix(in srgb, var(--sauge) 22%, transparent)',
      }}
    >
      {CONTENU[etat]}
      {etat === 'dispo' && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 animate-pulse rounded-full border-2 border-fond bg-urgent"
        />
      )}
    </button>
  )
}
