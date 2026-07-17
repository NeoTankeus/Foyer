import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { utiliserSession } from '@/etat/session'
import { EcranConnexion } from '@/fonctionnalites/auth/EcranConnexion'
import { EcranAujourdhui } from '@/fonctionnalites/aujourdhui/EcranAujourdhui'
import { BoutonSas } from '@/fonctionnalites/sas/BoutonSas'

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
const EcranCelebrations = paresseux(() => import('@/fonctionnalites/celebrations/EcranCelebrations'), 'EcranCelebrations')
const EcranVoyages = paresseux(() => import('@/fonctionnalites/voyages/EcranVoyages'), 'EcranVoyages')
const EcranVoyage = paresseux(() => import('@/fonctionnalites/voyages/EcranVoyage'), 'EcranVoyage')
const EcranSouvenirs = paresseux(() => import('@/fonctionnalites/souvenirs/EcranSouvenirs'), 'EcranSouvenirs')
const EcranAlbum = paresseux(() => import('@/fonctionnalites/souvenirs/EcranAlbum'), 'EcranAlbum')
const EcranCoffre = paresseux(() => import('@/fonctionnalites/coffre/EcranCoffre'), 'EcranCoffre')
const EcranColis = paresseux(() => import('@/fonctionnalites/colis/EcranColis'), 'EcranColis')
const EcranRoutines = paresseux(() => import('@/fonctionnalites/enfant/EcranRoutines'), 'EcranRoutines')
const EcranRecompenses = paresseux(() => import('@/fonctionnalites/enfant/EcranRecompenses'), 'EcranRecompenses')

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
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="gastif-respire">
          <path d="M12 4c3.5 0 7.5 2.4 7.5 7.2S16.4 20 12 20s-7.5-4-7.5-8.8S8.5 4 12 4Z" {...traits} />
        </svg>
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
const ONGLETS = [
  { chemin: '/', libelle: 'Aujourd’hui', icone: 'aujourdhui' },
  { chemin: '/agenda', libelle: 'Agenda', icone: 'agenda' },
  { chemin: '/maison', libelle: 'Maison', icone: 'maison' },
  { chemin: '/gastif', libelle: 'Gastif', icone: 'gastif' },
  { chemin: '/nous', libelle: 'Nous', icone: 'nous' },
]

function BarreOnglets() {
  return (
    <nav
      className="verre verre-clair safe-bas fixed inset-x-0 bottom-0 z-30 border-t border-trait"
      aria-label="Navigation principale"
    >
      <div className="flex">
        {ONGLETS.map((onglet) => (
          <NavLink
            key={onglet.chemin}
            to={onglet.chemin}
            end={onglet.chemin === '/'}
            className="flex min-h-sur-tactile flex-1 flex-col items-center justify-center gap-0.5 py-1.5"
          >
            {({ isActive }) => (
              <>
                <span className={isActive ? 'text-encre' : 'text-encre-3'}>
                  <IconeOnglet nom={onglet.icone} />
                </span>
                <span
                  className={`text-legende ${isActive ? 'font-[590] text-encre' : 'text-encre-3'}`}
                >
                  {onglet.libelle}
                </span>
              </>
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

export function App() {
  const { pret, session, membre, demarrer } = utiliserSession()

  useEffect(() => {
    demarrer()
  }, [demarrer])

  if (!pret) {
    return <div className="min-h-dvh bg-fond" aria-busy="true" />
  }

  if (!session) return <EcranConnexion />
  if (!membre) return <EcranSansMembre />

  return (
    <BrowserRouter>
      <div className="min-h-dvh bg-fond pb-20">
        <Suspense fallback={<div className="min-h-dvh bg-fond" aria-busy="true" />}>
          <Routes>
            {/* L'app s'ouvre toujours sur Aujourd'hui. */}
            <Route path="/" element={<EcranAujourdhui />} />
            <Route path="/agenda" element={<EcranAgenda />} />
            <Route path="/maison" element={<EcranMaison />} />
            <Route path="/gastif" element={<EcranGastif />} />
            <Route path="/nous" element={<EcranNous />} />
            <Route path="/nous/equilibre" element={<EcranEquilibre />} />
            <Route path="/nous/celebrations" element={<EcranCelebrations />} />
            <Route path="/nous/voyages" element={<EcranVoyages />} />
            <Route path="/nous/voyages/:id" element={<EcranVoyage />} />
            <Route path="/nous/souvenirs" element={<EcranSouvenirs />} />
            <Route path="/nous/souvenirs/album/:voyageId" element={<EcranAlbum />} />
            <Route path="/nous/coffre" element={<EcranCoffre />} />
            <Route path="/nous/colis" element={<EcranColis />} />
            <Route path="/nous/routines" element={<EcranRoutines />} />
            <Route path="/nous/recompenses" element={<EcranRecompenses />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <BoutonSas />
        <BarreOnglets />
      </div>
    </BrowserRouter>
  )
}
