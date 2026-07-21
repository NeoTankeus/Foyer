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

// Une ligne de module : la fiche à gauche (ouvre l'écran), l'étoile à droite
// (ajoute/retire des Favoris) — deux boutons distincts, pas de faux appuis.
function LigneModule({
  module,
  favori,
  surOuverture,
  surEtoile,
}: {
  module: { chemin: string; libelle: string; detail: string; icone: string; couleur: string }
  favori: boolean
  surOuverture: () => void
  surEtoile: () => void
}) {
  return (
    <div className="flex items-center border-b border-trait last:border-0">
      <button
        onClick={() => {
          navigator.vibrate?.(4)
          surOuverture()
        }}
        className="flex min-h-sur-tactile min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left active:bg-fond-sourd"
      >
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[22px]"
          style={{ background: `color-mix(in srgb, ${module.couleur} 14%, transparent)` }}
        >
          {module.icone}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-corps font-[590] text-encre">{module.libelle}</span>
          <span className="block text-legende text-encre-3">{module.detail}</span>
        </span>
      </button>
      <button
        onClick={surEtoile}
        aria-label={favori ? `Retirer ${module.libelle} des favoris` : `Ajouter ${module.libelle} aux favoris`}
        aria-pressed={favori}
        className="flex h-12 w-12 shrink-0 items-center justify-center text-[20px]"
      >
        {favori ? '⭐' : <span className="opacity-35">☆</span>}
      </button>
    </div>
  )
}

// Les SECTEURS thématiques du menu — affichés par ordre alphabétique.
const SECTEURS: Record<string, { libelle: string; icone: string }> = {
  argent: { libelle: 'Argent & achats', icone: '💰' },
  cuisine: { libelle: 'Cuisine & provisions', icone: '🍳' },
  famille: { libelle: 'Famille & souvenirs', icone: '📔' },
  jeux: { libelle: 'Jeux & traditions', icone: '🎲' },
  maison: { libelle: 'Maison & organisation', icone: '🗂' },
  sante: { libelle: 'Santé & habitudes', icone: '🩺' },
  sorties: { libelle: 'Sorties & voyages', icone: '✈️' },
  transports: { libelle: 'Transports & infos utiles', icone: '🧭' },
}

// ⭐ Les favoris (par téléphone) : les chemins des modules étoilés.
const CLE_FAVORIS = 'stg-favoris'
const lireFavoris = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(CLE_FAVORIS) ?? '[]') as string[]
  } catch {
    return []
  }
}

// Les secteurs laissés ouverts, mémorisés pour l'ouverture suivante.
const CLE_OUVERTS = 'stg-menu-secteurs'
const lireOuverts = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(CLE_OUVERTS) ?? '[]') as string[]
  } catch {
    return []
  }
}

export function EcranNous() {
  const { membre, membres, foyer, deconnecter } = utiliserSession()
  const naviguer = useNavigate()
  const [enAttente, setEnAttente] = useState(0)
  const [notifications, setNotifications] = useState<'active' | 'refuse' | 'inactif'>('inactif')
  const [etatMaj, setEtatMaj] = useState<'repos' | 'verifie' | 'installe' | 'a_jour' | 'indispo'>('repos')
  const [favoris, setFavoris] = useState<string[]>(lireFavoris)
  const [ouverts, setOuverts] = useState<string[]>(lireOuverts)

  useEffect(() => {
    void baseLocale.file_attente.count().then(setEnAttente)
    void etatAbonnement().then(setNotifications)
  }, [])

  const estAdulte = membre?.role === 'adult'

  const MODULES: { chemin: string; libelle: string; detail: string; icone: string; couleur: string; secteur: string; adulte?: boolean }[] = [
    { chemin: '/nous/courrier', libelle: 'La Boîte aux lettres', detail: 'colle un email — STG range tout', icone: '📬', couleur: 'var(--ardoise)', secteur: 'maison' },
    { chemin: '/nous/stock', libelle: 'Le Stock fantôme', detail: 'STG rachète avant la panne', icone: '📦', couleur: 'var(--sauge)', secteur: 'cuisine' },
    { chemin: '/nous/corvees', libelle: 'Corvées équitables', detail: 'la balance des minutes répartit', icone: '🔄', couleur: 'var(--prune)', secteur: 'maison', adulte: true },
    { chemin: '/nous/ecole', libelle: 'L’École', detail: 'sorties, réunions, fournitures de Gabriel', icone: '🚸', couleur: 'var(--ambre)', secteur: 'maison' },
    { chemin: '/nous/chef', libelle: 'Le Chef', detail: 'le menu du soir avec ce qu’on a déjà', icone: '🧑‍🍳', couleur: 'var(--sauge)', secteur: 'cuisine' },
    { chemin: '/nous/weekend', libelle: 'Week-end surprise', detail: 'un budget, un rayon — STG compose tout', icone: '🧭', couleur: 'var(--ambre)', secteur: 'sorties' },
    { chemin: '/nous/quiz', libelle: 'Quiz du dîner', detail: '3 questions à table, dont une sur VOTRE vie', icone: '🏆', couleur: 'var(--or)', secteur: 'jeux' },
    { chemin: '/nous/ciel', libelle: 'Ce soir on lève les yeux', detail: 'lune, ISS en direct, étoiles filantes', icone: '🌌', couleur: 'var(--prune)', secteur: 'sorties' },
    { chemin: '/nous/carburant', libelle: 'Plein malin', detail: 'la station la moins chère autour de toi', icone: '⛽', couleur: 'var(--ardoise)', secteur: 'transports' },
    { chemin: '/nous/pharmacies', libelle: 'Pharmacies', detail: 'les plus proches + le réflexe 32 37', icone: '💊', couleur: 'var(--sauge)', secteur: 'sante' },
    { chemin: '/nous/radar-prix', libelle: 'Radar prix', detail: 'tes produits scannés, aux prix des magasins', icone: '📉', couleur: 'var(--or)', secteur: 'argent' },
    { chemin: '/nous/garanties', libelle: 'Garanties', detail: 'STG prévient avant que ça expire', icone: '🔌', couleur: 'var(--encre-2)', secteur: 'argent', adulte: true },
    { chemin: '/nous/soiree', libelle: 'Soirée parfaite', detail: 'film + plat + resto, décidé en 10 s', icone: '🎬', couleur: 'var(--prune)', secteur: 'sorties' },
    { chemin: '/nous/roue', libelle: 'La Roue', detail: 'elle décide, plus de débat', icone: '🎲', couleur: 'var(--corail)', secteur: 'jeux' },
    { chemin: '/nous/radar', libelle: 'Radar de départ', detail: 'l’heure à laquelle il faut VRAIMENT partir', icone: '🚗', couleur: 'var(--ardoise)', secteur: 'transports' },
    { chemin: '/nous/journal', libelle: 'Le Journal', detail: 'votre vie s’écrit toute seule', icone: '📔', couleur: 'var(--or)', secteur: 'famille' },
    { chemin: '/nous/jardin', libelle: 'Le Jardin', detail: 'vos habitudes poussent chaque jour', icone: '🌱', couleur: 'var(--sauge)', secteur: 'sante', adulte: true },
    { chemin: '/nous/capsules', libelle: 'Capsules temporelles', detail: 'des mots d’aujourd’hui pour plus tard', icone: '💌', couleur: 'var(--corail)', secteur: 'famille', adulte: true },
    { chemin: '/nous/budget', libelle: 'Le Trésorier', detail: 'scanne le ticket, STG classe tout', icone: '💰', couleur: 'var(--or)', secteur: 'argent', adulte: true },
    { chemin: '/nous/sante', libelle: 'Carnet santé', detail: 'vaccins, ordonnances, rappels', icone: '🩺', couleur: 'var(--ardoise)', secteur: 'sante', adulte: true },
    { chemin: '/nous/adn', libelle: 'L’ADN du foyer', detail: 'votre portrait et ses prédictions', icone: '🧬', couleur: 'var(--prune)', secteur: 'famille' },
    { chemin: '/nous/detective', libelle: 'Détective des prix', detail: 'photographie l’étiquette, il juge', icone: '🕵️', couleur: 'var(--or)', secteur: 'argent' },
    { chemin: '/nous/tribunal', libelle: 'Le Tribunal', detail: 'verdicts solennels, mauvaise foi assumée', icone: '⚖️', couleur: 'var(--encre-2)', secteur: 'jeux', adulte: true },
    { chemin: '/nous/olympiades', libelle: 'Les Olympiades', detail: 'épreuves maison, gloire éternelle', icone: '🏅', couleur: 'var(--corail)', secteur: 'jeux' },
    { chemin: '/nous/horoscope', libelle: 'L’Horoscope du foyer', detail: 'les astres ont lu vos placards', icone: '🔮', couleur: 'var(--prune)', secteur: 'jeux' },
    { chemin: '/nous/interviews', libelle: 'Les Interviews', detail: 'les mêmes questions, année après année', icone: '🎤', couleur: 'var(--or)', secteur: 'famille' },
    { chemin: '/nous/arbre', libelle: 'L’Arbre de la famille', detail: 'toutes les branches, tous les goûts', icone: '🌳', couleur: 'var(--sauge)', secteur: 'famille' },
    { chemin: '/nous/livre', libelle: 'Le Livre de l’année', detail: 'votre année, prête à imprimer', icone: '📖', couleur: 'var(--ambre)', secteur: 'famille' },
    { chemin: '/nous/trains', libelle: 'Les trains', detail: 'départs en temps réel, retards compris', icone: '🚆', couleur: 'var(--ardoise)', secteur: 'transports' },
    { chemin: '/nous/crues', libelle: 'Les cours d’eau', detail: 'hauteurs Vigicrues autour de la maison', icone: '🌊', couleur: 'var(--ardoise)', secteur: 'transports' },
    { chemin: '/nous/annuaire', libelle: 'Annuaire officiel', detail: 'toute entreprise de France (Sirene)', icone: '🏢', couleur: 'var(--encre-2)', secteur: 'transports' },
    { chemin: '/nous/equilibre', libelle: 'Équilibre', detail: 'la répartition réelle, en minutes', icone: '⚖️', couleur: 'var(--ardoise)', secteur: 'maison', adulte: true },
    { chemin: '/nous/celebrations', libelle: 'Célébrations', detail: 'anniversaires et coffre à idées', icone: '🎂', couleur: 'var(--corail)', secteur: 'famille' },
    { chemin: '/nous/voyages', libelle: 'Voyages', detail: 'valises, réservations, météo', icone: '✈️', couleur: 'var(--ardoise)', secteur: 'sorties' },
    { chemin: '/nous/concerts', libelle: 'Concerts & sorties', detail: 'billets scannés, prêts pour l’entrée', icone: '🎤', couleur: 'var(--corail)', secteur: 'sorties' },
    { chemin: '/nous/comparateur', libelle: 'Comparateur de prix', detail: 'scanne en boutique, compare sur internet', icone: '🏷️', couleur: 'var(--or)', secteur: 'argent' },
    { chemin: '/nous/inventaire', libelle: 'Placards & congélo', detail: 'stocks, DLC, anti-gaspi', icone: '🧊', couleur: 'var(--ardoise)', secteur: 'cuisine' },
    { chemin: '/nous/restaurants', libelle: 'Restaurants', detail: 'nos adresses, nos notes, la carte du monde', icone: '🍴', couleur: 'var(--ambre)', secteur: 'sorties' },
    { chemin: '/nous/personnes', libelle: 'Les proches', detail: 'goûts, tailles, cadeaux déjà offerts', icone: '👥', couleur: 'var(--prune)', secteur: 'famille', adulte: true },
    { chemin: '/nous/rendez-vous', libelle: 'Mode Rendez-vous', detail: 'une soirée à deux, organisée', icone: '💞', couleur: 'var(--corail)', secteur: 'sorties', adulte: true },
    { chemin: '/nous/debrief', libelle: 'Le Débrief', detail: 'la semaine du foyer, en 2 minutes', icone: '📊', couleur: 'var(--sauge)', secteur: 'jeux' },
    { chemin: '/nous/souvenirs', libelle: 'Souvenirs', detail: 'photos par voyage, album imprimable', icone: '📷', couleur: 'var(--or)', secteur: 'famille' },
    { chemin: '/nous/coffre', libelle: 'Le Coffre', detail: 'papiers et échéances', icone: '🗄️', couleur: 'var(--encre-2)', secteur: 'maison', adulte: true },
    { chemin: '/nous/colis', libelle: 'Colis', detail: 'suivis, invisibles pour Gabriel', icone: '📦', couleur: 'var(--ambre)', secteur: 'maison', adulte: true },
    { chemin: '/nous/administration', libelle: 'Administration', detail: 'membres, rôles, journal d’audit', icone: '🛠️', couleur: 'var(--encre-2)', secteur: 'maison', adulte: true },
  ]

  // Classement ALPHABÉTIQUE (les articles Le/La/Les/L' ne comptent pas).
  const cleTri = (libelle: string) => libelle.replace(/^(les?|la|l['’])\s*/i, '').trim()
  const trier = (liste: typeof MODULES) =>
    [...liste].sort((a, b) => cleTri(a.libelle).localeCompare(cleTri(b.libelle), 'fr', { sensitivity: 'base' }))

  const visibles = MODULES.filter((m) => !m.adulte || estAdulte)
  const enFavori = (chemin: string) => favoris.includes(chemin)
  const basculerFavori = (chemin: string) => {
    navigator.vibrate?.(4)
    setFavoris((f) => {
      const suivant = f.includes(chemin) ? f.filter((c) => c !== chemin) : [...f, chemin]
      try {
        localStorage.setItem(CLE_FAVORIS, JSON.stringify(suivant))
      } catch {
        // stockage plein — le favori restera pour la session
      }
      return suivant
    })
  }
  const basculerSecteur = (cle: string) => {
    navigator.vibrate?.(4)
    setOuverts((o) => {
      const suivant = o.includes(cle) ? o.filter((c) => c !== cle) : [...o, cle]
      try {
        localStorage.setItem(CLE_OUVERTS, JSON.stringify(suivant))
      } catch {
        // tant pis pour la mémoire des volets
      }
      return suivant
    })
  }

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

        {/* ⭐ Les FAVORIS d'abord : les modules étoilés, toujours sous la main. */}
        {favoris.length > 0 && (
          <nav aria-label="Modules favoris" className="overflow-hidden rounded-lg bg-fond-eleve shadow-carte">
            <p className="border-b border-trait px-4 py-2.5 text-note font-[590] uppercase tracking-wide text-encre-3">
              ⭐ Favoris
            </p>
            {trier(visibles.filter((m) => enFavori(m.chemin))).map((module) => (
              <LigneModule
                key={`fav-${module.chemin}`}
                module={module}
                favori
                surOuverture={() => naviguer(module.chemin)}
                surEtoile={() => basculerFavori(module.chemin)}
              />
            ))}
          </nav>
        )}

        {/* Les SECTEURS thématiques (alphabétiques) : un appui déplie le secteur. */}
        <nav aria-label="Modules du foyer par secteur" className="flex flex-col gap-2">
          {Object.entries(SECTEURS)
            .filter(([cle]) => visibles.some((m) => m.secteur === cle))
            .sort(([, a], [, b]) => a.libelle.localeCompare(b.libelle, 'fr', { sensitivity: 'base' }))
            .map(([cle, secteur]) => {
              const modules = trier(visibles.filter((m) => m.secteur === cle))
              const deplie = ouverts.includes(cle)
              return (
                <div key={cle} className="overflow-hidden rounded-lg bg-fond-eleve shadow-carte">
                  <button
                    onClick={() => basculerSecteur(cle)}
                    aria-expanded={deplie}
                    className="flex min-h-sur-tactile w-full items-center gap-3 px-4 py-3 text-left active:bg-fond-sourd"
                  >
                    <span aria-hidden="true" className="text-[22px]">{secteur.icone}</span>
                    <span className="flex-1 text-corps font-[590] text-encre">{secteur.libelle}</span>
                    <span className="text-legende text-encre-3">{modules.length}</span>
                    <span aria-hidden="true" className={`text-encre-3 transition-transform ${deplie ? 'rotate-90' : ''}`}>›</span>
                  </button>
                  {deplie && (
                    <div className="border-t border-trait">
                      {modules.map((module) => (
                        <LigneModule
                          key={module.chemin}
                          module={module}
                          favori={enFavori(module.chemin)}
                          surOuverture={() => naviguer(module.chemin)}
                          surEtoile={() => basculerFavori(module.chemin)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
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
              Refusées dans les réglages du téléphone. Réglages → Notifications → STG pour les rouvrir.
            </p>
          ) : (
            <>
              <p className="mb-2 text-corps-2 text-encre-2">
                Le brief de STG à ~7h, les colis, les baisses de prix, les anniversaires — et en direct
                ce que l’autre ajoute (tâches, agenda, courses…), sur l’écran verrouillé.
                {notificationsPossibles() ? '' : ' Sur iPhone : ajoute d’abord STG à l’écran d’accueil.'}
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
