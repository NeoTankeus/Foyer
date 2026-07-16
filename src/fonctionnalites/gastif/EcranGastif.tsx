// Gastif arrive en phase 2 (contexte + outils, depuis une Edge Function).
// On ne fait pas semblant : l'écran le dit.
export function EcranGastif() {
  return (
    <div className="safe-haut flex min-h-dvh flex-col items-center justify-center gap-6 px-8 pb-24">
      {/* La forme organique — elle respire lentement, teinte or. Pas de mascotte. */}
      <svg width="88" height="88" viewBox="0 0 88 88" className="gastif-respire" aria-hidden="true">
        <path
          d="M44 8c15 0 34.5 10.5 34.5 32S64 80 44 80 9.5 61.5 9.5 40 29 8 44 8Z"
          fill="var(--or)"
          opacity="0.9"
        />
      </svg>
      <div className="text-center">
        <h1 className="text-titre-3 text-encre">Gastif</h1>
        <p className="mt-2 text-corps-2 text-encre-3">
          L’intendant du foyer s’installe à la phase 2. Il lira l’agenda, les tâches et
          les courses — et il agira avant de parler.
        </p>
      </div>
    </div>
  )
}
