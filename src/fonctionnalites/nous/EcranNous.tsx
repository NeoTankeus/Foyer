// Nous : la famille, et la porte d'entrée des modules du foyer.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { utiliserSession } from '@/etat/session'
import { utiliserUi } from '@/etat/ui'
import { baseLocale } from '@/lib/dexie'
import { rejouerFileAttente } from '@/lib/sync'
import { PastilleMembre } from '@/design/composants/PastilleMembre'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'

const ROLES: Record<string, string> = {
  adult: 'Adulte',
  child: 'Enfant',
  guest: 'Invité',
}

export function EcranNous() {
  const { membre, membres, foyer, deconnecter } = utiliserSession()
  const { activerModeEnfant } = utiliserUi()
  const naviguer = useNavigate()
  const [enAttente, setEnAttente] = useState(0)

  useEffect(() => {
    void baseLocale.file_attente.count().then(setEnAttente)
  }, [])

  const estAdulte = membre?.role === 'adult'

  const MODULES: { chemin: string; libelle: string; detail: string; icone: string; couleur: string; adulte?: boolean }[] = [
    { chemin: '/nous/equilibre', libelle: 'Équilibre', detail: 'la répartition réelle, en minutes', icone: '⚖️', couleur: 'var(--ardoise)', adulte: true },
    { chemin: '/nous/celebrations', libelle: 'Célébrations', detail: 'anniversaires et coffre à idées', icone: '🎂', couleur: 'var(--corail)' },
    { chemin: '/nous/voyages', libelle: 'Voyages', detail: 'valises, réservations, météo', icone: '✈️', couleur: 'var(--ardoise)' },
    { chemin: '/nous/souvenirs', libelle: 'Souvenirs', detail: 'photos par voyage, album imprimable', icone: '📷', couleur: 'var(--or)' },
    { chemin: '/nous/routines', libelle: 'Routines', detail: 'les matins et soirs de Gabriel', icone: '⏰', couleur: 'var(--sauge)' },
    { chemin: '/nous/recompenses', libelle: 'Récompenses', detail: 'points → vraies récompenses', icone: '🎁', couleur: 'var(--prune)' },
    { chemin: '/nous/coffre', libelle: 'Le Coffre', detail: 'papiers et échéances', icone: '🗄️', couleur: 'var(--encre-2)', adulte: true },
    { chemin: '/nous/colis', libelle: 'Colis', detail: 'suivis, invisibles pour Gabriel', icone: '📦', couleur: 'var(--ambre)', adulte: true },
    { chemin: '/nous/administration', libelle: 'Administration', detail: 'membres, rôles, journal d’audit', icone: '🛠️', couleur: 'var(--encre-2)', adulte: true },
  ]

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <h1 className="text-titre-2 text-encre">Nous</h1>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <Carte>
          <h2 className="mb-2 text-note font-[590] uppercase tracking-wide text-encre-3">
            {foyer?.nom ?? 'Le foyer'}
          </h2>
          <ul>
            {membres.map((m) => (
              <li key={m.id} className="flex items-center gap-3 border-b border-trait py-2 last:border-0">
                <PastilleMembre membre={m} taille={34} />
                <div className="flex-1">
                  <p className="text-corps text-encre">
                    {m.prenom}
                    {m.id === membre?.id ? ' (toi)' : ''}
                  </p>
                  <p className="text-legende text-encre-3">{ROLES[m.role] ?? m.role}</p>
                </div>
                {m.role === 'child' && (
                  <span className="chiffres text-note text-encre-3">{m.points} pts</span>
                )}
              </li>
            ))}
          </ul>
        </Carte>

        {estAdulte && membres.some((m) => m.role === 'child') && (
          <Bouton variante="soleil" pleineLargeur onClick={activerModeEnfant}>
            🧒 Passer en mode enfant
          </Bouton>
        )}

        <nav aria-label="Modules du foyer" className="overflow-hidden rounded-lg bg-fond-eleve shadow-carte">
          {MODULES.filter((m) => !m.adulte || estAdulte).map((module) => (
            <button
              key={module.chemin}
              onClick={() => {
                navigator.vibrate?.(4)
                naviguer(module.chemin)
              }}
              className="flex min-h-sur-tactile w-full items-center gap-3 border-b border-trait px-4 py-3
                text-left last:border-0 active:bg-fond-sourd"
            >
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[22px]"
                style={{ background: `color-mix(in srgb, ${module.couleur} 14%, transparent)` }}
              >
                {module.icone}
              </span>
              <div className="flex-1">
                <p className="text-corps font-[590] text-encre">{module.libelle}</p>
                <p className="text-legende text-encre-3">{module.detail}</p>
              </div>
              <span aria-hidden="true" className="text-encre-3">›</span>
            </button>
          ))}
        </nav>

        {enAttente > 0 && (
          <Carte>
            <p className="text-corps-2 text-encre-2">
              {enAttente} modification{enAttente > 1 ? 's' : ''} en attente de réseau.
            </p>
            <div className="mt-2">
              <Bouton
                variante="discret"
                onClick={() => {
                  void rejouerFileAttente().then(() =>
                    baseLocale.file_attente.count().then(setEnAttente),
                  )
                }}
              >
                Synchroniser maintenant
              </Bouton>
            </div>
          </Carte>
        )}

        <Bouton variante="discret" pleineLargeur onClick={() => void deconnecter()}>
          Se déconnecter
        </Bouton>
      </div>
    </div>
  )
}
