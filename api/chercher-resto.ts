// Recherches restaurant côté serveur :
// - mode "thefork" : retrouver la VRAIE page TheFork du restaurant (ou dire
//   franchement qu'elle n'existe pas) ;
// - mode "carte"  : aller lire le SITE du restaurant, trouver sa page
//   menu/carte et en extraire les images (recherche internet en secours).
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 60 }

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

async function pageHtml(url: string): Promise<string> {
  const reponse = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html', 'accept-language': 'fr-FR' },
    redirect: 'follow',
    // Un site qui ne répond jamais mangerait sinon les 60 s de la fonction.
    signal: AbortSignal.timeout(12000),
  })
  if (!reponse.ok) throw new Error(`page ${reponse.status}`)
  return (await reponse.text()).slice(0, 600000)
}

/** Premier lien d'un domaine dans les résultats de recherche (DDG puis Bing). */
async function chercherLien(requete: string, domaine: string, cheminAttendu: RegExp): Promise<string | null> {
  const q = encodeURIComponent(`site:${domaine} ${requete}`)
  try {
    const html = await pageHtml(`https://html.duckduckgo.com/html/?q=${q}`)
    const motif = /uddg=([^&"']+)/g
    let m: RegExpExecArray | null
    while ((m = motif.exec(html))) {
      const url = decodeURIComponent(m[1] ?? '')
      if (url.includes(domaine) && cheminAttendu.test(url)) return url
    }
  } catch {
    // Bing en secours
  }
  try {
    const html = await pageHtml(`https://www.bing.com/search?q=${q}&setlang=fr`)
    const motif = new RegExp(`href="(https://(?:www\\.)?${domaine.replace(/\./g, '\\.')}[^"]+)"`, 'g')
    let m: RegExpExecArray | null
    while ((m = motif.exec(html))) {
      const url = m[1] ?? ''
      if (cheminAttendu.test(url)) return url
    }
  } catch {
    // rien trouvé
  }
  return null
}

function absolutiser(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString()
  } catch {
    return null
  }
}

/** Les images de la carte, lues sur le site du restaurant. */
async function extraireCarte(site: string): Promise<{ pageMenu: string | null; images: string[] }> {
  const accueil = await pageHtml(site)
  // Les liens qui sentent la carte/menu (y compris les PDF).
  const liens = new Set<string>()
  const motifLien = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,80}?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = motifLien.exec(accueil)) && liens.size < 4) {
    const href = m[1] ?? ''
    const texte = (m[2] ?? '').replace(/<[^>]+>/g, '')
    if (/menu|carte|la-carte|nos-plats/i.test(href) || /menu|carte/i.test(texte)) {
      const absolu = absolutiser(site, href)
      if (absolu && !/facebook|instagram|tripadvisor/i.test(absolu)) liens.add(absolu)
    }
  }
  const pdf = [...liens].find((l) => /\.pdf(\?|$)/i.test(l)) ?? null
  const pagesALire = [[...liens].find((l) => !/\.pdf(\?|$)/i.test(l)), site].filter(Boolean) as string[]

  const images: string[] = []
  for (const page of pagesALire.slice(0, 2)) {
    try {
      const html = page === site ? accueil : await pageHtml(page)
      const og = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
      if (og) {
        const absolu = absolutiser(page, og)
        if (absolu) images.push(absolu)
      }
      const motifImg = /<img[^>]+src=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/gi
      let im: RegExpExecArray | null
      while ((im = motifImg.exec(html)) && images.length < 12) {
        const absolu = absolutiser(page, im[1] ?? '')
        if (absolu && !/logo|icon|favicon|sprite/i.test(absolu) && !images.includes(absolu)) images.push(absolu)
      }
    } catch {
      // page illisible
    }
  }
  return { pageMenu: pdf ?? [...liens][0] ?? null, images }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ erreur: 'POST uniquement' })
      return
    }
    const base = process.env.VITE_SUPABASE_URL ?? ''
    const anon = process.env.VITE_SUPABASE_ANON_KEY ?? ''
    const jeton = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    if (!base || !anon || !jeton) {
      res.status(401).json({ erreur: 'non_connecte' })
      return
    }
    const verification = await fetch(`${base}/auth/v1/user`, {
      headers: { apikey: anon, authorization: `Bearer ${jeton}` },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null)
    if (!verification?.ok) {
      res.status(401).json({ erreur: 'non_connecte' })
      return
    }

    const { mode, nom, ville, site, requete, lat, lon, rayon, quoi, deLat, deLon, aLat, aLon, debut, fin } = (req.body ?? {}) as {
      mode?: string
      nom?: string
      ville?: string
      site?: string
      requete?: string
      lat?: number
      lon?: number
      rayon?: number
      quoi?: string
      deLat?: number
      deLon?: number
      aLat?: number
      aLon?: number
      debut?: string
      fin?: string
    }

    // 🌊 Relais Hub'Eau/Vigicrues : stations hydrométriques autour d'un point
    // + dernière hauteur et tendance 24 h — Safari bloque l'appel direct.
    if (mode === 'crues') {
      const la = Number(lat)
      const lo = Number(lon)
      if (!Number.isFinite(la) || !Number.isFinite(lo)) {
        res.status(200).json({ stations: [], erreur: 'position invalide' })
        return
      }
      // Le pare-feu de Hub'Eau refuse (403) les requêtes sans identité : on se
      // présente avec un User-Agent. Et on parle d'abord l'API v2 (actuelle),
      // avec repli sur la v1 si besoin.
      const entetesHubeau = {
        'user-agent': 'Mozilla/5.0 (compatible; STG-Foyer/1.0; +https://foyer-ten-omega.vercel.app)',
        accept: 'application/json',
      }
      let version = 'v2'
      let r = await fetch(
        `https://hubeau.eaufrance.fr/api/v2/hydrometrie/referentiel/stations?latitude=${la}&longitude=${lo}&distance=25&size=8&format=json`,
        { headers: entetesHubeau, signal: AbortSignal.timeout(12000) },
      )
      if (!r.ok) {
        const statutV2 = r.status
        version = 'v1'
        r = await fetch(
          `https://hubeau.eaufrance.fr/api/v1/hydrometrie/referentiel/stations?latitude=${la}&longitude=${lo}&distance=25&size=8&format=json`,
          { headers: entetesHubeau, signal: AbortSignal.timeout(12000) },
        )
        if (!r.ok) {
          res.status(200).json({ stations: [], erreur: `hubeau v2:${statutV2} v1:${r.status}` })
          return
        }
      }
      const donnees = (await r.json().catch(() => null)) as {
        data?: unknown
      } | null
      const actives = (Array.isArray(donnees?.data) ? donnees.data : ([] as unknown[]))
        .map((s) => s as { code_station?: unknown; libelle_station?: unknown; libelle_cours_eau?: unknown; en_service?: unknown })
        .filter((s) => typeof s?.code_station === 'string' && s.en_service !== false)
        .map((s) => ({
          code_station: String(s.code_station),
          libelle_station: typeof s.libelle_station === 'string' ? s.libelle_station : String(s.code_station),
          libelle_cours_eau: typeof s.libelle_cours_eau === 'string' ? s.libelle_cours_eau : null,
        }))
        .slice(0, 5)
      const stations = await Promise.all(
        actives.map(async (s) => {
          try {
            let obs = await fetch(
              `https://hubeau.eaufrance.fr/api/${version}/hydrometrie/observations_tp?code_entite=${s.code_station}&grandeur_hydro=H&size=300&sort=desc`,
              { headers: entetesHubeau, signal: AbortSignal.timeout(12000) },
            )
            // Les mesures peuvent réussir sur une version et pas l'autre.
            if (!obs.ok && version === 'v2') {
              obs = await fetch(
                `https://hubeau.eaufrance.fr/api/v1/hydrometrie/observations_tp?code_entite=${s.code_station}&grandeur_hydro=H&size=300&sort=desc`,
                { headers: entetesHubeau, signal: AbortSignal.timeout(12000) },
              )
            }
            // `resultat_obs` peut être null ou absent : on ne garde que du chiffré.
            const brutes = obs.ok
              ? (((await obs.json().catch(() => null)) as { data?: unknown } | null)?.data ?? [])
              : []
            const mesures = (Array.isArray(brutes) ? brutes : [])
              .map((m) => m as { resultat_obs?: unknown; date_obs?: unknown })
              .filter((m) => Number.isFinite(Number(m?.resultat_obs)) && typeof m?.date_obs === 'string')
              .map((m) => ({ resultat_obs: Number(m.resultat_obs), date_obs: String(m.date_obs) }))
            const derniere = mesures[0]
            const cible = Date.now() - 24 * 3600 * 1000
            const ancienne = [...mesures].sort(
              (a, b) => Math.abs(new Date(a.date_obs).getTime() - cible) - Math.abs(new Date(b.date_obs).getTime() - cible),
            )[0]
            return {
              code: s.code_station,
              nom: s.libelle_station,
              cours: s.libelle_cours_eau,
              hauteurM: derniere ? derniere.resultat_obs / 1000 : null,
              variation24hCm:
                derniere && ancienne && ancienne !== derniere
                  ? Math.round((derniere.resultat_obs - ancienne.resultat_obs) / 10)
                  : null,
              mesureA: derniere?.date_obs ?? null,
            }
          } catch {
            return { code: s.code_station, nom: s.libelle_station, cours: s.libelle_cours_eau, hauteurM: null, variation24hCm: null, mesureA: null }
          }
        }),
      )
      res.status(200).json({ stations })
      return
    }

    // Relais Overpass : Safari bloque parfois l'appel direct depuis l'app,
    // alors le serveur de STG interroge les cartes à sa place.
    if (mode === 'autour') {
      const la = Number(lat)
      const lo = Number(lon)
      const ra = Math.min(Math.max(Number(rayon) || 2000, 100), 30000)
      if (!Number.isFinite(la) || !Number.isFinite(lo)) {
        res.status(200).json({ elements: [], erreur: 'position invalide' })
        return
      }
      // Le même relais sert plusieurs types de lieux (restaurants, pharmacies, stations…).
      const amenity = quoi === 'pharmacies' ? 'pharmacy' : quoi === 'stations' ? 'fuel' : 'restaurant|bistro|brasserie'
      const motNominatim = quoi === 'pharmacies' ? 'pharmacie' : quoi === 'stations' ? 'station essence' : 'restaurant'
      // Toutes les sources sont interrogées EN MÊME TEMPS — la première qui
      // répond avec des tables gagne. Fini l'attente en cascade.
      const filtreNom = quoi === 'stations' ? '' : '[name]'
      const requeteOsm = `[out:json][timeout:10];(node(around:${ra},${la},${lo})[amenity~"${amenity}"]${filtreNom};way(around:${ra},${la},${lo})[amenity~"${amenity}"]${filtreNom};);out center 80;`
      const miroirs = [
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass.private.coffee/api/interpreter',
        'https://overpass-api.de/api/interpreter',
      ]
      const viaOverpass = miroirs.map(async (miroir) => {
        const r = await fetch(miroir, {
          method: 'POST',
          body: `data=${encodeURIComponent(requeteOsm)}`,
          headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
          signal: AbortSignal.timeout(12000),
        })
        if (!r.ok) throw new Error(`overpass ${r.status}`)
        const brut = (await r.json()) as { elements?: unknown }
        return { elements: Array.isArray(brut?.elements) ? brut.elements : [] }
      })
      const viaNominatim = (async () => {
        const dLat = ra / 111320
        const dLon = ra / (111320 * Math.cos((la * Math.PI) / 180))
        const viewbox = `${lo - dLon},${la + dLat},${lo + dLon},${la - dLat}`
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${motNominatim}&format=jsonv2&limit=50&bounded=1&viewbox=${viewbox}&extratags=1&accept-language=fr`,
          {
            headers: { accept: 'application/json', 'user-agent': 'STG-app-famille/1.0' },
            signal: AbortSignal.timeout(12000),
          },
        )
        if (!r.ok) throw new Error(`nominatim ${r.status}`)
        const brut: unknown = await r.json()
        const liste = (Array.isArray(brut) ? brut : []) as {
          place_id?: number
          lat?: string
          lon?: string
          display_name?: string
          name?: string
          extratags?: Record<string, string> | null
        }[]
        const elements = liste
          .map((x) => {
            // `display_name` peut manquer : sinon .split() ferait tomber la source.
            const nomLieu = x.name || (typeof x.display_name === 'string' ? x.display_name.split(',')[0] : '') || ''
            const cuisine = x.extratags?.['cuisine']
            const phone = x.extratags?.['phone'] ?? x.extratags?.['contact:phone']
            const website = x.extratags?.['website'] ?? x.extratags?.['contact:website']
            return {
              id: x.place_id,
              lat: Number(x.lat),
              lon: Number(x.lon),
              tags: {
                name: nomLieu,
                ...(cuisine ? { cuisine } : {}),
                ...(phone ? { phone } : {}),
                ...(website ? { website } : {}),
              },
            }
          })
          .filter((x) => x.tags.name)
        // Vide = on laisse sa chance à Overpass (plus complet) plutôt que de gagner à tort.
        if (elements.length === 0) throw new Error('nominatim vide')
        return { elements }
      })()
      try {
        const donnees = await Promise.any([...viaOverpass, viaNominatim])
        res.status(200).json(donnees)
      } catch (e) {
        const motifs = (e instanceof AggregateError ? e.errors : [e]).map((x) =>
          String(x instanceof Error ? x.message : x).slice(0, 40),
        )
        res.status(200).json({ elements: [], erreur: `serveurs cartes : ${motifs.join(' / ')}` })
      }
      return
    }

    // 🏠 Relais DVF (demandes de valeurs foncières) : les ventes immobilières
    // réelles autour d'un point, via le miroir libre de C. Quest.
    if (mode === 'dvf') {
      const la = Number(lat)
      const lo = Number(lon)
      if (!Number.isFinite(la) || !Number.isFinite(lo)) {
        res.status(200).json({ ventes: [], erreur: 'position invalide' })
        return
      }
      const ra = Math.min(Math.max(Number(rayon) || 400, 50), 1000)
      try {
        const r = await fetch(`https://api.cquest.org/dvf?lat=${la}&lon=${lo}&dist=${ra}`, {
          headers: { 'user-agent': UA, accept: 'application/json' },
          signal: AbortSignal.timeout(12000),
        })
        if (!r.ok) {
          res.status(200).json({ ventes: [], erreur: `dvf ${r.status}` })
          return
        }
        const donnees = (await r.json().catch(() => null)) as {
          resultats?: {
            date_mutation?: string
            valeur_fonciere?: number
            // « surface_relle_bati » : la faute d'orthographe vient du jeu de données officiel.
            surface_relle_bati?: number
            type_local?: string | null
            numero_voie?: string | number | null
            voie?: string | null
            commune?: string | null
          }[]
        } | null
        const ventes = (Array.isArray(donnees?.resultats) ? donnees.resultats : [])
          .filter((v) => Number(v.valeur_fonciere) > 1000)
          .map((v) => {
            const prix = Math.round(Number(v.valeur_fonciere))
            const surface = Number(v.surface_relle_bati) || null
            return {
              date: v.date_mutation ?? '',
              prix,
              surface,
              prixM2: surface && surface > 10 ? Math.round(prix / surface) : null,
              type: v.type_local ?? null,
              adresse: [v.numero_voie, v.voie, v.commune].filter((x) => x != null && String(x).trim() !== '').join(' '),
            }
          })
          .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
          .slice(0, 80)
        res.status(200).json({ ventes })
      } catch (e) {
        res.status(200).json({ ventes: [], erreur: `dvf ${String(e instanceof Error ? e.message : e).slice(0, 60)}` })
      }
      return
    }

    // 🏖️ Qualité des eaux de baignade : commune via geo.api.gouv.fr, puis
    // tentative de lecture du site officiel (HTML très old-school — on parse
    // DÉFENSIVEMENT et on renvoie toujours le lien officiel en secours).
    if (mode === 'baignades') {
      const lien = 'https://baignades.sante.gouv.fr'
      const la = Number(lat)
      const lo = Number(lon)
      if (!Number.isFinite(la) || !Number.isFinite(lo)) {
        res.status(200).json({ sites: [], commune: null, lien, erreur: 'position invalide' })
        return
      }
      let commune: string | null = null
      let dept: string | null = null
      try {
        const rGeo = await fetch(`https://geo.api.gouv.fr/communes?lat=${la}&lon=${lo}&fields=nom,codeDepartement`, {
          headers: { accept: 'application/json', 'user-agent': UA },
          signal: AbortSignal.timeout(12000),
        })
        if (rGeo.ok) {
          const brutGeo: unknown = await rGeo.json()
          const communes = (Array.isArray(brutGeo) ? brutGeo : []) as { nom?: string; codeDepartement?: string }[]
          commune = typeof communes[0]?.nom === 'string' ? communes[0].nom : null
          dept = typeof communes[0]?.codeDepartement === 'string' ? communes[0].codeDepartement : null
        }
      } catch {
        // la commune restera inconnue, ce n'est pas bloquant
      }
      const sites: { nom: string; commune: string; qualite: string | null }[] = []
      if (dept) {
        try {
          // Le code « dptddass » est le département sur 3 caractères (83 → 083).
          const dptddass = `0${dept}`.slice(-3)
          const annee = new Date().getFullYear()
          const r = await fetch(
            `https://baignades.sante.gouv.fr/baignades/consultSite.do?dptddass=${dptddass}&annee=${annee}`,
            { headers: { 'user-agent': UA, accept: 'text/html', 'accept-language': 'fr-FR' }, signal: AbortSignal.timeout(12000) },
          )
          if (r.ok) {
            const html = (await r.text()).slice(0, 500000)
            // On cherche des lignes de tableau « nom / commune / qualité » —
            // si la page a changé de forme, on repart simplement les mains vides.
            const motifLigne = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
            let m: RegExpExecArray | null
            while ((m = motifLigne.exec(html)) && sites.length < 40) {
              const cellules = [...(m[1] ?? '').matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
                .map((c) => (c[1] ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
                .filter(Boolean)
              const premier = cellules[0] ?? ''
              if (cellules.length >= 2 && premier && !/^(site|commune|qualit|point de|d[ée]partement)/i.test(premier)) {
                sites.push({
                  nom: premier,
                  commune: cellules[1] ?? '',
                  qualite: cellules.find((c) => /excellent|bon(ne)?|suffisant|insuffisant|non class/i.test(c)) ?? null,
                })
              }
            }
          }
        } catch {
          // le site officiel boude — on renvoie quand même commune + lien
        }
      }
      res.status(200).json({ sites, commune, lien })
      return
    }

    // 🚗 Temps de parcours AVEC bouchons (TomTom Routing).
    if (mode === 'trafic') {
      const cle = process.env.TOMTOM_KEY
      if (!cle) {
        res.status(200).json({ erreur: 'cle_absente' })
        return
      }
      const dLa = Number(deLat)
      const dLo = Number(deLon)
      const aLa = Number(aLat)
      const aLo = Number(aLon)
      if (![dLa, dLo, aLa, aLo].every(Number.isFinite)) {
        res.status(200).json({ erreur: 'position invalide' })
        return
      }
      try {
        const r = await fetch(
          `https://api.tomtom.com/routing/1/calculateRoute/${dLa},${dLo}:${aLa},${aLo}/json?traffic=true&key=${cle}`,
          { headers: { accept: 'application/json', 'user-agent': UA }, signal: AbortSignal.timeout(12000) },
        )
        if (!r.ok) {
          res.status(200).json({ erreur: `tomtom ${r.status}` })
          return
        }
        const donnees = (await r.json().catch(() => null)) as {
          routes?: { summary?: { travelTimeInSeconds?: number; noTrafficTravelTimeInSeconds?: number; lengthInMeters?: number } }[]
        } | null
        const resume = (Array.isArray(donnees?.routes) ? donnees.routes : [])[0]?.summary
        const avec = Number(resume?.travelTimeInSeconds)
        const sans = Number(resume?.noTrafficTravelTimeInSeconds)
        if (!Number.isFinite(avec) || !Number.isFinite(sans)) {
          res.status(200).json({ erreur: 'tomtom reponse illisible' })
          return
        }
        res.status(200).json({
          minutes: Math.round(avec / 60),
          minutesSansTrafic: Math.round(sans / 60),
          bouchonsMin: Math.round((avec - sans) / 60),
          km: Number.isFinite(Number(resume?.lengthInMeters)) ? Math.round(Number(resume?.lengthInMeters) / 1000) : null,
        })
      } catch (e) {
        res.status(200).json({ erreur: `tomtom ${String(e instanceof Error ? e.message : e).slice(0, 60)}` })
      }
      return
    }

    // 🎭 Sorties : événements OpenAgenda dans une boîte de ±0,25° autour du point.
    if (mode === 'sorties') {
      const cle = process.env.OPENAGENDA_KEY
      if (!cle) {
        res.status(200).json({ erreur: 'cle_absente' })
        return
      }
      const la = Number(lat)
      const lo = Number(lon)
      if (!Number.isFinite(la) || !Number.isFinite(lo)) {
        res.status(200).json({ evenements: [], erreur: 'position invalide' })
        return
      }
      try {
        const boite = 0.25
        const params = [
          `key=${cle}`,
          'size=20',
          'relative[]=current',
          'relative[]=upcoming',
          `geo[northEast][lat]=${la + boite}`,
          `geo[northEast][lng]=${lo + boite}`,
          `geo[southWest][lat]=${la - boite}`,
          `geo[southWest][lng]=${lo - boite}`,
        ]
        if (debut) params.push(`timings[gte]=${encodeURIComponent(String(debut))}`)
        if (fin) params.push(`timings[lte]=${encodeURIComponent(String(fin))}`)
        const r = await fetch(`https://api.openagenda.com/v2/events?${params.join('&')}`, {
          headers: { accept: 'application/json', 'user-agent': UA },
          signal: AbortSignal.timeout(12000),
        })
        if (!r.ok) {
          res.status(200).json({ evenements: [], erreur: `openagenda ${r.status}` })
          return
        }
        const donnees = (await r.json().catch(() => null)) as {
          events?: {
            title?: { fr?: string } | string
            location?: { name?: string; city?: string }
            nextTiming?: { begin?: string }
            canonicalUrl?: string
          }[]
        } | null
        const evenements = (Array.isArray(donnees?.events) ? donnees.events : [])
          .map((e) => ({
            titre: typeof e.title === 'string' ? e.title : (e.title?.fr ?? Object.values(e.title ?? {})[0] ?? ''),
            lieu: [e.location?.name, e.location?.city].filter(Boolean).join(', '),
            quand: e.nextTiming?.begin ?? null,
            url: e.canonicalUrl ?? null,
          }))
          .filter((e) => e.titre)
          .sort((a, b) => String(a.quand ?? '9999').localeCompare(String(b.quand ?? '9999')))
          .slice(0, 15)
        res.status(200).json({ evenements })
      } catch (e) {
        res.status(200).json({ evenements: [], erreur: `openagenda ${String(e instanceof Error ? e.message : e).slice(0, 60)}` })
      }
      return
    }

    // 📷 Webcams Windy (v3) dans un rayon de 25 km — pour voir la météo en vrai.
    if (mode === 'webcams') {
      const cle = process.env.WINDY_WEBCAMS_KEY
      if (!cle) {
        res.status(200).json({ erreur: 'cle_absente' })
        return
      }
      const la = Number(lat)
      const lo = Number(lon)
      if (!Number.isFinite(la) || !Number.isFinite(lo)) {
        res.status(200).json({ webcams: [], erreur: 'position invalide' })
        return
      }
      try {
        const r = await fetch(
          `https://api.windy.com/webcams/api/v3/webcams?nearby=${la},${lo},25&include=images,location,player&limit=12`,
          { headers: { 'X-WINDY-API-KEY': cle, accept: 'application/json', 'user-agent': UA }, signal: AbortSignal.timeout(12000) },
        )
        if (!r.ok) {
          res.status(200).json({ webcams: [], erreur: `windy ${r.status}` })
          return
        }
        const donnees = (await r.json().catch(() => null)) as {
          webcams?: {
            title?: string
            webcamId?: number
            location?: { city?: string }
            images?: { current?: { preview?: string; thumbnail?: string } }
            player?: { day?: string; lifetime?: string }
            urls?: { detail?: string }
          }[]
        } | null
        const webcams = (Array.isArray(donnees?.webcams) ? donnees.webcams : [])
          .map((w) => ({
            titre: w.title ?? '',
            ville: w.location?.city ?? '',
            image: w.images?.current?.preview ?? w.images?.current?.thumbnail ?? null,
            lien:
              (typeof w.player?.day === 'string' ? w.player.day : null) ??
              (typeof w.urls?.detail === 'string' ? w.urls.detail : null) ??
              (w.webcamId ? `https://www.windy.com/webcams/${w.webcamId}` : null),
          }))
          .filter((w) => w.titre || w.image)
        res.status(200).json({ webcams })
      } catch (e) {
        res.status(200).json({ webcams: [], erreur: `windy ${String(e instanceof Error ? e.message : e).slice(0, 60)}` })
      }
      return
    }

    if (mode === 'thefork') {
      const url = await chercherLien(`${nom ?? ''} ${ville ?? ''}`.trim(), 'thefork.fr', /\/restaurant/)
      res.status(200).json({ url })
      return
    }

    if (mode === 'carte') {
      let pageMenu: string | null = null
      let images: string[] = []
      if (site) {
        try {
          const resultat = await extraireCarte(site)
          pageMenu = resultat.pageMenu
          images = resultat.images
        } catch {
          // le site refuse — la recherche d'images prendra le relais
        }
      }
      if (images.length < 3) {
        const { chercherImages } = await import('./_images.js')
        const complement = await chercherImages(requete || `${nom ?? ''} ${ville ?? ''} carte menu restaurant`, 9)
        for (const image of complement) if (!images.includes(image)) images.push(image)
      }
      res.status(200).json({ pageMenu, images: images.slice(0, 12) })
      return
    }

    res.status(400).json({ erreur: 'mode inconnu' })
  } catch (erreur) {
    // Filet global : toutes les formes attendues par le client sont présentes,
    // quel que soit le mode qui a échoué — jamais un champ manquant.
    res.status(200).json({
      url: null, pageMenu: null, images: [], stations: [], elements: [], ventes: [],
      sites: [], commune: null, evenements: [], webcams: [],
      erreur: String(erreur instanceof Error ? erreur.message : erreur).slice(0, 120),
    })
  }
}
