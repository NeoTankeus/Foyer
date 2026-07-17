// Le filet de sécurité : plus jamais de page blanche. Si un écran plante,
// on l'affiche, on propose de recharger, et le reste de l'app survit.
import { Component, type ReactNode } from 'react'

interface Etat {
  erreur: Error | null
}

export class GardeFou extends Component<{ children: ReactNode }, Etat> {
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
            Cet écran a rencontré un problème. Recharge — tes données sont en sécurité.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn-3d btn-ardoise min-h-sur-tactile px-6 text-corps-2"
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
