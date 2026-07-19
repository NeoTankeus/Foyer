// Open Food Facts (et frères Products/Beauty) : la fiche d'un produit par
// son code-barres — nom, marque, photo, Nutri-Score, allergènes. Gratuit.

export interface FicheProduit {
  code: string
  nom: string | null
  marque: string | null
  quantite: string | null
  image: string | null
  nutriscore: string | null // a…e
  nova: number | null // 1…4 (4 = ultra-transformé)
  additifs: string[]
  niveaux: Record<string, string> // fat/salt/sugars/saturated-fat → low|moderate|high
  allergenes: string[]
}

export async function ficheParCodeBarres(code: string): Promise<FicheProduit | null> {
  const bases = [
    'https://world.openfoodfacts.org',
    'https://world.openproductsfacts.org',
    'https://world.openbeautyfacts.org',
  ]
  for (const base of bases) {
    try {
      const reponse = await fetch(
        `${base}/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,image_url,quantity,nutriscore_grade,allergens_tags,nova_group,additives_tags,nutrient_levels`,
      )
      if (!reponse.ok) continue
      const donnees = (await reponse.json()) as {
        status?: number
        product?: {
          product_name?: string
          brands?: string
          image_url?: string
          quantity?: string
          nutriscore_grade?: string
          allergens_tags?: string[]
          nova_group?: number
          additives_tags?: string[]
          nutrient_levels?: Record<string, string>
        }
      }
      if (donnees.status === 1 && donnees.product) {
        return {
          code,
          nom: donnees.product.product_name || null,
          marque: donnees.product.brands || null,
          quantite: donnees.product.quantity || null,
          image: donnees.product.image_url || null,
          nutriscore: donnees.product.nutriscore_grade || null,
          nova: donnees.product.nova_group ?? null,
          additifs: (donnees.product.additives_tags ?? []).map((a) => a.replace(/^[a-z]{2}:/, '').toUpperCase()),
          niveaux: donnees.product.nutrient_levels ?? {},
          allergenes: (donnees.product.allergens_tags ?? []).map((a) => a.replace(/^[a-z]{2}:/, '')),
        }
      }
    } catch {
      // base suivante
    }
  }
  return null
}

export const COULEURS_NUTRISCORE: Record<string, string> = {
  a: '#038141', b: '#85bb2f', c: '#fecb02', d: '#ee8100', e: '#e63e11',
}
