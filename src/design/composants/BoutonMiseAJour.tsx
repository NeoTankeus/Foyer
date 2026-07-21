// Le nuage vert : un appui = vérification + installation de la mise à jour
// sur place. Pendant l'installation : anneau de progression façon Apple qui
// se remplit autour de la flèche, ✓ à la fin, puis rechargement automatique.
import { useEffect, useRef, useState } from 'react'
import {
  mettreAJourMaintenant,
  surInstallationEnCours,
  surMiseAJourDisponible,
  surProgresMaj,
  verifierMiseAJour,
} from '@/lib/maj'

type Etat = 'repos' | 'verifie' | 'installe' | 'a_jour' | 'dispo'

const RAYON = 14
const CIRCONFERENCE = 2 * Math.PI * RAYON

export function BoutonMiseAJour() {
  const [etat, setEtat] = useState<Etat>('repos')
  const [reel, setReel] = useState(0) // jalons réels (service worker)
  const [affiche, setAffiche] = useState(0) // l'anneau, qui avance en douceur
  const minuteur = useRef<number | null>(null)

  // Pastille rouge dès qu'une nouvelle version est prête en coulisses.
  useEffect(() => surMiseAJourDisponible(() => setEtat((e) => (e === 'installe' ? e : 'dispo'))), [])
  // L'installation automatique (à l'ouverture) s'affiche en direct.
  useEffect(() => surInstallationEnCours(() => setEtat('installe')), [])
  // Les jalons réels de l'installation.
  useEffect(() => surProgresMaj(setReel), [])

  // L'anneau avance en continu vers le prochain jalon (jamais bloqué, jamais menteur).
  useEffect(() => {
    if (etat !== 'installe') {
      setAffiche(0)
      return
    }
    const glissement = window.setInterval(() => {
      setAffiche((a) => {
        const plafond = reel >= 100 ? 100 : Math.min(reel + 14, 94)
        return a < plafond ? Math.min(a + 1.4, plafond) : a
      })
    }, 160)
    return () => window.clearInterval(glissement)
  }, [etat, reel])

  useEffect(() => () => {
    if (minuteur.current !== null) window.clearTimeout(minuteur.current)
  }, [])

  const verifier = async () => {
    if (etat === 'verifie' || etat === 'installe') return
    navigator.vibrate?.(4)
    if (etat === 'dispo') {
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

  const fini = affiche >= 100

  return (
    <>
      <button
        onClick={() => void verifier()}
        aria-label={
          etat === 'installe'
            ? `Installation en cours — ${Math.round(affiche)} %`
            : etat === 'dispo'
              ? 'Mise à jour disponible — toucher pour installer'
              : 'Vérifier les mises à jour'
        }
        title="Mise à jour de l’app"
        className={`relative flex min-h-sur-tactile min-w-sur-tactile shrink-0 items-center justify-center rounded-full
          text-[17px] transition-colors
          ${etat === 'a_jour' ? 'font-[700] text-white' : ''}
          ${etat === 'verifie' ? 'animate-pulse' : ''}`}
        style={{
          background:
            etat === 'a_jour' || fini
              ? 'var(--sauge)'
              : 'color-mix(in srgb, var(--sauge) 22%, transparent)',
        }}
      >
        {etat === 'installe' ? (
          // ⭕️ L'anneau façon Apple : il se remplit sur les vrais jalons.
          <span className="relative flex h-9 w-9 items-center justify-center">
            <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90">
              <circle cx="18" cy="18" r={RAYON} fill="none" stroke="color-mix(in srgb, var(--sauge) 30%, transparent)" strokeWidth="3" />
              <circle
                cx="18" cy="18" r={RAYON} fill="none"
                stroke={fini ? '#fff' : 'var(--sauge)'}
                strokeWidth="3" strokeLinecap="round"
                strokeDasharray={CIRCONFERENCE}
                strokeDashoffset={CIRCONFERENCE * (1 - affiche / 100)}
                style={{ transition: 'stroke-dashoffset 200ms linear' }}
              />
            </svg>
            <span className={`text-[13px] font-[800] ${fini ? 'text-white' : 'text-encre'}`}>
              {fini ? '✓' : '↓'}
            </span>
          </span>
        ) : (
          <>{etat === 'a_jour' ? '✓' : '☁️'}</>
        )}
        {etat === 'dispo' && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 animate-pulse rounded-full border-2 border-fond bg-urgent"
          />
        )}
      </button>

      {/* L'installation se VOIT : bannière au-dessus des onglets, avec le pourcentage. */}
      {(etat === 'installe' || etat === 'verifie') && (
        <div
          role="status"
          className="verre verre-clair calage-fixe fixed inset-x-4 z-40 flex items-center gap-3 rounded-2xl border border-trait px-4 py-3 shadow-carte"
          style={{ bottom: 'calc(96px + env(safe-area-inset-bottom))' }}
        >
          <span className={`text-[20px] ${fini ? '' : 'animate-pulse'}`} aria-hidden="true">
            {etat === 'verifie' ? '☁️' : fini ? '✅' : '⬇️'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-corps-2 font-[590] text-encre">
              {etat === 'verifie'
                ? 'Vérification de la version…'
                : fini
                  ? 'Mise à jour installée ✓ — rechargement…'
                  : `Installation de la mise à jour… ${Math.round(affiche)} %`}
            </p>
            {etat === 'installe' && !fini && (
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fond-sourd">
                <div
                  className="h-full rounded-full bg-sauge"
                  style={{ width: `${affiche}%`, transition: 'width 200ms linear' }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
