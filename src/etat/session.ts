import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { baseLocale } from '@/lib/dexie'
import type { LigneFoyer, LigneMembre } from '@/lib/basedonnees.types'

interface EtatSession {
  pret: boolean
  session: Session | null
  membre: LigneMembre | null // le membre connecté
  membres: LigneMembre[] // tout le foyer, pour les couleurs et le Fil
  foyer: LigneFoyer | null
  demarrer: () => void
  deconnecter: () => Promise<void>
}

async function chargerFoyer(): Promise<{
  membre: LigneMembre | null
  membres: LigneMembre[]
  foyer: LigneFoyer | null
}> {
  try {
    const { data: utilisateur } = await supabase.auth.getUser()
    const authId = utilisateur.user?.id
    if (!authId) return { membre: null, membres: [], foyer: null }

    const { data: membres, error } = await supabase.from('membres').select('*')
    if (error) throw error
    const { data: foyers } = await supabase.from('foyers').select('*').limit(1)

    await baseLocale.membres.bulkPut(membres)
    const membre = membres.find((m) => m.auth_user_id === authId) ?? null
    return { membre, membres, foyer: foyers?.[0] ?? null }
  } catch {
    // Hors ligne : on repart du cache local.
    const membres = await baseLocale.membres.toArray()
    const { data } = await supabase.auth.getSession()
    const authId = data.session?.user.id
    return {
      membre: membres.find((m) => m.auth_user_id === authId) ?? null,
      membres,
      foyer: null,
    }
  }
}

export const utiliserSession = create<EtatSession>((set) => ({
  pret: false,
  session: null,
  membre: null,
  membres: [],
  foyer: null,

  demarrer: () => {
    supabase.auth.onAuthStateChange((_evenement, session) => {
      set({ session })
      if (session) {
        void chargerFoyer().then((resultat) => set({ ...resultat, pret: true }))
      } else {
        set({ membre: null, membres: [], foyer: null, pret: true })
      }
    })
  },

  deconnecter: async () => {
    await supabase.auth.signOut()
    await baseLocale.delete() // aucun reste local sur un appareil partagé
    window.location.reload()
  },
}))
