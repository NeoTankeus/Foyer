// 🍽 Les bonnes adresses d'un endroit, par STG.
//
// On demande à l'IA ce qu'un habitant passionné de bonne bouffe recommanderait
// à un ami de passage : des maisons, des tables, des producteurs, des rituels
// — surtout PAS la liste des attractions touristiques.
//
// L'app ne stocke aucun horaire ni numéro : chaque fiche renvoie vers les avis
// Google, où l'information est à jour. On demande donc à l'IA le NOM, la
// COMMUNE et l'ARGUMENT, pas des coordonnées qu'elle inventerait.

export const config = { runtime: 'edge' }

import { demanderIa } from './_gemini.js'

const CATEGORIES_CONNUES = [
  'table', 'bistrot', 'sucre', 'marche', 'producteur', 'bar', 'spot', 'nature', 'culture', 'boutique',
]
const CATEGORIES = CATEGORIES_CONNUES.join(', ')

const consigne = (lieu: string, envie: string) => `Tu es un habitant du coin, passionné de gastronomie et de vraies bonnes adresses, qui conseille un ami de passage.

LIEU : ${lieu}
${envie ? `ENVIE PARTICULIÈRE : ${envie}` : ''}

Donne 12 à 16 adresses ou expériences à ne surtout pas louper. Règles ABSOLUES :
- PAS de pièges à touristes, pas de chaînes, pas de « monument à visiter » banal.
- Des maisons que les gens du coin citent vraiment : tables, bistrots, producteurs, marchés, pâtissiers, bars, spots, rituels locaux.
- Mélange les budgets : des adresses à 12 € comme des tables à 120 €.
- Inclus 2 ou 3 EXPÉRIENCES (un rituel, un moment, un marché un jour précis) et pas seulement des restaurants.
- Si tu n'es pas certain qu'une adresse existe encore, ne la mets pas.
- N'invente JAMAIS de numéro de téléphone, d'adresse postale ni de site : on ne te les demande pas.

Réponds UNIQUEMENT en JSON, sans texte autour :
{
  "resume": string,        // 2 phrases : l'esprit du coin, et LA règle locale à connaître (heures, réservation, habitudes)
  "adresses": [
    {
      "nom": string,       // le nom exact de la maison
      "commune": string,   // la commune précise
      "categorie": string, // exactement l'un de : ${CATEGORIES}
      "quoi": string,      // ce que c'est, une ligne
      "pourquoi": string,  // 2 phrases : POURQUOI il ne faut pas la louper, ce qu'on y ressent, quoi y prendre
      "prix": string,      // "€", "€€", "€€€" ou "€€€€"
      "conseil": string    // un conseil pratique concret (jour, heure, réserver, quoi commander)
    }
  ]
}
Français simple et gourmand, jamais de superlatifs creux. Sois précis : un plat, une heure, un détail qui prouve que tu connais.`

const repondre = (corps: unknown, status = 200): Response =>
  new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

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
    if (req.method !== 'POST') return repondre({ erreur: 'methode', message: 'POST uniquement' }, 405)

    const cleGemini = process.env.GEMINI_API_KEY
    const urlSupabase = process.env.VITE_SUPABASE_URL
    const cleAnon = process.env.VITE_SUPABASE_ANON_KEY
    const jeton = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!cleGemini) return repondre({ erreur: 'cle_absente', message: 'GEMINI_API_KEY absente de Vercel.' }, 503)
    if (!urlSupabase || !cleAnon || !jeton) return repondre({ erreur: 'non_connecte' }, 401)
    const verification = await fetch(`${urlSupabase}/auth/v1/user`, {
      headers: { apikey: cleAnon, authorization: `Bearer ${jeton}` },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null)
    if (!verification?.ok) return repondre({ erreur: 'non_connecte' }, 401)

    const corps = await lireCorps(req)
    const lieu = String(corps?.['lieu'] ?? '').trim().slice(0, 120)
    const envie = String(corps?.['envie'] ?? '').trim().slice(0, 200)
    if (!lieu) return repondre({ erreur: 'vide', message: 'Quel endroit ?' }, 400)

    // Un SEUL point d'entrée pour toutes les IA de l'app : il lit ce que
    // Google répond vraiment (quota de la minute ? du jour ?) au lieu de
    // relancer douze fois pour rien.
    const { texte: brut, echec } = await demanderIa(cleGemini, {
      parts: [{ text: consigne(lieu, envie) }],
      json: true,
      temperature: 0.6,
      maxOutputTokens: 4096,
      qualite: 'haute',
    })
    if (!brut) {
      return repondre(
        {
          erreur: echec?.genre ?? 'analyse',
          message: echec?.message ?? 'L’IA n’a pas pu répondre.',
          // Le téléphone s'en sert pour réessayer TOUT SEUL.
          ...(echec?.secondes ? { secondes: echec.secondes } : {}),
        },
        echec?.status ?? 502,
      )
    }
    try {
      const propose = JSON.parse(brut) as { resume?: unknown; adresses?: unknown }
      const liste = Array.isArray(propose.adresses) ? propose.adresses : []
      // On ne fait jamais confiance à la forme : chaque champ est remis
      // d'équerre côté serveur, l'écran n'a plus qu'à afficher.
      const adresses = liste
        .map((a) => {
          const o = (a ?? {}) as Record<string, unknown>
          const nom = String(o['nom'] ?? '').trim()
          if (!nom) return null
          const categorie = String(o['categorie'] ?? 'table').trim().toLowerCase()
          return {
            nom: nom.slice(0, 90),
            commune: String(o['commune'] ?? lieu).trim().slice(0, 70),
            categorie: CATEGORIES_CONNUES.includes(categorie) ? categorie : 'table',
            quoi: String(o['quoi'] ?? '').trim().slice(0, 220),
            pourquoi: String(o['pourquoi'] ?? '').trim().slice(0, 500),
            prix: ['€', '€€', '€€€', '€€€€'].includes(String(o['prix'] ?? '')) ? String(o['prix']) : '',
            conseil: String(o['conseil'] ?? '').trim().slice(0, 220),
          }
        })
        .filter((a): a is NonNullable<typeof a> => a !== null)
        .slice(0, 20)
      if (adresses.length === 0) return repondre({ erreur: 'analyse', message: 'Aucune adresse proposée' }, 502)
      return repondre({ resume: String(propose.resume ?? '').slice(0, 400), adresses })
    } catch {
      return repondre({ erreur: 'analyse', message: 'Réponse illisible' }, 502)
    }
  } catch (erreur) {
    return repondre(
      { erreur: 'serveur', message: String(erreur instanceof Error ? erreur.message : erreur).slice(0, 160) },
      500,
    )
  }
}
