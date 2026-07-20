import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { baseLocale } from '@/lib/dexie'
import type { LigneFoyer, LigneMembre } from '@/lib/basedonnees.types'

interface EtatSession {
  pret: boolean
  session: Session | null
  /** Un jeton existe sur l'appareil : on peut afficher l'app SANS attendre le réseau. */
  sessionProbable: boolean
  membre: LigneMembre | null // le membre connecté
  membres: LigneMembre[] // tout le foyer, pour les couleurs et le Fil
  foyer: LigneFoyer | null
  demarrer: () => void
  deconnecter: () => Promise<void>
}

// ——— Démarrage INSTANTANÉ : le profil du foyer est gardé sur le téléphone.
// À l'ouverture, on affiche immédiatement avec ce cache, puis on rafraîchit
// en arrière-plan. Fini la page blanche le temps de l'aller-retour réseau.
const CLE_PROFIL = 'stg-profil'

interface ProfilCache {
  membre: LigneMembre | null
  membres: LigneMembre[]
  foyer: LigneFoyer | null
}

function lireProfil(): ProfilCache | null {
  try {
    return JSON.parse(localStorage.getItem(CLE_PROFIL) ?? 'null') as ProfilCache | null
  } catch {
    return null
  }
}

/** Un jeton Supabase est-il présent sur l'appareil ? (lecture synchrone) */
function jetonPresent(): boolean {
  try {
    return Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.includes('auth-token'))
  } catch {
    return false
  }
}

async function chargerFoyer(): Promise<ProfilCache> {
  try {
    // getSession lit le jeton LOCALEMENT — aucun aller-retour réseau ici.
    const { data } = await supabase.auth.getSession()
    const authId = data.session?.user.id
    if (!authId) return { membre: null, membres: [], foyer: null }

    // Les deux requêtes partent EN MÊME TEMPS.
    const [{ data: membres, error }, { data: foyers }] = await Promise.all([
      supabase.from('membres').select('*'),
      supabase.from('foyers').select('*').limit(1),
    ])
    if (error) throw error

    await baseLocale.membres.bulkPut(membres)
    const membre = membres.find((m) => m.auth_user_id === authId) ?? null
    const profil = { membre, membres, foyer: foyers?.[0] ?? null }
    // Mémorisé pour que la PROCHAINE ouverture soit instantanée.
    try {
      localStorage.setItem(CLE_PROFIL, JSON.stringify(profil))
    } catch {
      // stockage plein — tant pis pour le cache
    }
    return profil
  } catch {
    // Hors ligne : on repart du cache local.
    const enCache = lireProfil()
    if (enCache?.membre) return enCache
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

const profilInitial = lireProfil()
const demarrageInstantane = profilInitial?.membre != null && jetonPresent()

export const utiliserSession = create<EtatSession>((set) => ({
  // Si on connaît déjà le foyer ET qu'un jeton existe : l'app s'affiche
  // IMMÉDIATEMENT — le réseau ne fait que rafraîchir derrière.
  pret: demarrageInstantane,
  session: null,
  sessionProbable: demarrageInstantane,
  membre: demarrageInstantane ? (profilInitial?.membre ?? null) : null,
  membres: demarrageInstantane ? (profilInitial?.membres ?? []) : [],
  foyer: demarrageInstantane ? (profilInitial?.foyer ?? null) : null,

  demarrer: () => {
    supabase.auth.onAuthStateChange((_evenement, session) => {
      set({ session, sessionProbable: session !== null })
      if (session) {
        void chargerFoyer().then((resultat) => set({ ...resultat, pret: true }))
      } else {
        try {
          localStorage.removeItem(CLE_PROFIL)
        } catch {
          // rien à nettoyer
        }
        set({ membre: null, membres: [], foyer: null, pret: true })
      }
    })
  },

  deconnecter: async () => {
    try {
      localStorage.removeItem(CLE_PROFIL)
    } catch {
      // rien à nettoyer
    }
    await supabase.auth.signOut()
    await baseLocale.delete() // aucun reste local sur un appareil partagé
    window.location.reload()
  },
}))
