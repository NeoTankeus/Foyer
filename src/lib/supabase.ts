import { createClient } from '@supabase/supabase-js'
import type { Database } from './basedonnees.types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const cleAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !cleAnon) {
  throw new Error(
    'VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY manquent — copie .env.example en .env.local.',
  )
}

export const supabase = createClient<Database>(url, cleAnon, {
  auth: { persistSession: true, autoRefreshToken: true },
})
