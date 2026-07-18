import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { lireAvecRepli } from '@/lib/lecture'
import { addDays, dateIsoJour, maintenantLocal } from '@/lib/dates'
import type { LigneArticle, LigneRecette, LigneRepas } from '@/lib/basedonnees.types'
import { devinerRayon } from '@/fonctionnalites/courses/rayons'
import { notifierLesAutres } from '@/lib/notifications'

export function utiliserRecettes() {
  return useQuery({
    queryKey: ['recettes'],
    queryFn: () =>
      lireAvecRepli<LigneRecette>('recettes', async () => {
        const { data, error } = await supabase.from('recettes').select('*').order('titre')
        if (error) throw error
        return data
      }),
  })
}

/** Les repas de la semaine à venir (aujourd'hui + 6 jours). */
export function utiliserSemaineRepas() {
  const debut = dateIsoJour(maintenantLocal())
  const fin = dateIsoJour(addDays(maintenantLocal(), 6))
  return useQuery({
    queryKey: ['repas', debut],
    queryFn: async () => {
      const lignes = await lireAvecRepli<LigneRepas>('repas', async () => {
        const { data, error } = await supabase
          .from('repas')
          .select('*')
          .gte('date', debut)
          .lte('date', fin)
        if (error) throw error
        return data
      })
      return lignes.filter((r) => r.date >= debut && r.date <= fin)
    },
  })
}

export async function planifierRepas(
  foyerId: string,
  existant: LigneRepas | undefined,
  date: string,
  creneau: LigneRepas['creneau'],
  choix: { recette_id: string | null; notes: string | null },
) {
  if (existant) {
    await muter({ table: 'repas', type: 'update', cible_id: existant.id, charge: choix })
    return
  }
  const id = crypto.randomUUID()
  await muter({
    table: 'repas',
    type: 'insert',
    cible_id: id,
    charge: { id, foyer_id: foyerId, date, creneau, ...choix },
  })
  if (choix.notes) {
    const quand = new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    const creneaux: Record<string, string> = { matin: 'matin', midi: 'midi', gouter: 'goûter', soir: 'soir' }
    notifierLesAutres('🍽️ Menu posé', `${quand} ${creneaux[creneau] ?? creneau} : ${choix.notes}.`, '/maison')
  }
}

export async function retirerRepas(id: string) {
  await muter({ table: 'repas', type: 'delete', cible_id: id, charge: {} })
}

export async function creerRecette(foyerId: string, titre: string, lignesIngredients: string[]) {
  const id = crypto.randomUUID()
  const ingredients = lignesIngredients
    .map((l) => l.trim())
    .filter(Boolean)
    .map((libelle) => ({ libelle, quantite: null, rayon: devinerRayon(libelle) }))
  await muter({
    table: 'recettes',
    type: 'insert',
    cible_id: id,
    charge: { id, foyer_id: foyerId, titre, portions: 3, ingredients, etapes: null, tags: [], image_url: null },
  })
  return id
}

/**
 * Le vrai gain quotidien : on ne fait pas la liste, on fait les menus.
 * Ajoute aux courses tous les ingrédients de la semaine qui n'y sont pas déjà.
 */
export async function genererCoursesDepuisMenus(
  repas: LigneRepas[],
  recettes: LigneRecette[],
  articlesExistants: LigneArticle[],
  listeId: string,
  membreId: string,
): Promise<number> {
  const dejaLa = new Set(
    articlesExistants.filter((a) => !a.coche).map((a) => a.libelle.trim().toLowerCase()),
  )
  let ajoutes = 0
  for (const r of repas) {
    const recette = recettes.find((rec) => rec.id === r.recette_id)
    if (!recette) continue
    for (const ingredient of recette.ingredients) {
      const cle = ingredient.libelle.trim().toLowerCase()
      if (dejaLa.has(cle)) continue
      dejaLa.add(cle)
      const id = crypto.randomUUID()
      await muter({
        table: 'articles',
        type: 'insert',
        cible_id: id,
        charge: {
          id, liste_id: listeId, libelle: ingredient.libelle, rayon: ingredient.rayon,
          coche: false, position: Date.now() % 1000000, ajoute_par: membreId,
          quantite: null, unite: null,
        },
      })
      ajoutes += 1
    }
  }
  return ajoutes
}
