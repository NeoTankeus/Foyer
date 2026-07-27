// Lit une page produit (lien collé dans la liste de cadeaux) côté serveur
// (pas de CORS ici) et en extrait titre, image et prix. Gemini en secours.

export const config = { runtime: 'edge' }

function extraire(html: string, motifs: RegExp[]): string | null {
  for (const motif of motifs) {
    const resultat = motif.exec(html)
    if (resultat?.[1]) return resultat[1].trim()
  }
  return null
}

/** Toute réponse part en JSON, avec le bon en-tête : le client peut TOUJOURS la lire. */
const repondre = (corps: unknown, status = 200): Response =>
  new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

/** Un corps de requête illisible ne doit jamais devenir un 500. */
async function lireCorps(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const brut: unknown = await req.json()
    return brut && typeof brut === 'object' && !Array.isArray(brut) ? (brut as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
  if (req.method !== 'POST') {
    return repondre({ erreur: 'methode', message: 'POST uniquement' }, 405)
  }
  const urlSupabase = process.env.VITE_SUPABASE_URL
  const cleAnon = process.env.VITE_SUPABASE_ANON_KEY
  const jeton = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!urlSupabase || !cleAnon || !jeton) {
    return repondre({ erreur: 'non_connecte' }, 401)
  }
  const verification = await fetch(`${urlSupabase}/auth/v1/user`, {
    headers: { apikey: cleAnon, authorization: `Bearer ${jeton}` },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  if (!verification?.ok) return repondre({ erreur: 'non_connecte' }, 401)

  const corpsRequete = await lireCorps(req)
  const url = typeof corpsRequete?.['url'] === 'string' ? (corpsRequete['url'] as string) : ''
  let cible: URL
  try {
    cible = new URL(url)
    if (!/^https?:$/.test(cible.protocol)) throw new Error('protocole')
  } catch {
    return repondre({ erreur: 'url_invalide' }, 400)
  }

  let html = ''
  let urlFinale = cible.toString()
  try {
    const page = await fetch(cible.toString(), {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'fr-FR,fr;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    })
    urlFinale = page.url || urlFinale
    html = (await page.text()).slice(0, 500000)
  } catch {
    return repondre({ erreur: 'inaccessible', message: 'Le site refuse la lecture — remplis à la main.' }, 502)
  }

  // Lien court Amazon (amzn.eu/…) : on canonise vers la vraie fiche produit —
  // c'est elle qu'on gardera pour la veille des prix.
  const asin = /\/(?:dp|gp\/product|gp\/aw\/d|d)\/([A-Z0-9]{10})(?:[/?]|$)/.exec(urlFinale)?.[1]
    ?? /"asin"\s*:\s*"([A-Z0-9]{10})"/.exec(html)?.[1]
  if (asin && /amazon\.|amzn\./i.test(urlFinale)) {
    urlFinale = `https://www.amazon.fr/dp/${asin}`
  }

  let titre = extraire(html, [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    /<span[^>]+id=["']productTitle["'][^>]*>([^<]+)</i,
    /<title[^>]*>([^<]+)<\/title>/i,
  ])
  // Titre-poubelle (page-barrière, accueil du site) : on n'en veut pas.
  if (
    titre &&
    (/^(amazon|amazon\.fr|amazon\.com|fnac|fnac\.com|carrefour|cdiscount|e\.leclerc|robot check|captcha|accès refusé|access denied|attention required)/i.test(titre.trim()) ||
      titre.trim().length < 4)
  ) {
    titre = null
  }
  // L'image du SITE d'abord — og:image, JSON-LD marchand, puis les gabarits
  // spécifiques d'Amazon (qui ne met pas d'og:image sur ses fiches produit).
  const image = extraire(html, [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /"image"\s*:\s*\[\s*"(https:[^"]+)"/i,
    /"image"\s*:\s*"(https:[^"]+)"/i,
    /"hiRes"\s*:\s*"(https:[^"]+)"/,
    /data-old-hires=["'](https:[^"']+)["']/i,
    /id=["']landingImage["'][^>]*\ssrc=["'](https:[^"']+)["']/i,
    /data-a-dynamic-image=["']\{&quot;(https:[^&"']+)&quot;/i,
    /data-a-dynamic-image=["']\{"(https:[^"']+)"/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["'](https:[^"']+)["']/i,
  ])
  let prixBrut = extraire(html, [
    /<meta[^>]+property=["'](?:og|product):price:amount["'][^>]+content=["']([\d.,]+)["']/i,
    /"priceAmount"\s*:\s*([\d.]+)/,
    /class=["']a-offscreen["'][^>]*>\s*([\d\s]{1,7}[,.][\d]{2})\s*€/,
    /"price"\s*:\s*"?([\d]+[.,][\d]{2})"?/,
    /itemprop=["']price["'][^>]+content=["']([\d.,]+)["']/i,
    /"displayPrice"\s*:\s*"([\d\s.,]+)\s*€/,
  ])

  // Secours IA : si le prix résiste aux motifs classiques, Gemini lit la page.
  const cleGemini = process.env.GEMINI_API_KEY
  if (!prixBrut && cleGemini) {
    const texte = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 15000)
    try {
      const reponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${cleGemini}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `Prix de vente actuel du produit sur cette page, en euros. Réponds UNIQUEMENT le nombre (ex. 49.99) ou null.\n\n${texte}` }] }],
            generationConfig: { maxOutputTokens: 16, temperature: 0 },
          }),
        },
      )
      if (reponse.ok) {
        const donnees = (await reponse.json()) as { candidates?: { content?: { parts?: unknown } }[] } | null
        const parts = donnees?.candidates?.[0]?.content?.parts
        const premier = Array.isArray(parts) ? (parts[0] as { text?: unknown } | undefined) : undefined
        const brut = typeof premier?.text === 'string' ? premier.text.trim() : ''
        if (/^[\d.,]+$/.test(brut)) prixBrut = brut
      }
    } catch { /* le prix restera vide */ }
  }

  const prix = prixBrut ? Number(prixBrut.replace(/\s/g, '').replace(',', '.')) : null
  const titrePropre = titre ? titre.replace(/&amp;/g, '&').replace(/&#39;/g, '’').slice(0, 120) : null

  // Visuel garanti : si le site cache son image (Amazon…), on la cherche sur
  // internet à partir du titre — même principe que le CRM.
  let imageFinale = image ?? null
  if (!imageFinale && titrePropre) {
    try {
      const q = encodeURIComponent(titrePropre.slice(0, 80))
      const bing = await fetch(`https://www.bing.com/images/search?q=${q}&count=5&setlang=fr`, {
        headers: {
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
          'accept-language': 'fr-FR',
        },
        signal: AbortSignal.timeout(10000),
      })
      const htmlBing = await bing.text()
      imageFinale =
        /turl&quot;:&quot;(https:\/\/[^&"]+?)&quot;/.exec(htmlBing)?.[1] ??
        /"turl":"(https:\/\/[^"]+?)"/.exec(htmlBing)?.[1] ??
        null
      if (imageFinale) imageFinale = imageFinale.replace(/\\u0026/g, '&')
    } catch {
      // pas d'image trouvée — tant pis
    }
  }

  return repondre({
    produit: {
      titre: titrePropre,
      image: imageFinale,
      prix: prix && Number.isFinite(prix) && prix > 0 ? prix : null,
      url: urlFinale,
    },
  })
  } catch (erreur) {
    // Aucun chemin ne doit finir en 500 opaque : le client reçoit toujours du JSON.
    return repondre(
      { erreur: 'serveur', message: String(erreur instanceof Error ? erreur.message : erreur).slice(0, 160) },
      500,
    )
  }
}
