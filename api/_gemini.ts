// 🧠 L'appel à l'IA, fait UNE fois pour toute l'application.
//
// Pourquoi ce fichier existe : chaque relais avait sa propre cascade « 4
// modèles × 3 vagues ». Résultat, UNE seule recherche déclenchait jusqu'à
// DOUZE appels à Google. Quand le quota gratuit du jour est atteint, ces
// douze appels ne servent à rien — pire, ils épuisent le quota des autres
// fonctionnalités et allongent l'attente de 8 secondes pour rien.
//
// Ici on lit ce que Google répond vraiment :
//   • quota par MINUTE dépassé  → on attend le délai indiqué, une fois ;
//   • quota du JOUR épuisé      → ce modèle est fini pour aujourd'hui, on
//     passe au suivant sans insister (leurs quotas sont indépendants) ;
//   • modèle inconnu / en panne → au suivant.
// Et on ne dépasse JAMAIS 6 appels réseau, quoi qu'il arrive.

// Les quotas gratuits de Google sont PAR MODÈLE et TRÈS différents : les
// modèles « lite » en ont plusieurs fois plus que les gros. Pour une lecture
// de ticket ou un tri de courrier, un lite fait exactement le même travail —
// on commence donc par eux, et on ne dérange les gros que si besoin.
const MODELES_LEGERS = ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash']
// Pour la conversation et les recommandations, la finesse compte : on prend
// les gros d'abord, les lite restant en secours.
const MODELES_FINS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-lite']

const APPELS_MAX = 8

/**
 * Les clés utilisables, dans l'ordre. Les quotas gratuits de Google sont
 * comptés PAR PROJET : ajouter une deuxième clé (créée dans un AUTRE projet,
 * gratuitement) DOUBLE la capacité de l'app, sans un centime.
 * Vercel → Settings → Environment Variables → GEMINI_API_KEY_2 (puis _3).
 */
function toutesLesCles(principale: string): string[] {
  const brutes = [principale, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY_3]
  const propres: string[] = []
  for (const c of brutes) {
    const cle = String(c ?? '').trim()
    if (cle && !propres.includes(cle)) propres.push(cle)
  }
  return propres
}

export interface EchecIa {
  /** quota_jour : revenir demain · quota_minute : patienter · panne : autre. */
  genre: 'quota_jour' | 'quota_minute' | 'panne'
  message: string
  /** Le code HTTP à renvoyer au téléphone. */
  status: number
  /** Combien de secondes attendre avant de retenter — le téléphone s'en sert
   *  pour réessayer TOUT SEUL, sans que personne ait à y penser. */
  secondes?: number
}

export interface ReponseIa {
  texte: string | null
  echec?: EchecIa
}

export interface OptionsIa {
  /** Les `parts` du message utilisateur (texte et/ou image). */
  parts: unknown[]
  /** Contenus complets, si le relais gère lui-même l'historique. */
  contents?: unknown[]
  systeme?: string
  temperature?: number
  maxOutputTokens?: number
  /** Exiger du JSON strict en retour. */
  json?: boolean
  /** Délai maximal d'un appel (ms). */
  delai?: number
  /** 'haute' pour la conversation et les recommandations (modèles fins). */
  qualite?: 'haute' | 'normale'
}

/** Le texte d'une réponse Gemini, sans jamais supposer la forme de l'objet. */
export function texteGemini(donnees: unknown): string | null {
  const parts = (donnees as { candidates?: { content?: { parts?: unknown } }[] } | null)?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return null
  const texte = parts
    .map((p) => (typeof (p as { text?: unknown })?.text === 'string' ? (p as { text: string }).text : ''))
    .join('')
  return texte.trim() ? texte : null
}

/** Ce que dit vraiment un refus de Google : quota du jour, ou de la minute ? */
function lireRefus(corps: string): { parJour: boolean; secondes: number } {
  let parJour = false
  let secondes = 0
  try {
    const d = JSON.parse(corps) as {
      error?: { message?: string; details?: { '@type'?: string; violations?: { quotaId?: string }[]; retryDelay?: string }[] }
    }
    for (const detail of d.error?.details ?? []) {
      for (const v of detail.violations ?? []) {
        if (/PerDay/i.test(String(v.quotaId ?? ''))) parJour = true
      }
      const delai = String(detail.retryDelay ?? '')
      const n = Number(delai.replace(/[^\d.]/g, ''))
      if (Number.isFinite(n) && n > 0) secondes = Math.max(secondes, n)
    }
    if (/per day|daily/i.test(String(d.error?.message ?? ''))) parJour = true
  } catch {
    // Corps illisible : on reste prudent, on traite comme un quota minute.
    if (/per day|daily/i.test(corps)) parJour = true
  }
  return { parJour, secondes }
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Demande une réponse à l'IA. Ne rend la main qu'avec un texte, ou avec un
 * échec EXPLIQUÉ — jamais avec un « ça n'a pas marché » sans raison.
 */
export async function demanderIa(cle: string, options: OptionsIa): Promise<ReponseIa> {
  const corpsBase = {
    ...(options.systeme ? { system_instruction: { parts: [{ text: options.systeme }] } } : {}),
    contents: options.contents ?? [{ role: 'user', parts: options.parts }],
    generationConfig: {
      maxOutputTokens: options.maxOutputTokens ?? 2048,
      temperature: options.temperature ?? 0.3,
      ...(options.json ? { responseMimeType: 'application/json' } : {}),
    },
  }

  const MODELES = options.qualite === 'haute' ? MODELES_FINS : MODELES_LEGERS
  const cles = toutesLesCles(cle)

  let appels = 0
  const epuisesDuJour = new Set<string>()
  let attenteConseillee = 0
  let dernierePanne = ''

  /** Un essai, sur un modèle. Rend le texte, ou dit pourquoi ça n'a pas marché. */
  const essayer = async (
    modele: string,
    cleUtilisee: string,
  ): Promise<{ texte?: string; refus?: 'jour' | 'minute' | 'autre' }> => {
    appels += 1
    const reponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${cleUtilisee}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(options.delai ?? 25000),
        body: JSON.stringify(corpsBase),
      },
    ).catch((e: unknown) => {
      dernierePanne = String(e instanceof Error ? e.message : e).slice(0, 60)
      return null
    })
    if (!reponse) return { refus: 'autre' }

    if (reponse.ok) {
      const texte = texteGemini(await reponse.json().catch(() => null))
      if (texte) return { texte }
      dernierePanne = 'réponse vide'
      return { refus: 'autre' }
    }
    if (reponse.status === 429) {
      const { parJour, secondes } = lireRefus(await reponse.text().catch(() => ''))
      attenteConseillee = Math.max(attenteConseillee, secondes)
      if (parJour) {
        // Épuisé pour CE modèle et CETTE clé seulement — les autres couples
        // gardent leur propre quota.
        epuisesDuJour.add(`${modele}|${cleUtilisee}`)
        return { refus: 'jour' }
      }
      return { refus: 'minute' }
    }
    if (reponse.status !== 404 && reponse.status !== 503) dernierePanne = `Gemini ${reponse.status}`
    return { refus: 'autre' }
  }

  // 1ᵉʳ TOUR : chaque modèle essayé UNE fois, sans jamais attendre. Les quotas
  // étant indépendants, il suffit qu'un seul soit libre — et c'est le cas la
  // plupart du temps. (Avant, on s'acharnait sur le premier modèle en dormant
  // 8 secondes, et on n'atteignait jamais les autres : d'où les « quota
  // atteint » à répétition alors qu'il restait de la marge ailleurs.)
  const couples: { modele: string; cle: string }[] = []
  for (const modele of MODELES) for (const c of cles) couples.push({ modele, cle: c })

  for (const { modele, cle: c } of couples) {
    if (appels >= APPELS_MAX) break
    const r = await essayer(modele, c)
    if (r.texte) return { texte: r.texte }
  }

  // 2ᵉ TOUR, seulement si des modèles ont dit « trop vite » : on patiente le
  // délai demandé (court, borné) et on retente ceux qui ne sont pas épuisés.
  const restants = couples.filter((x) => !epuisesDuJour.has(`${x.modele}|${x.cle}`))
  if (restants.length > 0 && appels < APPELS_MAX) {
    await attendre(Math.min(Math.max(attenteConseillee, 2) * 1000, 6000))
    for (const { modele, cle: c } of restants) {
      if (appels >= APPELS_MAX) break
      const r = await essayer(modele, c)
      if (r.texte) return { texte: r.texte }
    }
  }

  const modelesEpuises = epuisesDuJour.size
  if (modelesEpuises >= couples.length) {
    return {
      texte: null,
      echec: {
        genre: 'quota_jour',
        message:
          'Le quota gratuit de l’IA est atteint pour aujourd’hui. Tout le reste de l’app fonctionne normalement, ' +
          'et l’IA repart d’elle-même demain matin.' +
          (cles.length < 2
            ? ' Pour ne plus jamais y arriver : ajoute une 2ᵉ clé gratuite (GEMINI_API_KEY_2 dans Vercel), ' +
              'créée dans un AUTRE projet Google — ça double la capacité, sans un centime.'
            : ''),
        status: 429,
      },
    }
  }
  if (attenteConseillee > 0 || modelesEpuises > 0) {
    const secondes = Math.min(Math.max(Math.round(attenteConseillee) || 20, 10), 60)
    return {
      texte: null,
      echec: {
        genre: 'quota_minute',
        message: `L’IA est très demandée à l’instant — nouvelle tentative dans ${secondes} secondes.`,
        status: 429,
        secondes,
      },
    }
  }
  return {
    texte: null,
    echec: {
      genre: 'panne',
      message: `L’IA n’a pas pu répondre${dernierePanne ? ` (${dernierePanne})` : ''}.`,
      status: 502,
    },
  }
}
