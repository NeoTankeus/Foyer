import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { demarrerSyncAuRetourDuReseau } from './lib/sync'
import { majAutomatique, retenirEnregistrementSw } from './lib/maj'
import './design/tokens.css'

// Mise à jour AUTOMATIQUE : à l'ouverture, à chaque retour au premier plan et
// toutes les 15 min, la version du serveur est comparée — si elle est plus
// récente, l'installation démarre TOUTE SEULE (le nuage passe en ⬇️) et l'app
// se recharge dès qu'elle est prête. Zéro clic, zéro réinstallation.
registerSW({
  immediate: true,
  onRegisteredSW(_url, enregistrement) {
    if (!enregistrement) return
    retenirEnregistrementSw(enregistrement)
    const verifier = () => void majAutomatique()
    // OUVERTURE INSTANTANÉE : la première vérification attend 2,5 s, le temps
    // que l'app s'affiche et soit utilisable — la mise à jour s'installe
    // ensuite en arrière-plan (anneau visible) sans ralentir le démarrage.
    window.setTimeout(verifier, 2500)
    setInterval(verifier, 5 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') verifier()
    })
  },
})

const clientRequetes = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 3600 * 1000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

// FLUIDITÉ : le dernier état connu est mémorisé sur le téléphone — à
// l'ouverture, l'app s'affiche IMMÉDIATEMENT avec ses données, puis se
// rafraîchit en arrière-plan. Le cache saute à chaque nouvelle version.
const persistant = createSyncStoragePersister({ storage: window.localStorage, key: 'gastif-cache' })

// OUVERTURE RAPIDE : les requêtes qui charrient des photos en base64 (des
// mégaoctets !) ne vont PAS dans ce cache — relire/réécrire un bloc géant à
// chaque ouverture ralentissait toute l'app. Le hors-ligne de ces modules
// reste assuré par la base locale (Dexie), rien n'est perdu.
const CLEFS_LOURDES = new Set([
  'souvenirs', 'journal', 'journal-annee', 'livre', 'ilyaunan',
  'sante', 'capsules', 'mur', 'restaurants', 'tribunal', 'interviews',
])

demarrerSyncAuRetourDuReseau()

// Après un déploiement, un ancien onglet peut charger un morceau d'app périmé :
// au lieu d'une page blanche, on recharge proprement la nouvelle version.
window.addEventListener('vite:preloadError', (evenement) => {
  evenement.preventDefault()
  window.location.reload()
})

const racine = document.getElementById('racine')
if (!racine) throw new Error('Élément racine introuvable')

createRoot(racine).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={clientRequetes}
      persistOptions={{
        persister: persistant,
        maxAge: 24 * 3600 * 1000,
        buster: __DATE_VERSION__,
        dehydrateOptions: {
          shouldDehydrateQuery: (requete) =>
            requete.state.status === 'success' && !CLEFS_LOURDES.has(String(requete.queryKey[0])),
        },
      }}
    >
      <App />
    </PersistQueryClientProvider>
  </StrictMode>,
)

// Filet de sécurité : le splash « Coucou STG ! » est normalement retiré par
// l'app dès qu'elle est prête (App.tsx) — s'il traîne encore après 5 s,
// quelque chose cloche et on le retire quand même.
window.setTimeout(() => {
  const splash = document.getElementById('coucou-gastif')
  if (!splash) return
  splash.classList.add('cg-sortie')
  window.setTimeout(() => splash.remove(), 600)
}, 5000)
