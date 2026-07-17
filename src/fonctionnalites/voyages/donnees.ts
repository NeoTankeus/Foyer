import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { lireAvecRepli } from '@/lib/lecture'
import type { LigneMembre, LigneReservation, LigneValise, LigneVoyage } from '@/lib/basedonnees.types'

export function utiliserVoyages() {
  return useQuery({
    queryKey: ['voyages'],
    queryFn: () =>
      lireAvecRepli<LigneVoyage>('voyages', async () => {
        const { data, error } = await supabase.from('voyages').select('*').order('debut')
        if (error) throw error
        return data
      }),
  })
}

export function utiliserValise(voyageId: string) {
  return useQuery({
    queryKey: ['valise', voyageId],
    queryFn: async () => {
      const lignes = await lireAvecRepli<LigneValise>('valise', async () => {
        const { data, error } = await supabase.from('valise').select('*').eq('voyage_id', voyageId).order('position')
        if (error) throw error
        return data
      })
      return lignes.filter((v) => v.voyage_id === voyageId).sort((a, b) => a.position - b.position)
    },
  })
}

export function utiliserReservations(voyageId: string) {
  return useQuery({
    queryKey: ['reservations', voyageId],
    queryFn: async () => {
      const lignes = await lireAvecRepli<LigneReservation>('reservations', async () => {
        const { data, error } = await supabase.from('reservations').select('*').eq('voyage_id', voyageId).order('debut_a')
        if (error) throw error
        return data
      })
      return lignes.filter((r) => r.voyage_id === voyageId)
    },
  })
}

/** Valise générée par personne : base commune + spécifique enfant. Le doudou est en position 1. */
function articlesValise(membre: LigneMembre, jours: number): { libelle: string; categorie: string }[] {
  const hauts = Math.min(Math.max(jours, 2), 10)
  const commun = [
    { libelle: 'Trousse de toilette', categorie: 'hygiène' },
    { libelle: `${hauts} hauts`, categorie: 'vêtements' },
    { libelle: `${Math.ceil(hauts / 2)} bas`, categorie: 'vêtements' },
    { libelle: `${hauts + 1} sous-vêtements`, categorie: 'vêtements' },
    { libelle: `${hauts + 1} paires de chaussettes`, categorie: 'vêtements' },
    { libelle: 'Pyjama', categorie: 'vêtements' },
    { libelle: 'Chargeur de téléphone', categorie: 'tech' },
    { libelle: 'Veste ou pull chaud', categorie: 'vêtements' },
  ]
  if (membre.role === 'child') {
    return [
      { libelle: 'Le doudou', categorie: 'précieux' }, // position 1, non négociable
      ...commun,
      { libelle: 'Carnet de santé', categorie: 'papiers' },
      { libelle: 'Jeux pour le trajet', categorie: 'précieux' },
      { libelle: 'Gourde', categorie: 'divers' },
    ]
  }
  return [
    ...commun,
    { libelle: 'Papiers d’identité de tous', categorie: 'papiers' },
    { libelle: 'Trousse à pharmacie', categorie: 'hygiène' },
    { libelle: 'Chargeurs + multiprise', categorie: 'tech' },
  ]
}

const CHECKLIST_MAISON = [
  'Fermer les volets',
  'Vider le frigo des produits frais',
  'Sortir les poubelles',
  'Arroser les plantes / prévoir quelqu’un',
  'Faire suivre ou garder le courrier',
  'Vérifier portes et fenêtres',
]

export async function creerVoyage(
  foyerId: string,
  membres: LigneMembre[],
  brouillon: { titre: string; destination: string | null; debut: string | null; fin: string | null },
): Promise<string> {
  const id = crypto.randomUUID()
  await muter({
    table: 'voyages',
    type: 'insert',
    cible_id: id,
    charge: {
      id, foyer_id: foyerId, statut: 'prevu', lat: null, lng: null, couverture_url: null,
      checklist_maison: CHECKLIST_MAISON.map((libelle) => ({ libelle, coche: false })),
      ...brouillon,
    },
  })

  const jours =
    brouillon.debut && brouillon.fin
      ? Math.max(1, Math.round((new Date(brouillon.fin).getTime() - new Date(brouillon.debut).getTime()) / 86400000) + 1)
      : 4

  for (const membre of membres.filter((m) => m.role !== 'guest')) {
    const articles = articlesValise(membre, jours)
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i]
      if (!article) continue
      const vid = crypto.randomUUID()
      await muter({
        table: 'valise', type: 'insert', cible_id: vid,
        charge: {
          id: vid, voyage_id: id, membre_id: membre.id, libelle: article.libelle,
          categorie: article.categorie, position: i + 1, coche: false,
        },
      })
    }
  }
  return id
}

export interface MeteoJour {
  date: string
  tMin: number
  tMax: number
  pluieMm: number
}

/** Météo de la destination via Open-Meteo (gratuit, sans clé) — depuis le navigateur. */
export async function chargerMeteo(destination: string, debut: string, fin: string): Promise<MeteoJour[] | null> {
  try {
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=1&language=fr`,
    ).then((r) => r.json() as Promise<{ results?: { latitude: number; longitude: number }[] }>)
    const lieu = geo.results?.[0]
    if (!lieu) return null
    const meteo = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lieu.latitude}&longitude=${lieu.longitude}` +
        `&daily=temperature_2m_min,temperature_2m_max,precipitation_sum&timezone=Europe%2FParis` +
        `&start_date=${debut}&end_date=${fin}`,
    ).then((r) => r.json() as Promise<{
      daily?: { time: string[]; temperature_2m_min: number[]; temperature_2m_max: number[]; precipitation_sum: number[] }
    }>)
    const d = meteo.daily
    if (!d) return null
    return d.time.map((date, i) => ({
      date,
      tMin: d.temperature_2m_min[i] ?? 0,
      tMax: d.temperature_2m_max[i] ?? 0,
      pluieMm: d.precipitation_sum[i] ?? 0,
    }))
  } catch {
    return null // la prévision ne va pas plus loin que 16 jours, ou pas de réseau
  }
}
