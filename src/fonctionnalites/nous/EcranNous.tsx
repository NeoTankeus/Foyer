// Nous : les membres du foyer, l'état de la sync, la déconnexion.
import { useEffect, useState } from 'react'
import { utiliserSession } from '@/etat/session'
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
  const [enAttente, setEnAttente] = useState(0)

  useEffect(() => {
    void baseLocale.file_attente.count().then(setEnAttente)
  }, [])

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

        <Carte>
          <p className="text-corps-2 text-encre-3">
            Équilibre de la charge, intégrations (calendrier Apple, colis) et Coffre
            arrivent dans les prochaines phases.
          </p>
        </Carte>

        <Bouton variante="discret" pleineLargeur onClick={() => void deconnecter()}>
          Se déconnecter
        </Bouton>
      </div>
    </div>
  )
}
