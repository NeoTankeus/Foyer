// Recherche d'images de produits sur internet (comme le CRM) : DuckDuckGo
// d'abord, Bing en secours. On rend l'URL de la miniature — stable et légère.

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

async function parDuckDuckGo(requete: string): Promise<string | null> {
  const q = encodeURIComponent(requete)
  const page = await fetch(`https://duckduckgo.com/?q=${q}&iax=images&ia=images`, {
    headers: { 'user-agent': UA },
  })
  const html = await page.text()
  const vqd = /vqd=["']?([\d-]+)["']?/.exec(html)?.[1]
  if (!vqd) return null
  const reponse = await fetch(
    `https://duckduckgo.com/i.js?l=fr-fr&o=json&q=${q}&vqd=${vqd}&p=1`,
    { headers: { 'user-agent': UA, referer: 'https://duckduckgo.com/' } },
  )
  if (!reponse.ok) return null
  const donnees = (await reponse.json()) as { results?: { thumbnail?: string; image?: string }[] }
  const premier = donnees.results?.[0]
  return premier?.thumbnail ?? premier?.image ?? null
}

async function parBing(requete: string): Promise<string | null> {
  const q = encodeURIComponent(requete)
  const page = await fetch(`https://www.bing.com/images/search?q=${q}&count=10&setlang=fr`, {
    headers: { 'user-agent': UA, 'accept-language': 'fr-FR' },
  })
  const html = await page.text()
  const turl =
    /turl&quot;:&quot;(https:\/\/[^&"]+?)&quot;/.exec(html)?.[1] ??
    /"turl":"(https:\/\/[^"]+?)"/.exec(html)?.[1] ??
    /murl&quot;:&quot;(https:\/\/[^&"]+?)&quot;/.exec(html)?.[1]
  return turl ? turl.replace(/\\u0026/g, '&') : null
}

async function plusieursParDuckDuckGo(requete: string, max: number): Promise<string[]> {
  const q = encodeURIComponent(requete)
  const page = await fetch(`https://duckduckgo.com/?q=${q}&iax=images&ia=images`, {
    headers: { 'user-agent': UA },
  })
  const vqd = /vqd=["']?([\d-]+)["']?/.exec(await page.text())?.[1]
  if (!vqd) return []
  const reponse = await fetch(
    `https://duckduckgo.com/i.js?l=fr-fr&o=json&q=${q}&vqd=${vqd}&p=1`,
    { headers: { 'user-agent': UA, referer: 'https://duckduckgo.com/' } },
  )
  if (!reponse.ok) return []
  const donnees = (await reponse.json()) as { results?: { thumbnail?: string; image?: string }[] }
  return (donnees.results ?? [])
    .map((r) => r.thumbnail ?? r.image)
    .filter((u): u is string => Boolean(u))
    .slice(0, max)
}

function plusieursParBingHtml(html: string, max: number): string[] {
  const urls: string[] = []
  const motif = /turl&quot;:&quot;(https:\/\/[^&"]+?)&quot;|"turl":"(https:\/\/[^"]+?)"/g
  let m: RegExpExecArray | null
  while ((m = motif.exec(html)) && urls.length < max) {
    const u = (m[1] ?? m[2] ?? '').replace(/\\u0026/g, '&')
    if (u && !urls.includes(u)) urls.push(u)
  }
  return urls
}

/** Jusqu'à `max` images candidates pour un libellé — l'utilisateur choisit. */
export async function chercherImages(requete: string, max = 8): Promise<string[]> {
  try {
    const ddg = await plusieursParDuckDuckGo(requete, max)
    if (ddg.length > 0) return ddg
  } catch {
    // on passe à Bing
  }
  try {
    const q = encodeURIComponent(requete)
    const page = await fetch(`https://www.bing.com/images/search?q=${q}&count=${max * 2}&setlang=fr`, {
      headers: { 'user-agent': UA, 'accept-language': 'fr-FR' },
    })
    return plusieursParBingHtml(await page.text(), max)
  } catch {
    return []
  }
}

/** La première image trouvée pour un libellé de produit, ou null. */
export async function chercherImage(requete: string): Promise<string | null> {
  try {
    const ddg = await parDuckDuckGo(requete)
    if (ddg) return ddg
  } catch {
    // on passe à Bing
  }
  try {
    return await parBing(requete)
  } catch {
    return null
  }
}
