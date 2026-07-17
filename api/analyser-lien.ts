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

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ erreur: 'Méthode non autorisée' }), { status: 405 })
  }
  const urlSupabase = process.env.VITE_SUPABASE_URL
  const cleAnon = process.env.VITE_SUPABASE_ANON_KEY
  const jeton = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!urlSupabase || !cleAnon || !jeton) {
    return new Response(JSON.stringify({ erreur: 'non_connecte' }), { status: 401 })
  }
  const verification = await fetch(`${urlSupabase}/auth/v1/user`, {
    headers: { apikey: cleAnon, authorization: `Bearer ${jeton}` },
  })
  if (!verification.ok) return new Response(JSON.stringify({ erreur: 'non_connecte' }), { status: 401 })

  const { url } = (await req.json()) as { url: string }
  let cible: URL
  try {
    cible = new URL(url)
    if (!/^https?:$/.test(cible.protocol)) throw new Error('protocole')
  } catch {
    return new Response(JSON.stringify({ erreur: 'url_invalide' }), { status: 400 })
  }

  let html = ''
  try {
    const page = await fetch(cible.toString(), {
      headers: {
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        accept: 'text/html',
      },
      redirect: 'follow',
    })
    html = (await page.text()).slice(0, 400000)
  } catch {
    return new Response(JSON.stringify({ erreur: 'inaccessible', message: 'Le site refuse la lecture — remplis à la main.' }), {
      status: 502, headers: { 'content-type': 'application/json' },
    })
  }

  const titre = extraire(html, [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    /<title[^>]*>([^<]+)<\/title>/i,
  ])
  const image = extraire(html, [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  ])
  let prixBrut = extraire(html, [
    /<meta[^>]+property=["'](?:og|product):price:amount["'][^>]+content=["']([\d.,]+)["']/i,
    /"price"\s*:\s*"?([\d]+[.,][\d]{2})"?/,
    /itemprop=["']price["'][^>]+content=["']([\d.,]+)["']/i,
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
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `Prix de vente actuel du produit sur cette page, en euros. Réponds UNIQUEMENT le nombre (ex. 49.99) ou null.\n\n${texte}` }] }],
            generationConfig: { maxOutputTokens: 16, temperature: 0 },
          }),
        },
      )
      if (reponse.ok) {
        const donnees = (await reponse.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
        const brut = donnees.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
        if (/^[\d.,]+$/.test(brut)) prixBrut = brut
      }
    } catch { /* le prix restera vide */ }
  }

  const prix = prixBrut ? Number(prixBrut.replace(',', '.')) : null

  return new Response(
    JSON.stringify({
      produit: {
        titre: titre ? titre.replace(/&amp;/g, '&').replace(/&#39;/g, '’').slice(0, 120) : null,
        image: image ?? null,
        prix: prix && Number.isFinite(prix) ? prix : null,
      },
    }),
    { headers: { 'content-type': 'application/json' } },
  )
}
