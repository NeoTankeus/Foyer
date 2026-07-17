import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { lireAvecRepli } from '@/lib/lecture'
import type { LigneSouvenir } from '@/lib/basedonnees.types'

/** Recompresse une photo côté client : max 1600 px, JPEG ~72 % (~250 Ko). */
export async function compresserImage(fichier: File): Promise<string> {
  const bitmap = await createImageBitmap(fichier)
  const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * ratio)
  canvas.height = Math.round(bitmap.height * ratio)
  const contexte = canvas.getContext('2d')
  if (!contexte) throw new Error('Canvas indisponible')
  contexte.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.72)
}

/** Position actuelle (facultative, 4 s max) pour géolocaliser le souvenir. */
export function positionActuelle(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resoudre) => {
    if (!('geolocation' in navigator)) return resoudre(null)
    const minuteur = setTimeout(() => resoudre(null), 4000)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(minuteur)
        resoudre({ lat: p.coords.latitude, lng: p.coords.longitude })
      },
      () => {
        clearTimeout(minuteur)
        resoudre(null)
      },
      { maximumAge: 300000, timeout: 3500 },
    )
  })
}

export function utiliserSouvenirs() {
  return useQuery({
    queryKey: ['souvenirs'],
    queryFn: () =>
      lireAvecRepli<LigneSouvenir>('souvenirs', async () => {
        const { data, error } = await supabase
          .from('souvenirs')
          .select('*')
          .order('pris_le', { ascending: false })
        if (error) throw error
        return data
      }),
    retry: false,
  })
}

export async function ajouterSouvenir(
  foyerId: string,
  auteurId: string,
  imageDonnees: string,
  options: {
    voyage_id: string | null
    lieu: string | null
    lat: number | null
    lng: number | null
    dossier: string | null
  },
) {
  const id = crypto.randomUUID()
  await muter({
    table: 'souvenirs',
    type: 'insert',
    cible_id: id,
    charge: {
      id, foyer_id: foyerId, auteur_id: auteurId, titre: null, commentaire: null,
      pris_le: new Date().toISOString(), image_donnees: imageDonnees, favori: false,
      ...options,
    },
  })
}
