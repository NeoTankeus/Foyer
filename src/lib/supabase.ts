import { createClient } from '@supabase/supabase-js'
import type { Database } from './basedonnees.types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const cleAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !cleAnon) {
  // Sans configuration, l'app ne peut rien faire — mais un écran BLANC muet
  // serait le pire des messages. On explique, en français, dans la page.
  const message =
    'Configuration manquante : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définies (Vercel → Settings → Environment Variables), puis il faut redéployer.'
  try {
    const racine = document.getElementById('racine') ?? document.body
    racine.innerHTML = `<div style="min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px;text-align:center;font-family:-apple-system,system-ui,sans-serif;background:#FCFCFA;color:#2C2C2E">
      <div style="font-size:56px">🔌</div>
      <h1 style="font-size:20px;margin:0">STG n’est pas encore branché</h1>
      <p style="font-size:15px;color:#6B6B70;max-width:34ch;line-height:1.4">${message}</p>
    </div>`
    document.getElementById('coucou-gastif')?.remove()
  } catch {
    // même le DOM est indisponible : l'exception ci-dessous reste le filet
  }
  throw new Error(message)
}

export const supabase = createClient<Database>(url, cleAnon, {
  auth: { persistSession: true, autoRefreshToken: true },
})
