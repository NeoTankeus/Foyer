// 🚸 Le mode École : tout ce qui concerne l'école de Gabriel au même endroit —
// les événements « école » de l'agenda (réunion, sortie, piscine…), une liste
// de fournitures cochable, et le rappel « demain c'est piscine, le sac ! ».
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utiliserSession } from '@/etat/session'
import { creerEvenement, utiliserEvenementsPeriode } from '@/lib/requetes'
import { versUtc } from '@/lib/dates'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { Coche } from '@/design/composants/Coche'

interface Fourniture { libelle: string; coche: boolean }

const MODELES = ['📚 Réunion parents-profs', '🏊 Piscine', '🚌 Sortie scolaire', '🎭 Spectacle de l’école', '📸 Photo de classe']
const MOTS_ECOLE = /écol|school|piscine|parents|scolaire|classe|cantine|maîtress|maitress|instit/i

export function EcranEcole() {
  const { membre, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const [fournitures, setFournitures] = useState<Fourniture[]>(() => {
    const brut = foyer?.reglages['ecole_fournitures']
    return Array.isArray(brut) ? (brut as Fourniture[]) : []
  })
  const [nouvelle, setNouvelle] = useState('')
  const [enEdition, setEnEdition] = useState<number | null>(null) // index de la fourniture en cours de renommage
  const [brouillon, setBrouillon] = useState('')
  const [titre, setTitre] = useState('')
  const [date, setDate] = useState('')
  const [heure, setHeure] = useState('')
  const [cree, setCree] = useState<string | null>(null)

  // Bornes figées au premier rendu — sinon la requête se relancerait en boucle.
  const [periode] = useState(() => {
    const debut = new Date()
    debut.setHours(0, 0, 0, 0)
    return { debut: debut.toISOString(), fin: new Date(debut.getTime() + 60 * 86400000).toISOString() }
  })
  const dans60j = utiliserEvenementsPeriode(periode.debut, periode.fin)
  const evenementsEcole = (dans60j.data ?? []).filter(
    (e) => e.categorie === 'ecole' || MOTS_ECOLE.test(e.titre),
  )

  const enregistrerFournitures = async (suivantes: Fourniture[]) => {
    if (!foyer) return
    setFournitures(suivantes)
    const { data: frais } = await supabase.from('foyers').select('reglages').eq('id', foyer.id).single()
    const base = (frais?.reglages ?? foyer.reglages) as Record<string, unknown>
    await supabase.from('foyers').update({ reglages: { ...base, ecole_fournitures: suivantes } }).eq('id', foyer.id)
  }

  const creerEvenementEcole = async (titreChoisi: string) => {
    if (!foyer || !membre || !date) return
    const debut = new Date(`${date}T${heure || '09:00'}:00`)
    await creerEvenement(foyer.id, membre.id, {
      titre: titreChoisi, debut_a: versUtc(debut), fin_a: versUtc(new Date(debut.getTime() + 3600_000)),
      lieu: 'École', participants: [], journee_entiere: !heure,
    })
    await clientRequetes.invalidateQueries({ queryKey: ['evenements'] })
    setTitre('')
    setDate('')
    setHeure('')
    setCree(`📅 « ${titreChoisi} » posé dans l'agenda ✓ (rappel dans le brief la veille et le matin)`)
    window.setTimeout(() => setCree(null), 3000)
  }

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🚸 L'École</h1>
        <p className="text-legende text-encre-3">Tout ce qui concerne l'école de Gabriel, au même endroit.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <Carte>
          <p className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">📅 À venir côté école</p>
          {evenementsEcole.length === 0 ? (
            <p className="text-corps-2 text-encre-3">Rien de posé — ajoute un événement ci-dessous.</p>
          ) : (
            evenementsEcole.slice(0, 8).map((e) => (
              <p key={e.id} className="py-1 text-corps-2 text-encre">
                • {e.titre}{' '}
                <span className="chiffres text-encre-3">
                  — {new Date(e.debut_a).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                  {e.journee_entiere ? '' : ` ${new Date(e.debut_a).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
                </span>
              </p>
            ))
          )}
        </Carte>

        <Carte>
          <p className="mb-2 text-note font-[590] uppercase tracking-wide text-encre-3">➕ Ajouter un événement école</p>
          <div className="mb-2 flex flex-wrap gap-2">
            {MODELES.map((m) => (
              <button
                key={m}
                onClick={() => setTitre(m)}
                aria-pressed={titre === m}
                className={`min-h-sur-tactile rounded-full px-3 text-note font-[590]
                  ${titre === m ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
              >
                {m}
              </button>
            ))}
          </div>
          <ChampTexte etiquette="Ou un autre titre" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Rendez-vous maîtresse…" />
          <div className="mt-2 flex gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-legende text-encre-3">Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="min-h-sur-tactile w-full rounded-md border border-trait bg-fond-eleve px-3 text-corps-2" />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-legende text-encre-3">Heure (optionnel)</span>
              <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)}
                className="min-h-sur-tactile w-full rounded-md border border-trait bg-fond-eleve px-3 text-corps-2" />
            </label>
          </div>
          <div className="mt-2">
            <Bouton pleineLargeur variante="valider" desactive={!titre.trim() || !date} onClick={() => void creerEvenementEcole(titre.trim())}>
              Poser dans l'agenda
            </Bouton>
          </div>
          {cree && <p className="mt-2 text-corps-2 text-fait">{cree}</p>}
        </Carte>

        <Carte>
          <p className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">🎒 Fournitures & affaires</p>
          {fournitures.map((f, i) => (
            <div key={`${f.libelle}-${i}`} className="flex items-center gap-1 py-0.5">
              <Coche
                cochee={f.coche}
                onBascule={() =>
                  void enregistrerFournitures(fournitures.map((x, j) => (j === i ? { ...x, coche: !x.coche } : x)))
                }
                etiquette={`Cocher ${f.libelle}`}
              />
              {enEdition === i ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const propre = brouillon.trim()
                    if (propre) void enregistrerFournitures(fournitures.map((x, j) => (j === i ? { ...x, libelle: propre } : x)))
                    setEnEdition(null)
                  }}
                >
                  <input
                    value={brouillon}
                    onChange={(e) => setBrouillon(e.target.value)}
                    aria-label={`Renommer ${f.libelle}`}
                    autoFocus
                    className="min-h-sur-tactile w-full min-w-0 flex-1 rounded-full border border-trait bg-fond-eleve px-4 text-corps-2"
                  />
                  <Bouton type="submit" variante="discret">OK</Bouton>
                </form>
              ) : (
                <button
                  aria-label={`Modifier ${f.libelle}`}
                  onClick={() => { setEnEdition(i); setBrouillon(f.libelle) }}
                  className={`min-h-sur-tactile flex-1 text-left text-corps-2 ${f.coche ? 'text-encre-3 line-through' : 'text-encre'}`}
                >
                  {f.libelle}
                </button>
              )}
              <button
                aria-label={`Retirer ${f.libelle}`}
                onClick={() => { setEnEdition(null); void enregistrerFournitures(fournitures.filter((_, j) => j !== i)) }}
                className="min-h-sur-tactile text-encre-3"
              >
                ✕
              </button>
            </div>
          ))}
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const propre = nouvelle.trim()
              if (!propre) return
              void enregistrerFournitures([...fournitures, { libelle: propre, coche: false }])
              setNouvelle('')
            }}
          >
            <input
              value={nouvelle}
              onChange={(e) => setNouvelle(e.target.value)}
              placeholder="Cahier 24x32, gourde, sac piscine…"
              aria-label="Ajouter une fourniture"
              className="min-h-sur-tactile w-full min-w-0 flex-1 rounded-full border border-trait bg-fond-eleve px-4 text-corps-2"
            />
            <Bouton type="submit" variante="discret">OK</Bouton>
          </form>
          <p className="mt-2 text-legende text-encre-3">
            La liste reste d'année en année : décoche tout à la rentrée et c'est reparti.
          </p>
        </Carte>
      </div>
    </div>
  )
}
