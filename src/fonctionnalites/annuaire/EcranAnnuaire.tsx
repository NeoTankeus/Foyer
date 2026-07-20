// 🏢 L'Annuaire des entreprises : n'importe quel commerce ou société de
// France (base officielle Sirene) — adresse du siège, activité, état.
import { useState } from 'react'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { EtatVide } from '@/design/composants/EtatVide'

interface Entreprise {
  nom: string
  adresse: string | null
  activite: string | null
  etat: string | null
  creation: string | null
}

export function EcranAnnuaire() {
  const [q, setQ] = useState('')
  const [resultats, setResultats] = useState<Entreprise[] | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const chercher = async () => {
    if (!q.trim()) return
    setEnCours(true)
    setErreur(null)
    try {
      const r = await fetch(
        `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q.trim())}&page=1&per_page=8`,
      )
      if (!r.ok) throw new Error(`annuaire ${r.status}`)
      const donnees = (await r.json()) as {
        results?: {
          nom_complet?: string
          siege?: { adresse?: string }
          activite_principale?: string
          etat_administratif?: string
          date_creation?: string
        }[]
      }
      setResultats(
        (donnees.results ?? []).map((x) => ({
          nom: x.nom_complet ?? '?',
          adresse: x.siege?.adresse ?? null,
          activite: x.activite_principale ?? null,
          etat: x.etat_administratif ?? null,
          creation: x.date_creation ?? null,
        })),
      )
    } catch (e) {
      setErreur(String(e instanceof Error ? e.message : e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🏢 L'Annuaire officiel</h1>
        <p className="text-legende text-encre-3">Toute entreprise de France — base Sirene de l'État.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void chercher()
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nom du commerce, artisan, société…"
            aria-label="Chercher une entreprise"
            className="min-h-sur-tactile w-full min-w-0 flex-1 rounded-full border border-trait bg-fond-eleve px-4 text-corps-2"
          />
          <Bouton type="submit" variante="valider" desactive={!q.trim() || enCours}>
            {enCours ? '…' : '🔍'}
          </Bouton>
        </form>

        {erreur && <p className="text-corps-2 text-urgent">Recherche impossible ({erreur}) — réessaie.</p>}
        {resultats !== null && resultats.length === 0 && (
          <EtatVide titre="Aucun résultat" message="Essaie avec le nom exact, ou ajoute la ville." />
        )}
        {resultats === null && !enCours && (
          <EtatVide
            titre="Qui cherches-tu ?"
            message="Le plombier avant de l'appeler, la boîte du devis reçu, le garage du coin… tu vois tout de suite si l'entreprise existe vraiment et depuis quand."
          />
        )}

        {(resultats ?? []).map((e, i) => (
          <div key={i} className="rounded-xl bg-fond-eleve p-3 shadow-carte">
            <p className="break-words text-corps-2 font-[590] text-encre">
              {e.etat === 'A' ? '🟢' : '🔴'} {e.nom}
            </p>
            {e.adresse && <p className="break-words text-legende text-encre-3">📍 {e.adresse}</p>}
            <p className="text-legende text-encre-3">
              {e.etat === 'A' ? 'En activité' : 'Fermée / radiée'}
              {e.creation ? ` · créée en ${e.creation.slice(0, 4)}` : ''}
              {e.activite ? ` · APE ${e.activite}` : ''}
            </p>
            {e.adresse && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.nom} ${e.adresse}`)}`}
                target="_blank"
                rel="noopener"
                className="mt-1 inline-block text-legende text-ardoise underline"
              >
                🧭 Voir sur la carte
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
