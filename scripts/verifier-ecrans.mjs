// 🧪 Le banc d'essai de STG : ouvre TOUS les écrans de l'application dans un
// vrai navigateur, appuie sur les boutons principaux de chacun, et signale le
// moindre plantage, écran blanc ou erreur de console.
//
// L'app est servie depuis une VRAIE construction, avec Supabase et toutes les
// API extérieures remplacées par des réponses factices : on teste le code de
// l'app, jamais le réseau. Aucune donnée réelle n'est touchée.
//
//   node scripts/verifier-ecrans.mjs            → tous les écrans
//   node scripts/verifier-ecrans.mjs /nous/garde → un seul écran
//
// Sortie : 0 si tout va bien, 1 si au moins un écran est en défaut.

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { chromium } from 'playwright-core'

const RACINE = new URL('..', import.meta.url).pathname
const DOSSIER = join(RACINE, 'dist-essai')
const SUPABASE = 'https://essai.supabase.co'
const NAVIGATEUR = ['/opt/pw-browsers/chromium/chrome-linux/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(
  (chemin) => existsSync(chemin),
)

// ————————————————————————— Les écrans à vérifier —————————————————————————

const ECRANS = [
  ['/', 'Aujourd’hui'],
  ['/agenda', 'Agenda'],
  ['/maison', 'Maison'],
  ['/gastif', 'STG (l’assistante)'],
  ['/nous', 'Le menu'],
  ['/recherche', 'Recherche'],
  ['/nous/equilibre', 'Équilibre'],
  ['/nous/administration', 'Administration'],
  ['/nous/concerts', 'Concerts'],
  ['/nous/celebrations', 'Célébrations'],
  ['/nous/voyages', 'Voyages'],
  ['/nous/voyages/essai-1', 'Fiche voyage'],
  ['/nous/voyages/essai-1/itineraire?points=43.12,5.93;43.48,-1.55&noms=Maison;Biarritz', 'Itinéraire + carte'],
  ['/nous/souvenirs', 'Souvenirs'],
  ['/nous/souvenirs/album/essai-1', 'Album souvenirs'],
  ['/nous/coffre', 'Coffre'],
  ['/nous/comparateur', 'Comparateur'],
  ['/nous/personnes', 'Personnes'],
  ['/nous/inventaire', 'Inventaire'],
  ['/nous/rendez-vous', 'Rendez-vous'],
  ['/nous/debrief', 'Débrief'],
  ['/nous/restaurants', 'Restaurants'],
  ['/nous/colis', 'Colis'],
  ['/nous/chef', 'Chef'],
  ['/nous/journal', 'Journal'],
  ['/nous/radar', 'Radar de départ'],
  ['/nous/budget', 'Budget'],
  ['/nous/soiree', 'Soirée'],
  ['/nous/jardin', 'Jardin des habitudes'],
  ['/nous/capsules', 'Capsules'],
  ['/nous/sante', 'Santé'],
  ['/nous/roue', 'Roue des décisions'],
  ['/nous/carburant', 'Carburant'],
  ['/nous/pharmacies', 'Pharmacies'],
  ['/nous/garanties', 'Garanties'],
  ['/nous/radar-prix', 'Radar prix'],
  ['/nous/ciel', 'Le Ciel'],
  ['/nous/quiz', 'Quiz'],
  ['/nous/weekend', 'Week-end surprise'],
  ['/nous/courrier', 'Boîte aux lettres'],
  ['/nous/corvees', 'Corvées'],
  ['/nous/stock', 'Stock fantôme'],
  ['/nous/ecole', 'École'],
  ['/nous/adn', 'ADN'],
  ['/nous/detective', 'Détective'],
  ['/nous/tribunal', 'Tribunal'],
  ['/nous/olympiades', 'Olympiades'],
  ['/nous/horoscope', 'Horoscope'],
  ['/nous/interviews', 'Interviews'],
  ['/nous/arbre', 'Arbre'],
  ['/nous/livre', 'Livre'],
  ['/nous/annuaire', 'Annuaire'],
  ['/nous/crues', 'Cours d’eau'],
  ['/nous/trains', 'Trains'],
  ['/nous/garde', 'Garde de Gabriel'],
  ['/nous/assiette', 'Mon Assiette'],
  ['/nous/plages', 'Plages'],
  ['/nous/immobilier', 'Immobilier'],
]

// ————————————————————————— Le petit serveur local —————————————————————————

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
}

function servir(port) {
  const serveur = createServer(async (requete, reponse) => {
    const chemin = decodeURIComponent((requete.url ?? '/').split('?')[0])
    const candidats = [join(DOSSIER, chemin), join(DOSSIER, 'index.html')]
    for (const candidat of candidats) {
      try {
        const contenu = await readFile(candidat)
        reponse.writeHead(200, { 'content-type': TYPES[extname(candidat)] ?? 'application/octet-stream' })
        reponse.end(contenu)
        return
      } catch {
        // fichier suivant
      }
    }
    reponse.writeHead(404).end('introuvable')
  })
  return new Promise((resoudre) => serveur.listen(port, () => resoudre(serveur)))
}

// ——————————————————— Les réponses factices (Supabase + API) ———————————————————

const MEMBRE = {
  id: 'membre-essai',
  foyer_id: 'foyer-essai',
  auth_user_id: 'user-essai',
  email_invitation: null,
  prenom: 'Stéphane',
  naissance: '1985-05-05',
  role: 'parent',
  couleur: 'sauge',
  avatar_url: null,
  points: 0,
  modules_autorises: [],
  actif_jusqu_au: null,
  cree_le: '2024-01-01T00:00:00Z',
}

const FOYER = {
  id: 'foyer-essai',
  nom: 'Foyer d’essai',
  fuseau: 'Europe/Paris',
  reglages: { maison: { lat: 43.124, lon: 5.928, nom: 'La maison' } },
  cree_le: '2024-01-01T00:00:00Z',
}

/** La table visée par une adresse Supabase REST. */
const tableDe = (url) => (url.match(/\/rest\/v1\/([a-z_]+)/) ?? [])[1] ?? ''

// 😈 Le mode HOSTILE : au lieu de tables vides, l'app reçoit des lignes
// incomplètes (champs manquants, textes nuls, dates absurdes) et des relais
// qui répondent en panne. C'est exactement ce qui provoquait les plantages
// signalés en production — aucun écran ne doit y résister par chance.
const HOSTILE = process.argv.includes('--hostile')

const LIGNE_BANCALE = {
  id: 'bancale-1',
  foyer_id: 'foyer-essai',
  cree_le: null,
  titre: null,
  nom: null,
  prenom: null,
  description: null,
  date: null,
  debut: null,
  fin: null,
  statut: null,
  montant: null,
  lat: null,
  lng: null,
  lon: null,
  contenu: null,
  donnees: null,
  photos: null,
  membre_id: null,
  fait: null,
  tags: null,
}

function corpsSupabase(url) {
  const table = tableDe(url)
  if (table === 'membres') return [MEMBRE]
  if (table === 'foyers') return [HOSTILE ? { ...FOYER, reglages: null } : FOYER]
  if (HOSTILE) return [LIGNE_BANCALE, { ...LIGNE_BANCALE, id: 'bancale-2' }]
  // Sinon toutes les autres tables répondent VIDE : chaque écran doit savoir
  // afficher un état vide sans planter.
  return []
}

/** En mode hostile, les relais de l'app répondent en panne, à tour de rôle. */
let tourDePanne = 0
function pannePourRelais() {
  const pannes = [
    { status: 500, contentType: 'text/html', body: '<html><body>Erreur serveur</body></html>' },
    { status: 429, contentType: 'application/json', body: '{"erreur":"quota","message":"Les IA sont saturées."}' },
    { status: 200, contentType: 'application/json', body: '{"erreur":"panne simulée"}' },
    { status: 200, contentType: 'application/json', body: 'null' },
    { status: 200, contentType: 'application/json', body: '{"resultats":null,"lieux":null,"incidents":null}' },
  ]
  const choix = pannes[tourDePanne % pannes.length]
  tourDePanne += 1
  return choix
}

// ————————————————————————————— Le parcours —————————————————————————————

async function principal() {
  if (!NAVIGATEUR) {
    console.error('Chromium introuvable dans /opt/pw-browsers.')
    process.exit(1)
  }
  const demandes = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const aVerifier = demandes.length > 0 ? ECRANS.filter(([c]) => demandes.some((d) => c.startsWith(d))) : ECRANS

  const port = 4173
  const serveur = await servir(port)
  const base = `http://127.0.0.1:${port}`
  const navigateur = await chromium.launch({ executablePath: NAVIGATEUR, args: ['--no-sandbox'] })
  const contexte = await navigateur.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 STG-Essai',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    permissions: [],
    // Le service worker mettrait l'app en cache et fausserait le banc d'essai.
    serviceWorkers: 'block',
  })

  // Une session déjà ouverte, pour arriver directement dans l'app.
  await contexte.addInitScript(
    ({ supabase, membre, foyer }) => {
      const ref = new URL(supabase).hostname.split('.')[0]
      const expiration = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365
      const session = {
        access_token: 'jeton-essai',
        token_type: 'bearer',
        expires_in: 60 * 60 * 24 * 365,
        expires_at: expiration,
        refresh_token: 'refresh-essai',
        user: {
          id: 'user-essai',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'essai@stg.test',
          app_metadata: {},
          user_metadata: {},
          created_at: '2024-01-01T00:00:00Z',
        },
      }
      // Ce script s'exécute dans CHAQUE document, y compris les cadres sans
      // origine (impression, aperçus) où localStorage est interdit : sans ce
      // filet, le banc d'essai s'accuserait lui-même d'un plantage.
      try {
        localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session))
        localStorage.setItem('stg-profil', JSON.stringify({ membre, membres: [membre], foyer }))
        // Le pop-up « Quoi de neuf » ne doit pas masquer les écrans testés.
        localStorage.setItem('stg-notes-vues', 'essai')
      } catch {
        // document sans stockage : rien à préparer ici
      }
    },
    { supabase: SUPABASE, membre: MEMBRE, foyer: FOYER },
  )

  // Tout ce qui sort de l'app est intercepté : rien ne part sur Internet.
  await contexte.route('**/*', async (route) => {
    const url = route.request().url()
    if (url.startsWith(base)) return route.continue()
    if (url.startsWith(SUPABASE)) {
      if (url.includes('/auth/v1/')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'user-essai' }) })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-0/0' },
        body: JSON.stringify(corpsSupabase(url)),
      })
    }
    // Les relais de l'app et les API publiques : réponse vide mais VALIDE —
    // ou franchement en panne quand on teste la résistance.
    if (HOSTILE) return route.fulfill(pannePourRelais())
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  const defauts = []
  for (const [chemin, titre] of aVerifier) {
    const page = await contexte.newPage()
    const plantages = []
    const erreursConsole = []
    page.on('pageerror', (e) => plantages.push(`${String(e.message ?? e)}\n${String(e.stack ?? '').split('\n').slice(0, 3).join(' | ')}`.slice(0, 400)))
    page.on('console', (m) => {
      if (m.type() === 'error') erreursConsole.push(m.text().slice(0, 200))
    })

    try {
      await page.goto(`${base}${chemin}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1800)

      const emmele = await page.getByText('Oups, un fil s’est emmêlé').count()
      const texte = ((await page.locator('body').innerText().catch(() => '')) ?? '').trim()

      // On appuie ensuite sur les boutons de l'écran : c'est là que se
      // cachent les plantages (feuilles d'ajout, formulaires, filtres).
      let boutonsTestes = 0
      if (emmele === 0) {
        const boutons = await page.locator('button:visible').all()
        for (const bouton of boutons.slice(0, 12)) {
          try {
            const libelle = (await bouton.innerText().catch(() => '')).trim()
            // On évite ce qui détruit ou déconnecte : le banc d'essai ne doit
            // jamais tester une action destructrice « pour voir ».
            if (/supprim|effacer|déconnect|vider|réinitialis/i.test(libelle)) continue
            await bouton.click({ timeout: 2500, force: false })
            boutonsTestes += 1
            await page.waitForTimeout(350)
            await page.keyboard.press('Escape').catch(() => {})
            // Un bouton a pu naviguer ailleurs : on revient sur l'écran testé.
            if (!page.url().endsWith(chemin)) {
              await page.goto(`${base}${chemin}`, { waitUntil: 'domcontentloaded', timeout: 15000 })
              await page.waitForTimeout(700)
            }
          } catch {
            // bouton non cliquable (masqué, hors écran) : on passe au suivant
          }
        }
      }

      const emmeleApres = await page.getByText('Oups, un fil s’est emmêlé').count()
      const problemes = []
      if (emmele > 0) problemes.push('écran en erreur dès l’ouverture')
      else if (emmeleApres > 0) problemes.push('écran en erreur après un appui sur un bouton')
      if (texte.length < 12) problemes.push('page quasiment vide (écran blanc)')
      if (plantages.length > 0) problemes.push(`plantage JS : ${plantages[0]}`)
      // Les erreurs de console purement réseau sont normales ici (tout est
      // simulé) : seules les vraies erreurs de code sont retenues.
      const vraiesErreurs = erreursConsole.filter(
        (e) => !/Failed to load resource|net::ERR|manifest|favicon|Service Worker|sw\.js/i.test(e),
      )
      if (vraiesErreurs.length > 0) problemes.push(`console : ${vraiesErreurs[0]}`)

      if (problemes.length > 0) {
        defauts.push({ chemin, titre, problemes })
        console.log(`❌ ${titre.padEnd(24)} ${chemin}\n   → ${problemes.join('\n   → ')}`)
      } else {
        console.log(`✅ ${titre.padEnd(24)} ${chemin}  (${boutonsTestes} bouton(s) testé(s))`)
      }
    } catch (e) {
      defauts.push({ chemin, titre, problemes: [`ouverture impossible : ${String(e).slice(0, 160)}`] })
      console.log(`❌ ${titre.padEnd(24)} ${chemin}\n   → ouverture impossible : ${String(e).slice(0, 160)}`)
    } finally {
      await page.close()
    }
  }

  await navigateur.close()
  serveur.close()

  console.log(`\n———\n${aVerifier.length - defauts.length}/${aVerifier.length} écrans OK.`)
  if (defauts.length > 0) {
    console.log(`${defauts.length} écran(s) à corriger : ${defauts.map((d) => d.chemin).join(', ')}`)
    process.exit(1)
  }
  process.exit(0)
}

void principal()
