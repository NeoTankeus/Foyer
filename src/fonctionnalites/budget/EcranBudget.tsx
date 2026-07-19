// 💰 Le Trésorier : le budget du foyer sans saisie pénible — tu photographies
// le ticket de caisse, StiGa lit le montant et classe tout seul. Graphique du
// mois par catégorie, et alerte douce quand un poste s'emballe.
import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { utiliserSession } from '@/etat/session'
import { compresserImage } from '@/fonctionnalites/souvenirs/donnees'
import type { LigneDepense } from '@/lib/basedonnees.types'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'
import { EtatVide } from '@/design/composants/EtatVide'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'

const CATEGORIES: { cle: string; libelle: string; icone: string }[] = [
  { cle: 'courses', libelle: 'Courses', icone: '🛒' },
  { cle: 'restaurant', libelle: 'Restos', icone: '🍴' },
  { cle: 'transport', libelle: 'Transport', icone: '⛽' },
  { cle: 'maison', libelle: 'Maison', icone: '🏡' },
  { cle: 'activite', libelle: 'Loisirs', icone: '🎡' },
  { cle: 'sante', libelle: 'Santé', icone: '🩺' },
  { cle: 'autre', libelle: 'Autre', icone: '📦' },
]
const icone = (cle: string | null) => CATEGORIES.find((c) => c.cle === cle)?.icone ?? '📦'
const euros = (n: number) => `${n.toFixed(2).replace('.', ',')} €`

function moisIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function totauxParCategorie(lignes: LigneDepense[]): Record<string, number> {
  const totaux: Record<string, number> = {}
  for (const l of lignes) {
    const cle = l.categorie ?? 'autre'
    totaux[cle] = (totaux[cle] ?? 0) + Number(l.montant)
  }
  return totaux
}

export function EcranBudget() {
  const { foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const [mois, setMois] = useState(moisIso(new Date()))
  const [saisie, setSaisie] = useState(false)
  const [scanEnCours, setScanEnCours] = useState(false)
  const [brouillon, setBrouillon] = useState({ libelle: '', montant: '', categorie: 'courses', date: '' })
  const fichierRef = useRef<HTMLInputElement>(null)

  const depenses = useQuery({
    queryKey: ['budget', mois],
    queryFn: async () => {
      const [a, m] = mois.split('-').map(Number)
      const debutMois = `${mois}-01`
      const finMois = new Date(a ?? 2026, m ?? 1, 0).getDate()
      const precedent = moisIso(new Date(a ?? 2026, (m ?? 1) - 2, 1))
      const finPrecedent = new Date(a ?? 2026, (m ?? 1) - 1, 0).getDate()
      const [courant, avant] = await Promise.all([
        supabase.from('depenses').select('*').is('voyage_id', null).gte('date_depense', debutMois).lte('date_depense', `${mois}-${finMois}`).order('date_depense', { ascending: false }),
        supabase.from('depenses').select('*').is('voyage_id', null).gte('date_depense', `${precedent}-01`).lte('date_depense', `${precedent}-${finPrecedent}`),
      ])
      if (courant.error) throw courant.error
      return {
        lignes: (courant.data ?? []) as LigneDepense[],
        avant: (avant.data ?? []) as LigneDepense[],
      }
    },
  })

  const lignes = depenses.data?.lignes ?? []
  const totaux = totauxParCategorie(lignes)
  const totauxAvant = totauxParCategorie(depenses.data?.avant ?? [])
  const total = lignes.reduce((s, l) => s + Number(l.montant), 0)
  const maxCategorie = Math.max(1, ...Object.values(totaux))
  const emballement = Object.entries(totaux).find(
    ([cle, montant]) => montant > 50 && (totauxAvant[cle] ?? 0) > 0 && montant >= 2 * (totauxAvant[cle] ?? 0),
  )

  const enregistrer = async (imageDonnees?: string) => {
    if (!foyer || !brouillon.libelle.trim() || !Number(brouillon.montant.replace(',', '.'))) return
    const id = crypto.randomUUID()
    await muter({
      table: 'depenses', type: 'insert', cible_id: id,
      charge: {
        id, foyer_id: foyer.id, voyage_id: null,
        libelle: brouillon.libelle.trim(),
        montant: Number(brouillon.montant.replace(',', '.')),
        categorie: brouillon.categorie,
        date_depense: brouillon.date || new Date().toISOString().slice(0, 10),
        image_donnees: imageDonnees ?? null,
        cree_le: new Date().toISOString(),
      },
    })
    setSaisie(false)
    setBrouillon({ libelle: '', montant: '', categorie: 'courses', date: '' })
    await clientRequetes.invalidateQueries({ queryKey: ['budget'] })
  }

  const scannerTicket = async (fichier: File) => {
    setScanEnCours(true)
    try {
      const image = await compresserImage(fichier)
      const { data: session } = await supabase.auth.getSession()
      const reponse = await fetch('/api/analyser-ticket', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ image }),
      })
      const donnees = (await reponse.json()) as {
        ticket?: { commercant?: string | null; montant?: number | null; date?: string | null; categorie?: string | null }
      }
      const t = donnees.ticket
      setBrouillon({
        libelle: t?.commercant ?? 'Ticket',
        montant: t?.montant != null ? String(t.montant) : '',
        categorie: t?.categorie && CATEGORIES.some((c) => c.cle === t.categorie) ? t.categorie : 'autre',
        date: t?.date ?? '',
      })
      setSaisie(true)
    } finally {
      setScanEnCours(false)
    }
  }

  const decalerMois = (n: number) => {
    const [a, m] = mois.split('-').map(Number)
    setMois(moisIso(new Date(a ?? 2026, (m ?? 1) - 1 + n, 1)))
  }
  const libelleMois = new Date(`${mois}-15T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">💰 Le Trésorier</h1>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <div className="flex gap-2">
          <Bouton
            pleineLargeur
            variante="primaire"
            desactive={scanEnCours}
            onClick={() => fichierRef.current?.click()}
          >
            {scanEnCours ? 'StiGa lit le ticket…' : '📸 Scanner un ticket'}
          </Bouton>
          <Bouton pleineLargeur variante="discret" onClick={() => setSaisie(true)}>
            ✍️ À la main
          </Bouton>
          <input
            ref={fichierRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            aria-label="Photographier un ticket de caisse"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void scannerTicket(f)
              e.target.value = ''
            }}
          />
        </div>

        <div className="flex items-center justify-between">
          <button onClick={() => decalerMois(-1)} aria-label="Mois précédent" className="min-h-sur-tactile min-w-sur-tactile text-titre-3 text-encre-2">‹</button>
          <p className="text-corps font-[590] capitalize text-encre">{libelleMois} — {euros(total)}</p>
          <button onClick={() => decalerMois(1)} aria-label="Mois suivant" className="min-h-sur-tactile min-w-sur-tactile text-titre-3 text-encre-2">›</button>
        </div>

        {emballement && (
          <p className="rounded-lg bg-ambre/15 px-3 py-2 text-corps-2 text-encre-2">
            😄 Ce mois-ci, {CATEGORIES.find((c) => c.cle === emballement[0])?.libelle.toLowerCase() ?? emballement[0]} a au moins doublé
            par rapport au mois dernier ({euros(emballement[1])} contre {euros(totauxAvant[emballement[0]] ?? 0)}).
          </p>
        )}

        {Object.keys(totaux).length > 0 && (
          <Carte>
            {CATEGORIES.filter((c) => (totaux[c.cle] ?? 0) > 0).map((c) => (
              <div key={c.cle} className="flex items-center gap-2 py-1">
                <span className="w-7 text-[16px]" aria-hidden="true">{c.icone}</span>
                <div className="h-4 flex-1 overflow-hidden rounded-full bg-fond-sourd">
                  <div
                    className="h-full rounded-full bg-ardoise/70"
                    style={{ width: `${Math.max(4, ((totaux[c.cle] ?? 0) / maxCategorie) * 100)}%` }}
                  />
                </div>
                <span className="w-20 text-right text-legende text-encre-2">{euros(totaux[c.cle] ?? 0)}</span>
              </div>
            ))}
          </Carte>
        )}

        {!depenses.isLoading && lignes.length === 0 && (
          <EtatVide titre="Rien ce mois-ci" message="Scanne ton premier ticket — StiGa lit le montant, le commerçant et la date tout seul." />
        )}

        <ul className="flex flex-col gap-2">
          {lignes.map((l) => (
            <li key={l.id} className="flex items-center gap-3 rounded-xl bg-fond-eleve p-3 shadow-carte">
              <span className="text-[20px]" aria-hidden="true">{icone(l.categorie)}</span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-corps-2 font-[590] text-encre">{l.libelle}</p>
                <p className="text-legende text-encre-3">{l.date_depense ?? ''}</p>
              </div>
              <p className="text-corps-2 font-[590] text-encre">{euros(Number(l.montant))}</p>
              <button
                aria-label={`Supprimer ${l.libelle}`}
                onClick={() => {
                  void muter({ table: 'depenses', type: 'delete', cible_id: l.id, charge: {} }).then(() =>
                    clientRequetes.invalidateQueries({ queryKey: ['budget'] }),
                  )
                }}
                className="min-h-sur-tactile min-w-sur-tactile text-encre-3"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </div>

      <Feuille ouverte={saisie} onFermer={() => setSaisie(false)} titre="Dépense">
        <div className="flex flex-col gap-3">
          <ChampTexte etiquette="Quoi" value={brouillon.libelle} onChange={(e) => setBrouillon({ ...brouillon, libelle: e.target.value })} placeholder="Carrefour, plein d'essence…" />
          <ChampTexte etiquette="Montant (€)" value={brouillon.montant} onChange={(e) => setBrouillon({ ...brouillon, montant: e.target.value })} placeholder="42,50" inputMode="decimal" />
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.cle}
                onClick={() => setBrouillon({ ...brouillon, categorie: c.cle })}
                aria-pressed={brouillon.categorie === c.cle}
                className={`min-h-sur-tactile rounded-full px-3 text-note font-[590]
                  ${brouillon.categorie === c.cle ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
              >
                {c.icone} {c.libelle}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-legende text-encre-3">Date</span>
            <input
              type="date"
              value={brouillon.date}
              onChange={(e) => setBrouillon({ ...brouillon, date: e.target.value })}
              className="min-h-sur-tactile rounded-md border border-trait bg-fond-eleve px-3 text-corps"
            />
          </label>
          <Bouton pleineLargeur variante="valider" desactive={!brouillon.libelle.trim() || !brouillon.montant} onClick={() => void enregistrer()}>
            Enregistrer
          </Bouton>
        </div>
      </Feuille>
    </div>
  )
}
