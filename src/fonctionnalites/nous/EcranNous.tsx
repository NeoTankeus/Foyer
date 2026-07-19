// Nous : la famille, et la porte d'entrée des modules du foyer.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { utiliserSession } from '@/etat/session'
import { baseLocale } from '@/lib/dexie'
import { rejouerFileAttente } from '@/lib/sync'
import { activerNotifications, etatAbonnement, notificationsPossibles } from '@/lib/notifications'
import { mettreAJourMaintenant, verifierMiseAJour } from '@/lib/maj'
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
  const naviguer = useNavigate()
  const [enAttente, setEnAttente] = useState(0)
  const [notifications, setNotifications] = useState<'active' | 'refuse' | 'inactif'>('inactif')
  const [etatMaj, setEtatMaj] = useState<'repos' | 'verifie' | 'installe' | 'a_jour' | 'indispo'>('repos')

  useEffect(() => {
    void baseLocale.file_attente.count().then(setEnAttente)
    void etatAbonnement().then(setNotifications)
  }, [])

  const estAdulte = membre?.role === 'adult'

  const MODULES: { chemin: string; libelle: string; detail: string; icone: string; couleur: string; adulte?: boolean }[] = [
    { chemin: '/nous/equilibre', libelle: 'Équilibre', detail: 'la répartition réelle, en minutes', icone: '⚖️', couleur: 'var(--ardoise)', adulte: true },
    { chemin: '/nous/celebrations', libelle: 'Célébrations', detail: 'anniversaires et coffre à idées', icone: '🎂', couleur: 'var(--corail)' },
    { chemin: '/nous/voyages', libelle: 'Voyages', detail: 'valises, réservations, météo', icone: '✈️', couleur: 'var(--ardoise)' },
    { chemin: '/nous/concerts', libelle: 'Concerts & sorties', detail: 'billets scannés, prêts pour l’entrée', icone: '🎤', couleur: 'var(--corail)' },
    { chemin: '/nous/comparateur', libelle: 'Comparateur de prix', detail: 'scanne en boutique, compare sur internet', icone: '🏷️', couleur: 'var(--or)' },
    { chemin: '/nous/inventaire', libelle: 'Placards & congélo', detail: 'stocks, DLC, anti-gaspi', icone: '🧊', couleur: 'var(--ardoise)' },
    { chemin: '/nous/personnes', libelle: 'Les proches', detail: 'goûts, tailles, cadeaux déjà offerts', icone: '👥', couleur: 'var(--prune)', adulte: true },
    { chemin: '/nous/rendez-vous', libelle: 'Mode Rendez-vous', detail: 'une soirée à deux, organisée', icone: '💞', couleur: 'var(--corail)', adulte: true },
    { chemin: '/nous/debrief', libelle: 'Le Débrief', detail: 'la semaine du foyer, en 2 minutes', icone: '📊', couleur: 'var(--sauge)' },
    { chemin: '/nous/souvenirs', libelle: 'Souvenirs', detail: 'photos par voyage, album imprimable', icone: '📷', couleur: 'var(--or)' },
    { chemin: '/nous/routines', libelle: 'Routines', detail: 'les matins et soirs, étape par étape', icone: '⏰', couleur: 'var(--sauge)' },
    { chemin: '/nous/coffre', libelle: 'Le Coffre', detail: 'papiers et échéances', icone: '🗄️', couleur: 'var(--encre-2)', adulte: true },
    { chemin: '/nous/colis', libelle: 'Colis', detail: 'suivis, invisibles pour Gabriel', icone: '📦', couleur: 'var(--ambre)', adulte: true },
    { chemin: '/nous/administration', libelle: 'Administration', detail: 'membres, rôles, journal d’audit', icone: '🛠️', couleur: 'var(--encre-2)', adulte: true },
  ]

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <h1 className="text-titre-2 text-encre">Menu</h1>
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
              </li>
            ))}
          </ul>
        </Carte>

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

        <Carte>
          <h3 className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">
            🔔 Notifications
          </h3>
          {notifications === 'active' ? (
            <p className="text-corps-2 text-fait">
              Activées sur ce téléphone — brief du matin à ~7h, colis, baisses de prix, anniversaires,
              et en direct ce que l’autre ajoute (tâches, agenda, courses, menus, idées cadeaux).
            </p>
          ) : notifications === 'refuse' ? (
            <p className="text-corps-2 text-encre-3">
              Refusées dans les réglages du téléphone. Réglages → Notifications → StiGa pour les rouvrir.
            </p>
          ) : (
            <>
              <p className="mb-2 text-corps-2 text-encre-2">
                Le brief de StiGa à ~7h, les colis, les baisses de prix, les anniversaires — et en direct
                ce que l’autre ajoute (tâches, agenda, courses…), sur l’écran verrouillé.
                {notificationsPossibles() ? '' : ' Sur iPhone : ajoute d’abord StiGa à l’écran d’accueil.'}
              </p>
              {notificationsPossibles() && (
                <Bouton
                  variante="valider"
                  onClick={() => {
                    if (membre) void activerNotifications(membre.id).then((ok) => setNotifications(ok ? 'active' : 'refuse'))
                  }}
                >
                  Activer sur ce téléphone
                </Bouton>
              )}
            </>
          )}
        </Carte>

        <Carte>
          <h3 className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">
            ☁️ Mise à jour de l’app
          </h3>
          <p className="mb-2 text-corps-2 text-encre-2">
            {etatMaj === 'installe'
              ? 'Nouvelle version trouvée — installation… l’app va se recharger toute seule.'
              : etatMaj === 'a_jour'
                ? '✓ Tu as déjà la dernière version.'
                : etatMaj === 'indispo'
                  ? 'Vérification impossible ici — réessaie depuis l’app installée sur l’écran d’accueil.'
                  : `Version du ${__DATE_VERSION__}. Les mises à jour s’installent toutes seules — ce bouton force la vérification tout de suite.`}
          </p>
          <Bouton
            variante="valider"
            desactive={etatMaj === 'verifie' || etatMaj === 'installe'}
            onClick={() => {
              setEtatMaj('verifie')
              void verifierMiseAJour().then((resultat) => {
                if (resultat === 'nouvelle') {
                  setEtatMaj('installe')
                  void mettreAJourMaintenant()
                } else if (resultat === 'a_jour') {
                  setEtatMaj('a_jour')
                  window.setTimeout(() => setEtatMaj('repos'), 4000)
                } else {
                  setEtatMaj('indispo')
                }
              })
            }}
          >
            {etatMaj === 'verifie' ? 'Vérification…' : etatMaj === 'installe' ? 'Installation…' : '🔄 Rechercher une mise à jour'}
          </Bouton>
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

        <Bouton variante="discret" pleineLargeur onClick={() => void deconnecter()}>
          Se déconnecter
        </Bouton>
      </div>
    </div>
  )
}
