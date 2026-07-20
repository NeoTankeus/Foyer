// 🚆 Les prochains trains : cherche ta gare, vois les départs EN TEMPS RÉEL
// (retards compris) — données SNCF via Navitia. La gare est mémorisée.
import { useEffect, useState } from 'react'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'
import { EtatVide } from '@/design/composants/EtatVide'

const CLE_GARE = 'stg-gare'

interface Gare { id: string; nom: string }
interface Depart { direction: string; type: string; numero: string; heure: string | null; retard: string | null }

export function EcranTrains() {
  const [gare, setGare] = useState<Gare | null>(() => {
    try { return JSON.parse(localStorage.getItem(CLE_GARE) ?? 'null') as Gare | null } catch { return null }
  })
  const [q, setQ] = useState('')
  const [suggestions, setSuggestions] = useState<Gare[]>([])
  const [departs, setDeparts] = useState<Depart[] | null>(null)
  const [etat, setEtat] = useState<'repos' | 'cherche' | 'departs' | 'sans-cle' | 'erreur'>('repos')

  const chercherGares = async () => {
    if (!q.trim()) return
    setEtat('cherche')
    try {
      const r = await fetch(`/api/trains?mode=gares&q=${encodeURIComponent(q.trim())}`)
      const d = (await r.json()) as { gares?: Gare[]; erreur?: string }
      if (d.erreur === 'cle_absente') {
        setEtat('sans-cle')
        return
      }
      setSuggestions(d.gares ?? [])
      setEtat('repos')
    } catch {
      setEtat('erreur')
    }
  }

  const chargerDeparts = async (choisie: Gare) => {
    setGare(choisie)
    localStorage.setItem(CLE_GARE, JSON.stringify(choisie))
    setSuggestions([])
    setQ('')
    setEtat('departs')
    setDeparts(null)
    try {
      const r = await fetch(`/api/trains?mode=departs&gare=${encodeURIComponent(choisie.id)}`)
      const d = (await r.json()) as { departs?: Depart[]; erreur?: string }
      if (d.erreur === 'cle_absente') {
        setEtat('sans-cle')
        return
      }
      setDeparts(d.departs ?? [])
      setEtat('repos')
    } catch {
      setEtat('erreur')
    }
  }

  useEffect(() => {
    if (gare) void chargerDeparts(gare)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🚆 Les prochains trains</h1>
        <p className="text-legende text-encre-3">Temps réel SNCF, retards compris.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        {etat === 'sans-cle' ? (
          <Carte>
            <p className="text-corps-2 font-[590] text-encre">🔑 Une clé gratuite est nécessaire (2 minutes, une fois)</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-corps-2 text-encre-2">
              <li>Crée un compte gratuit sur <strong>navitia.io</strong> — la clé s'affiche aussitôt.</li>
              <li>Dans <strong>Vercel → ton projet → Settings → Environment Variables</strong>, ajoute <strong>NAVITIA_KEY</strong> avec cette clé.</li>
              <li>« Redeploy », et cet écran s'allume pour toujours.</li>
            </ol>
          </Carte>
        ) : (
          <>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void chercherGares()
              }}
            >
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={gare ? `Changer de gare (actuelle : ${gare.nom})` : 'Ta gare (ex. Lyon Part-Dieu)…'}
                aria-label="Chercher une gare"
                className="min-h-sur-tactile w-full min-w-0 flex-1 rounded-full border border-trait bg-fond-eleve px-4 text-corps-2"
              />
              <Bouton type="submit" variante="valider" desactive={!q.trim() || etat === 'cherche'}>
                {etat === 'cherche' ? '…' : '🔍'}
              </Bouton>
            </form>

            {suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => void chargerDeparts(s)}
                className="rounded-xl bg-fond-eleve p-3 text-left text-corps-2 font-[590] text-encre shadow-carte active:bg-fond-sourd"
              >
                🚉 {s.nom}
              </button>
            ))}

            {etat === 'erreur' && <p className="text-corps-2 text-urgent">Le serveur des trains ne répond pas — réessaie.</p>}
            {etat === 'departs' && <p className="py-6 text-center text-corps-2 text-encre-3">🚆 Tableau des départs…</p>}

            {gare && departs !== null && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-corps font-[590] text-encre">🚉 {gare.nom}</p>
                  <Bouton variante="discret" onClick={() => void chargerDeparts(gare)}>🔄</Bouton>
                </div>
                {departs.length === 0 && <p className="text-corps-2 text-encre-3">Aucun départ annoncé pour le moment.</p>}
                {departs.map((d, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl bg-fond-eleve p-3 shadow-carte">
                    <div className="w-16 shrink-0 text-center">
                      <p className={`chiffres text-corps font-[700] ${d.retard ? 'text-urgent' : 'text-encre'}`}>{d.heure ?? '—'}</p>
                      {d.retard && <p className="chiffres text-legende text-encre-3 line-through">{d.retard}</p>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-corps-2 font-[590] leading-snug text-encre">→ {d.direction}</p>
                      <p className="text-legende text-encre-3">{[d.type, d.numero].filter(Boolean).join(' ')}{d.retard ? ' · ⚠️ retardé' : ''}</p>
                    </div>
                  </div>
                ))}
              </>
            )}

            {!gare && suggestions.length === 0 && etat === 'repos' && (
              <EtatVide titre="Quelle gare ?" message="Cherche ta gare une fois — elle restera en mémoire et les départs s'afficheront direct." />
            )}
          </>
        )}
      </div>
    </div>
  )
}
