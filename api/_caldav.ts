// Lecture DIRECTE d'iCloud par CalDAV — la porte officielle d'Apple, celle
// qu'utilisent les applis de calendrier. Elle voit TOUS les calendriers,
// y compris « Famille » du Partage familial. Authentification : identifiant
// Apple + mot de passe d'application (révocable à tout moment sur
// appleid.apple.com). Lecture seule : on ne modifie jamais rien chez Apple.

const RACINE = 'https://caldav.icloud.com'

function desechapperXml(texte: string): string {
  return texte
    .replace(/&#13;/g, '\r')
    .replace(/&#10;/g, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function blocsReponse(xml: string): string[] {
  return xml.match(/<(?:[\w-]+:)?response[\s>][\s\S]*?<\/(?:[\w-]+:)?response>/gi) ?? []
}

function premierHref(bloc: string): string | null {
  const r = /<(?:[\w-]+:)?href[^>]*>([^<]+)<\/(?:[\w-]+:)?href>/i.exec(bloc)
  return r?.[1] ? desechapperXml(r[1].trim()) : null
}

async function requeteDav(
  url: string,
  methode: string,
  auth: string,
  profondeur: string,
  corps: string,
): Promise<string> {
  const reponse = await fetch(url, {
    method: methode,
    headers: {
      authorization: `Basic ${auth}`,
      depth: profondeur,
      'content-type': 'application/xml; charset=utf-8',
    },
    body: corps,
  })
  if (reponse.status === 401) throw new Error('identifiants iCloud refusés (mot de passe d’app ?)')
  if (!reponse.ok && reponse.status !== 207) throw new Error(`iCloud ${methode} → ${reponse.status}`)
  return reponse.text()
}

/** Résout un href CalDAV (relatif ou absolu) contre l'hôte concerné. */
function resoudre(href: string, base: string): string {
  if (/^https?:\/\//i.test(href)) return href
  return new URL(href, base).toString()
}

/**
 * Lit les événements iCloud (fenêtre -30 j / +180 j) et rend le texte ICS brut
 * concaténé + les noms de calendriers réellement lus.
 */
export async function lireIcsDepuisIcloud(
  appleId: string,
  mdpApp: string,
  filtreNom: string | null,
): Promise<{ ics: string; calendriers: string[] }> {
  // Les claviers de téléphone glissent parfois des caractères invisibles
  // (puces, espaces insécables…) — on ne garde que l'ASCII imprimable.
  const nettoyer = (s: string) => s.normalize('NFKD').replace(/[^\x21-\x7E]/g, '')
  const identifiant = nettoyer(appleId)
  const mdp = nettoyer(mdpApp)
  if (!identifiant.includes('@') || mdp.length < 8) {
    throw new Error(`identifiant ou mot de passe d’app illisible après nettoyage (« ${identifiant} ») — supprime la connexion et ressaisis-la en tapant à la main`)
  }
  const auth = Buffer.from(`${identifiant}:${mdp}`).toString('base64')

  // 1. Le principal de l'utilisateur.
  const xmlPrincipal = await requeteDav(
    `${RACINE}/`,
    'PROPFIND',
    auth,
    '0',
    `<?xml version="1.0" encoding="utf-8"?>
     <d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`,
  )
  const hrefPrincipal = premierHref(
    /<(?:[\w-]+:)?current-user-principal[\s>][\s\S]*?<\/(?:[\w-]+:)?current-user-principal>/i.exec(xmlPrincipal)?.[0] ?? '',
  )
  if (!hrefPrincipal) throw new Error('principal iCloud introuvable')

  // 2. La maison des calendriers.
  const urlPrincipal = resoudre(hrefPrincipal, RACINE)
  const xmlMaison = await requeteDav(
    urlPrincipal,
    'PROPFIND',
    auth,
    '0',
    `<?xml version="1.0" encoding="utf-8"?>
     <d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
       <d:prop><c:calendar-home-set/></d:prop>
     </d:propfind>`,
  )
  const hrefMaison = premierHref(
    /<(?:[\w-]+:)?calendar-home-set[\s>][\s\S]*?<\/(?:[\w-]+:)?calendar-home-set>/i.exec(xmlMaison)?.[0] ?? '',
  )
  if (!hrefMaison) throw new Error('dossier de calendriers iCloud introuvable')

  // 3. La liste des calendriers.
  const urlMaison = resoudre(hrefMaison, urlPrincipal)
  const xmlListe = await requeteDav(
    urlMaison,
    'PROPFIND',
    auth,
    '1',
    `<?xml version="1.0" encoding="utf-8"?>
     <d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
       <d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/></d:prop>
     </d:propfind>`,
  )
  const calendriers: { url: string; nom: string }[] = []
  for (const bloc of blocsReponse(xmlListe)) {
    // Apple écrit <B:calendar xmlns:B="…"/> — le tag peut porter des attributs.
    const estCalendrier = /<(?:[\w-]+:)?calendar(?:\s[^>]*)?\/?>/i.test(bloc)
    if (!estCalendrier) continue
    // On écarte les boîtes de planification (invitations entrantes/sortantes).
    if (/schedule-(?:inbox|outbox)|notification/i.test(bloc)) continue
    const href = premierHref(bloc)
    const nom = /<(?:[\w-]+:)?displayname[^>]*>([^<]*)<\/(?:[\w-]+:)?displayname>/i.exec(bloc)?.[1] ?? ''
    if (href) calendriers.push({ url: resoudre(href, urlMaison), nom: desechapperXml(nom) })
  }

  const filtre = (filtreNom ?? '').trim().toLowerCase()
  const cibles = filtre
    ? calendriers.filter((c) => c.nom.toLowerCase().includes(filtre))
    : calendriers

  // 4. Les événements de chaque calendrier ciblé (fenêtre -30 j / +180 j).
  const versIcs = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const debut = versIcs(Date.now() - 30 * 86400000)
  const fin = versIcs(Date.now() + 180 * 86400000)
  const morceaux: string[] = []
  const lus: string[] = []
  for (const calendrier of cibles.slice(0, 10)) {
    try {
      const xmlEvenements = await requeteDav(
        calendrier.url,
        'REPORT',
        auth,
        '1',
        `<?xml version="1.0" encoding="utf-8"?>
         <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
           <d:prop><c:calendar-data/></d:prop>
           <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
             <c:time-range start="${debut}" end="${fin}"/>
           </c:comp-filter></c:comp-filter></c:filter>
         </c:calendar-query>`,
      )
      const donnees = xmlEvenements.match(
        /<(?:[\w-]+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?calendar-data>/gi,
      )
      for (const morceau of donnees ?? []) {
        const contenu = /^<[^>]+>([\s\S]*)<\/[^>]+>$/.exec(morceau)?.[1]
        if (contenu) morceaux.push(desechapperXml(contenu))
      }
      lus.push(calendrier.nom || 'sans nom')
    } catch {
      // calendrier illisible : on continue avec les autres
    }
  }

  if (cibles.length === 0) {
    throw new Error(
      `aucun calendrier ne correspond à « ${filtreNom} » — trouvés : ${calendriers.map((c) => c.nom).join(', ') || 'aucun'}`,
    )
  }

  return { ics: morceaux.join('\n'), calendriers: lus }
}
