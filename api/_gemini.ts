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

/** Les modèles essayés dans l'ordre : qualité d'abord, quotas larges ensuite. */
const MODELES = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite']

const APPELS_MAX = 6

export interface EchecIa {
  /** quota_jour : revenir demain · quota_minute : patienter · panne : autre. */
  genre: 'quota_jour' | 'quota_minute' | 'panne'
  message: string
  /** Le code HTTP à renvoyer au téléphone. */
  status: number
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

  let appels = 0
  let modelesEpuises = 0
  let attenteConseillee = 0
  let dernierePanne = ''

  for (const modele of MODELES) {
    // Chaque modèle a droit à deux essais : le second seulement si Google a
    // demandé d'attendre (quota par minute), et si le budget le permet.
    for (let essai = 0; essai < 2; essai += 1) {
      if (appels >= APPELS_MAX) break
      appels += 1
      const reponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${cle}`,
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

      if (!reponse) break // réseau coupé : modèle suivant

      if (reponse.ok) {
        const texte = texteGemini(await reponse.json().catch(() => null))
        if (texte) return { texte }
        dernierePanne = 'réponse vide'
        break // ce modèle a répondu mais sans rien : au suivant
      }

      if (reponse.status === 429) {
        const { parJour, secondes } = lireRefus(await reponse.text().catch(() => ''))
        if (parJour) {
          modelesEpuises += 1
          break // ce modèle est fini pour la journée : au suivant, sans attendre
        }
        attenteConseillee = Math.max(attenteConseillee, secondes)
        // Quota par minute : on patiente le délai demandé (borné), une fois.
        if (essai === 0 && appels < APPELS_MAX) {
          await attendre(Math.min(Math.max(secondes, 2) * 1000, 8000))
          continue
        }
        break
      }

      if (reponse.status === 404 || reponse.status === 503) break // modèle absent ou saturé
      dernierePanne = `Gemini ${reponse.status}`
      break
    }
  }

  if (modelesEpuises >= MODELES.length) {
    return {
      texte: null,
      echec: {
        genre: 'quota_jour',
        message:
          'Le quota gratuit de l’IA est atteint pour aujourd’hui. Tout le reste de l’app fonctionne normalement, ' +
          'et l’IA repart d’elle-même demain matin.',
        status: 429,
      },
    }
  }
  if (attenteConseillee > 0 || modelesEpuises > 0) {
    const secondes = Math.max(30, Math.round(attenteConseillee))
    return {
      texte: null,
      echec: {
        genre: 'quota_minute',
        message: `L’IA est très demandée à l’instant — réessaie dans environ ${secondes} secondes.`,
        status: 429,
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
