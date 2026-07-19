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
    })
    if (!verification.ok) {
      res.status(401).json({ erreur: 'non_connecte' })
      return
    }

    const { mode, nom, ville, site, requete, lat, lon, rayon } = (req.body ?? {}) as {
      mode?: string
      nom?: string
      ville?: string
      site?: string
      requete?: string
      lat?: number
      lon?: number
      rayon?: number
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
      // Toutes les sources sont interrogées EN MÊME TEMPS — la première qui
      // répond avec des tables gagne. Fini l'attente en cascade.
      const requeteOsm = `[out:json][timeout:10];(node(around:${ra},${la},${lo})[amenity~"restaurant|bistro|brasserie"][name];way(around:${ra},${la},${lo})[amenity~"restaurant|bistro|brasserie"][name];);out center 80;`
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
        return (await r.json()) as { elements?: unknown[] }
      })
      const viaNominatim = (async () => {
        const dLat = ra / 111320
        const dLon = ra / (111320 * Math.cos((la * Math.PI) / 180))
        const viewbox = `${lo - dLon},${la + dLat},${lo + dLon},${la - dLat}`
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search?q=restaurant&format=jsonv2&limit=50&bounded=1&viewbox=${viewbox}&extratags=1&accept-language=fr`,
          {
            headers: { accept: 'application/json', 'user-agent': 'STG-app-famille/1.0' },
            signal: AbortSignal.timeout(12000),
          },
        )
        if (!r.ok) throw new Error(`nominatim ${r.status}`)
        const liste = (await r.json()) as {
          place_id: number
          lat: string
          lon: string
          display_name: string
          name?: string
          extratags?: Record<string, string>
        }[]
        const elements = liste
          .map((x) => {
            const nomLieu = x.name || x.display_name.split(',')[0] || ''
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
    res.status(200).json({ url: null, pageMenu: null, images: [], erreur: String(erreur instanceof Error ? erreur.message : erreur).slice(0, 120) })
  }
}
