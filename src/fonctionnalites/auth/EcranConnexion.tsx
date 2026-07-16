import { useState } from 'react'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { Bouton } from '@/design/composants/Bouton'
import { ChampTexte } from '@/design/composants/ChampTexte'

const schemaConnexion = z.object({
  email: z.string().email('Adresse email invalide'),
  motDePasse: z.string().min(6, 'Six caractères minimum'),
})

export function EcranConnexion() {
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const connecter = async () => {
    setErreur(null)
    const verification = schemaConnexion.safeParse({ email, motDePasse })
    if (!verification.success) {
      setErreur(verification.error.errors[0]?.message ?? 'Saisie invalide')
      return
    }
    setEnCours(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: verification.data.email,
      password: verification.data.motDePasse,
    })
    setEnCours(false)
    if (error) setErreur('Connexion impossible. Vérifie l’email et le mot de passe.')
  }

  return (
    <div className="safe-haut safe-bas flex min-h-dvh flex-col justify-center bg-fond px-6">
      <h1 className="text-titre text-encre">FOYER</h1>
      <p className="mb-8 mt-1 text-corps-2 text-encre-3">Le quotidien, en paix.</p>

      <form
        className="flex flex-col gap-4"
        onSubmit={(evenement) => {
          evenement.preventDefault()
          void connecter()
        }}
      >
        <ChampTexte
          etiquette="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <ChampTexte
          etiquette="Mot de passe"
          type="password"
          autoComplete="current-password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
        />
        {erreur && (
          <p role="alert" className="text-note text-urgent">
            {erreur}
          </p>
        )}
        <Bouton type="submit" pleineLargeur desactive={enCours}>
          {enCours ? 'Connexion…' : 'Entrer'}
        </Bouton>
      </form>

      <p className="mt-6 text-note text-encre-3">
        Les comptes du foyer sont créés une fois pour toutes : chaque membre a le sien.
      </p>
    </div>
  )
}
