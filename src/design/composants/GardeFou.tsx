// Le filet de sécurité : plus jamais de page blanche NI d'app bloquée.
// Si un écran plante, on l'isole : le reste de l'app continue de vivre et on
// peut revenir au tableau de bord d'un appui (sans même recharger).
import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Proposé quand on peut sortir de l'écran fautif sans recharger. */
  surRetour?: () => void
}

interface Etat {
  erreur: Error | null
}

export class GardeFou extends Component<Props, Etat> {
  override state: Etat = { erreur: null }

  static getDerivedStateFromError(erreur: Error): Etat {
    return { erreur }
  }

  override render() {
    if (this.state.erreur) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-fond px-8 text-center">
          <span className="text-[56px]" aria-hidden="true">🧶</span>
          <h1 className="text-titre-3 text-encre">Oups, un fil s’est emmêlé</h1>
          <p className="text-corps-2 text-encre-3">
            Cet écran a rencontré un problème. Le reste de l’app fonctionne — tes données sont en sécurité.
          </p>
          {this.props.surRetour && (
            <button
              onClick={() => {
                this.setState({ erreur: null })
                this.props.surRetour?.()
              }}
              className="btn-3d btn-sauge min-h-sur-tactile px-6 text-corps-2"
            >
              ← Revenir au tableau de bord
            </button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="btn-3d btn-clair min-h-sur-tactile px-6 text-corps-2"
          >
            Recharger l’application
          </button>
          <p className="chiffres max-w-full overflow-hidden text-legende text-encre-3">
            {this.state.erreur.message.slice(0, 120)}
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
