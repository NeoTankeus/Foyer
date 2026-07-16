import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { utiliserSession } from '@/etat/session'
import { EcranConnexion } from '@/fonctionnalites/auth/EcranConnexion'
import { EcranAujourdhui } from '@/fonctionnalites/aujourdhui/EcranAujourdhui'

// Aujourd'hui charge en premier ; le reste arrive en différé (< 1,5 s au premier écran utile).
const EcranAgenda = lazy(() =>
  import('@/fonctionnalites/agenda/EcranAgenda').then((m) => ({ default: m.EcranAgenda })),
)
const EcranMaison = lazy(() =>
  import('@/fonctionnalites/maison/EcranMaison').then((m) => ({ default: m.EcranMaison })),
)
const EcranGastif = lazy(() =>
  import('@/fonctionnalites/gastif/EcranGastif').then((m) => ({ default: m.EcranGastif })),
)
const EcranNous = lazy(() =>
  import('@/fonctionnalites/nous/EcranNous').then((m) => ({ default: m.EcranNous })),
)

// Tab bar adulte (5) : Aujourd'hui · Agenda · Maison · Gastif · Nous
// Tab bar enfant (3) : Ma journée · Mes missions · Gastif — interface en phase 2 ;
// la RLS enfant, elle, est déjà en place côté base.
const ONGLETS = [
  { chemin: '/', libelle: 'Aujourd’hui', icone: '◉' },
  { chemin: '/agenda', libelle: 'Agenda', icone: '▤' },
  { chemin: '/maison', libelle: 'Maison', icone: '⌂' },
  { chemin: '/gastif', libelle: 'Gastif', icone: '❋' },
  { chemin: '/nous', libelle: 'Nous', icone: '◎' },
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
                <span aria-hidden="true" className={isActive ? 'text-encre' : 'text-encre-3'}>
                  {onglet.icone}
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <BarreOnglets />
      </div>
    </BrowserRouter>
  )
}
