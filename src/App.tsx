import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { utiliserSession } from '@/etat/session'
import { EcranConnexion } from '@/fonctionnalites/auth/EcranConnexion'
import { EcranAujourdhui } from '@/fonctionnalites/aujourdhui/EcranAujourdhui'
import { BoutonSas } from '@/fonctionnalites/sas/BoutonSas'
import { BoutonPerroquet } from '@/fonctionnalites/perroquet/BoutonPerroquet'
import { GardeFou } from '@/design/composants/GardeFou'
import { PopupNouveautes } from '@/design/composants/PopupNouveautes'

// Aujourd'hui charge en premier ; le reste arrive en différé (< 1,5 s au premier écran utile).
const paresseux = <T extends Record<string, unknown>>(
  chargeur: () => Promise<T>,
  nom: keyof T,
) => lazy(() => chargeur().then((m) => ({ default: m[nom] as React.ComponentType })))

const EcranAgenda = paresseux(() => import('@/fonctionnalites/agenda/EcranAgenda'), 'EcranAgenda')
const EcranMaison = paresseux(() => import('@/fonctionnalites/maison/EcranMaison'), 'EcranMaison')
const EcranGastif = paresseux(() => import('@/fonctionnalites/gastif/EcranGastif'), 'EcranGastif')
const EcranNous = paresseux(() => import('@/fonctionnalites/nous/EcranNous'), 'EcranNous')
const EcranEquilibre = paresseux(() => import('@/fonctionnalites/nous/EcranEquilibre'), 'EcranEquilibre')
const EcranAdministration = paresseux(() => import('@/fonctionnalites/nous/EcranAdministration'), 'EcranAdministration')
const EcranRecherche = paresseux(() => import('@/fonctionnalites/recherche/EcranRecherche'), 'EcranRecherche')
const EcranConcerts = paresseux(() => import('@/fonctionnalites/concerts/EcranConcerts'), 'EcranConcerts')
const EcranCelebrations = paresseux(() => import('@/fonctionnalites/celebrations/EcranCelebrations'), 'EcranCelebrations')
const EcranVoyages = paresseux(() => import('@/fonctionnalites/voyages/EcranVoyages'), 'EcranVoyages')
const EcranVoyage = paresseux(() => import('@/fonctionnalites/voyages/EcranVoyage'), 'EcranVoyage')
const EcranSouvenirs = paresseux(() => import('@/fonctionnalites/souvenirs/EcranSouvenirs'), 'EcranSouvenirs')
const EcranAlbum = paresseux(() => import('@/fonctionnalites/souvenirs/EcranAlbum'), 'EcranAlbum')
const EcranCoffre = paresseux(() => import('@/fonctionnalites/coffre/EcranCoffre'), 'EcranCoffre')
const EcranComparateur = paresseux(() => import('@/fonctionnalites/comparateur/EcranComparateur'), 'EcranComparateur')
const EcranPersonnes = paresseux(() => import('@/fonctionnalites/personnes/EcranPersonnes'), 'EcranPersonnes')
const EcranInventaire = paresseux(() => import('@/fonctionnalites/inventaire/EcranInventaire'), 'EcranInventaire')
const EcranRendezVous = paresseux(() => import('@/fonctionnalites/rendezvous/EcranRendezVous'), 'EcranRendezVous')
const EcranDebrief = paresseux(() => import('@/fonctionnalites/debrief/EcranDebrief'), 'EcranDebrief')
const EcranRestaurants = paresseux(() => import('@/fonctionnalites/restaurants/EcranRestaurants'), 'EcranRestaurants')
const EcranColis = paresseux(() => import('@/fonctionnalites/colis/EcranColis'), 'EcranColis')
const EcranRoutines = paresseux(() => import('@/fonctionnalites/enfant/EcranRoutines'), 'EcranRoutines')
const EcranChef = paresseux(() => import('@/fonctionnalites/chef/EcranChef'), 'EcranChef')
const EcranJournal = paresseux(() => import('@/fonctionnalites/journal/EcranJournal'), 'EcranJournal')
const EcranRadar = paresseux(() => import('@/fonctionnalites/radar/EcranRadar'), 'EcranRadar')
const EcranBudget = paresseux(() => import('@/fonctionnalites/budget/EcranBudget'), 'EcranBudget')
const EcranSoiree = paresseux(() => import('@/fonctionnalites/soiree/EcranSoiree'), 'EcranSoiree')
const EcranJardin = paresseux(() => import('@/fonctionnalites/jardin/EcranJardin'), 'EcranJardin')
const EcranCapsules = paresseux(() => import('@/fonctionnalites/capsules/EcranCapsules'), 'EcranCapsules')
const EcranSante = paresseux(() => import('@/fonctionnalites/sante/EcranSante'), 'EcranSante')
const EcranRoue = paresseux(() => import('@/fonctionnalites/roue/EcranRoue'), 'EcranRoue')
const EcranCarburant = paresseux(() => import('@/fonctionnalites/carburant/EcranCarburant'), 'EcranCarburant')
const EcranPharmacies = paresseux(() => import('@/fonctionnalites/pharmacies/EcranPharmacies'), 'EcranPharmacies')
const EcranGaranties = paresseux(() => import('@/fonctionnalites/garanties/EcranGaranties'), 'EcranGaranties')
const EcranRadarPrix = paresseux(() => import('@/fonctionnalites/prix/EcranRadarPrix'), 'EcranRadarPrix')
const EcranCiel = paresseux(() => import('@/fonctionnalites/ciel/EcranCiel'), 'EcranCiel')
const EcranQuiz = paresseux(() => import('@/fonctionnalites/quiz/EcranQuiz'), 'EcranQuiz')
const EcranWeekend = paresseux(() => import('@/fonctionnalites/weekend/EcranWeekend'), 'EcranWeekend')
const EcranCourrier = paresseux(() => import('@/fonctionnalites/courrier/EcranCourrier'), 'EcranCourrier')
const EcranCorvees = paresseux(() => import('@/fonctionnalites/corvees/EcranCorvees'), 'EcranCorvees')
const EcranStock = paresseux(() => import('@/fonctionnalites/stock/EcranStock'), 'EcranStock')
const EcranEcole = paresseux(() => import('@/fonctionnalites/ecole/EcranEcole'), 'EcranEcole')
const EcranAdn = paresseux(() => import('@/fonctionnalites/adn/EcranAdn'), 'EcranAdn')
const EcranDetective = paresseux(() => import('@/fonctionnalites/detective/EcranDetective'), 'EcranDetective')
const EcranTribunal = paresseux(() => import('@/fonctionnalites/tribunal/EcranTribunal'), 'EcranTribunal')
const EcranOlympiades = paresseux(() => import('@/fonctionnalites/olympiades/EcranOlympiades'), 'EcranOlympiades')
const EcranHoroscope = paresseux(() => import('@/fonctionnalites/horoscope/EcranHoroscope'), 'EcranHoroscope')
const EcranInterviews = paresseux(() => import('@/fonctionnalites/interviews/EcranInterviews'), 'EcranInterviews')
const EcranArbre = paresseux(() => import('@/fonctionnalites/arbre/EcranArbre'), 'EcranArbre')
const EcranLivre = paresseux(() => import('@/fonctionnalites/journal/EcranLivre'), 'EcranLivre')
const EcranAnnuaire = paresseux(() => import('@/fonctionnalites/annuaire/EcranAnnuaire'), 'EcranAnnuaire')
const EcranCrues = paresseux(() => import('@/fonctionnalites/crues/EcranCrues'), 'EcranCrues')
const EcranTrains = paresseux(() => import('@/fonctionnalites/trains/EcranTrains'), 'EcranTrains')

function IconeOnglet({ nom }: { nom: string }) {
  const traits = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const }
  switch (nom) {
    case 'aujourdhui':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 3c2 3-2 5 0 8s-2 5 0 8" {...traits} />
          <path d="M16 3c-2 3 2 5 0 8s2 5 0 8" {...traits} />
        </svg>
      )
    case 'agenda':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="5" width="16" height="15" rx="3" {...traits} />
          <path d="M4 10h16M9 3v4M15 3v4" {...traits} />
        </svg>
      )
    case 'maison':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 11l8-7 8 7" {...traits} strokeLinejoin="round" />
          <path d="M6 10v9h12v-9" {...traits} strokeLinejoin="round" />
        </svg>
      )
    case 'gastif':
      // Le logo de Gastif : les lettres ILY
      return (
        <span className="badge-ily h-6 w-9 text-[11px]" aria-hidden="true">
          ILY
        </span>
      )
    default:
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="9" cy="9" r="3.2" {...traits} />
          <circle cx="16" cy="10.5" r="2.4" {...traits} />
          <path d="M4 19c.6-3 2.6-4.5 5-4.5s4.4 1.5 5 4.5M14.5 15.2c2 .2 3.6 1.4 4.2 3.8" {...traits} />
        </svg>
      )
  }
}

// Tab bar adulte (5) : Aujourd'hui · Agenda · Maison · Gastif · Nous
// Chaque onglet a sa couleur — l'actif s'allume dans sa teinte.
const ONGLETS = [
  { chemin: '/', libelle: 'Aujourd’hui', icone: 'aujourdhui', couleur: 'var(--ambre)' },
  { chemin: '/agenda', libelle: 'Agenda', icone: 'agenda', couleur: 'var(--ardoise)' },
  { chemin: '/maison', libelle: 'Maison', icone: 'maison', couleur: 'var(--sauge)' },
  { chemin: '/gastif', libelle: 'STG', icone: 'gastif', couleur: 'var(--or)' },
  { chemin: '/nous', libelle: 'Menu', icone: 'nous', couleur: 'var(--prune)' },
]

function BarreOnglets() {
  return (
    <nav
      className="verre verre-clair safe-bas fixed inset-x-0 bottom-0 z-30 border-t border-trait"
      aria-label="Navigation principale"
    >
      <div className="flex px-1">
        {ONGLETS.map((onglet) => (
          <NavLink
            key={onglet.chemin}
            to={onglet.chemin}
            end={onglet.chemin === '/'}
            className="flex min-h-sur-tactile flex-1 flex-col items-center justify-center py-1.5"
          >
            {({ isActive }) => (
              <span
                className="flex flex-col items-center gap-0.5 rounded-2xl px-3 py-1"
                style={
                  isActive
                    ? {
                        color: onglet.couleur,
                        background: `color-mix(in srgb, ${onglet.couleur} 14%, transparent)`,
                      }
                    : { color: 'var(--encre-3)' }
                }
              >
                <IconeOnglet nom={onglet.icone} />
                <span className={`text-legende ${isActive ? 'font-[700]' : ''}`}>
                  {onglet.libelle}
                </span>
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

function EcranSansMembre() {
  const { deconnecter, session } = utiliserSession()
  return (
    <div className="safe-haut flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
      <h1 className="text-titre-3 text-encre">Compte non relié</h1>
      <p className="text-corps-2 text-encre-3">
        {session?.user.email} n’est relié à aucun membre du foyer. Vérifie que cet email
        figure dans les membres (colonne email_invitation), puis reconnecte-toi.
      </p>
      <button className="min-h-sur-tactile text-corps-2 text-ardoise underline" onClick={() => void deconnecter()}>
        Se déconnecter
      </button>
    </div>
  )
}

/** Le splash « Coucou STG ! » s'efface quand l'app est VRAIMENT prête. */
function retirerSplash() {
  const splash = document.getElementById('coucou-gastif')
  if (!splash) return
  splash.classList.add('cg-sortie')
  window.setTimeout(() => splash.remove(), 600)
}

export function App() {
  const { pret, session, sessionProbable, membre, demarrer } = utiliserSession()

  useEffect(() => {
    demarrer()
  }, [demarrer])

  // Dès qu'on a quelque chose de réel à montrer, le splash laisse la place.
  useEffect(() => {
    if (pret) retirerSplash()
  }, [pret])

  if (!pret) {
    return <div className="min-h-dvh bg-fond" aria-busy="true" />
  }

  // sessionProbable : un jeton existe sur l'appareil — on affiche l'app tout de
  // suite avec le profil en cache, la session réelle arrive juste derrière.
  if (!session && !sessionProbable) return <EcranConnexion />
  if (!membre) return <EcranSansMembre />

  return <Interieur />
}

function Interieur() {
  return (
    <GardeFou>
    <BrowserRouter>
      <div
        className="min-h-dvh bg-fond"
        style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}
      >
        <Suspense fallback={<div className="min-h-dvh bg-fond" aria-busy="true" />}>
          <Routes>
            {/* L'app s'ouvre toujours sur Aujourd'hui. */}
            <Route path="/" element={<EcranAujourdhui />} />
            <Route path="/agenda" element={<EcranAgenda />} />
            <Route path="/maison" element={<EcranMaison />} />
            <Route path="/gastif" element={<EcranGastif />} />
            <Route path="/nous" element={<EcranNous />} />
            <Route path="/nous/equilibre" element={<EcranEquilibre />} />
            <Route path="/nous/administration" element={<EcranAdministration />} />
            <Route path="/recherche" element={<EcranRecherche />} />
            <Route path="/nous/concerts" element={<EcranConcerts />} />
            <Route path="/nous/celebrations" element={<EcranCelebrations />} />
            <Route path="/nous/voyages" element={<EcranVoyages />} />
            <Route path="/nous/voyages/:id" element={<EcranVoyage />} />
            <Route path="/nous/souvenirs" element={<EcranSouvenirs />} />
            <Route path="/nous/souvenirs/album/:voyageId" element={<EcranAlbum />} />
            <Route path="/nous/coffre" element={<EcranCoffre />} />
            <Route path="/nous/comparateur" element={<EcranComparateur />} />
            <Route path="/nous/personnes" element={<EcranPersonnes />} />
            <Route path="/nous/inventaire" element={<EcranInventaire />} />
            <Route path="/nous/rendez-vous" element={<EcranRendezVous />} />
            <Route path="/nous/debrief" element={<EcranDebrief />} />
            <Route path="/nous/restaurants" element={<EcranRestaurants />} />
            <Route path="/nous/colis" element={<EcranColis />} />
            <Route path="/nous/routines" element={<EcranRoutines />} />
            <Route path="/nous/chef" element={<EcranChef />} />
            <Route path="/nous/journal" element={<EcranJournal />} />
            <Route path="/nous/radar" element={<EcranRadar />} />
            <Route path="/nous/budget" element={<EcranBudget />} />
            <Route path="/nous/soiree" element={<EcranSoiree />} />
            <Route path="/nous/jardin" element={<EcranJardin />} />
            <Route path="/nous/capsules" element={<EcranCapsules />} />
            <Route path="/nous/sante" element={<EcranSante />} />
            <Route path="/nous/roue" element={<EcranRoue />} />
            <Route path="/nous/carburant" element={<EcranCarburant />} />
            <Route path="/nous/pharmacies" element={<EcranPharmacies />} />
            <Route path="/nous/garanties" element={<EcranGaranties />} />
            <Route path="/nous/radar-prix" element={<EcranRadarPrix />} />
            <Route path="/nous/ciel" element={<EcranCiel />} />
            <Route path="/nous/quiz" element={<EcranQuiz />} />
            <Route path="/nous/weekend" element={<EcranWeekend />} />
            <Route path="/nous/courrier" element={<EcranCourrier />} />
            <Route path="/nous/corvees" element={<EcranCorvees />} />
            <Route path="/nous/stock" element={<EcranStock />} />
            <Route path="/nous/ecole" element={<EcranEcole />} />
            <Route path="/nous/adn" element={<EcranAdn />} />
            <Route path="/nous/detective" element={<EcranDetective />} />
            <Route path="/nous/tribunal" element={<EcranTribunal />} />
            <Route path="/nous/olympiades" element={<EcranOlympiades />} />
            <Route path="/nous/horoscope" element={<EcranHoroscope />} />
            <Route path="/nous/interviews" element={<EcranInterviews />} />
            <Route path="/nous/arbre" element={<EcranArbre />} />
            <Route path="/nous/livre" element={<EcranLivre />} />
            <Route path="/nous/annuaire" element={<EcranAnnuaire />} />
            <Route path="/nous/crues" element={<EcranCrues />} />
            <Route path="/nous/trains" element={<EcranTrains />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <BoutonSas />
        <BoutonPerroquet />
        <BarreOnglets />
        <PopupNouveautes />
      </div>
    </BrowserRouter>
    </GardeFou>
  )
}
