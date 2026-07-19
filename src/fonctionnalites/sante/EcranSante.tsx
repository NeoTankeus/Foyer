// 🩺 Le Carnet santé famille : vaccins, ordonnances photographiées, mesures
// (taille/poids), notes — par personne, avec rappels automatiques poussés
// par STG (« rappel vaccin dans 3 semaines »). Tout sous la main chez le
// médecin. Adultes uniquement.
import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { lireAvecRepli } from '@/lib/lecture'
import { utiliserSession } from '@/etat/session'
import { compresserImage } from '@/fonctionnalites/souvenirs/donnees'
import type { LigneSante } from '@/lib/basedonnees.types'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'
import { EtatVide } from '@/design/composants/EtatVide'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'

const TYPES: { cle: LigneSante['type']; libelle: string; icone: string }[] = [
  { cle: 'vaccin', libelle: 'Vaccin', icone: '💉' },
  { cle: 'ordonnance', libelle: 'Ordonnance', icone: '📄' },
  { cle: 'mesure', libelle: 'Taille / poids', icone: '📏' },
  { cle: 'note', libelle: 'Note', icone: '📝' },
]
const iconeType = (t: string) => TYPES.find((x) => x.cle === t)?.icone ?? '📝'

export function EcranSante() {
  const { membres, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const prenoms = membres.map((m) => m.prenom)
  const [personne, setPersonne] = useState(prenoms[0] ?? '')
  const [creation, setCreation] = useState(false)
  const [brouillon, setBrouillon] = useState({
    type: 'vaccin' as LigneSante['type'], libelle: '', date: '', rappel: '', notes: '',
  })
  const [photo, setPhoto] = useState<string | null>(null)
  const [agrandie, setAgrandie] = useState<string | null>(null)
  const fichierRef = useRef<HTMLInputElement>(null)

  const sante = useQuery({
    queryKey: ['sante'],
    queryFn: () =>
      lireAvecRepli<LigneSante>('sante', async () => {
        const { data, error } = await supabase.from('sante').select('*').order('date_soin', { ascending: false })
        if (error) throw error
        return data
      }),
  })

  const rafraichir = () => clientRequetes.invalidateQueries({ queryKey: ['sante'] })

  const enregistrer = async () => {
    if (!foyer || !brouillon.libelle.trim()) return
    const id = crypto.randomUUID()
    await muter({
      table: 'sante', type: 'insert', cible_id: id,
      charge: {
        id, foyer_id: foyer.id, personne,
        type: brouillon.type, libelle: brouillon.libelle.trim(),
        date_soin: brouillon.date || new Date().toISOString().slice(0, 10),
        rappel_le: brouillon.rappel || null,
        image_donnees: photo, notes: brouillon.notes.trim() || null,
        cree_le: new Date().toISOString(),
      },
    })
    setCreation(false)
    setBrouillon({ type: 'vaccin', libelle: '', date: '', rappel: '', notes: '' })
    setPhoto(null)
    await rafraichir()
  }

  const duMembre = (sante.data ?? []).filter((s) => s.personne === personne)
  const aujourdHui = new Date().toISOString().slice(0, 10)
  const rappelsAVenir = (sante.data ?? []).filter((s) => s.rappel_le && s.rappel_le >= aujourdHui)

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 flex items-start justify-between px-5 pb-2 pt-3">
        <div>
          <BarreRetour />
          <h1 className="text-titre-2 text-encre">🩺 Carnet santé</h1>
        </div>
        <Bouton variante="primaire" onClick={() => setCreation(true)}>+ Ajouter</Bouton>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <div className="flex gap-2">
          {prenoms.map((p) => (
            <button
              key={p}
              onClick={() => setPersonne(p)}
              aria-pressed={personne === p}
              className={`min-h-sur-tactile flex-1 rounded-full px-3 text-note font-[590]
                ${personne === p ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
            >
              {p}
            </button>
          ))}
        </div>

        {rappelsAVenir.length > 0 && (
          <Carte>
            <p className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">⏰ Rappels à venir</p>
            {rappelsAVenir.slice(0, 4).map((r) => (
              <p key={r.id} className="py-0.5 text-corps-2 text-encre">
                {new Date(`${r.rappel_le}T12:00:00`).toLocaleDateString('fr-FR')} — {r.personne} : {r.libelle}
              </p>
            ))}
            <p className="mt-1 text-legende text-encre-3">STG enverra une notification le jour même.</p>
          </Carte>
        )}

        {!sante.isLoading && duMembre.length === 0 && (
          <EtatVide
            titre={`Rien pour ${personne}`}
            message="Ajoute un vaccin avec sa date de rappel, photographie une ordonnance, note une taille — tout sera sous la main chez le médecin."
          />
        )}

        {duMembre.map((s) => (
          <Carte key={s.id}>
            <div className="flex items-start gap-3">
              <span className="text-[22px]" aria-hidden="true">{iconeType(s.type)}</span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-corps-2 font-[590] text-encre">{s.libelle}</p>
                <p className="text-legende text-encre-3">
                  {s.date_soin ? new Date(`${s.date_soin}T12:00:00`).toLocaleDateString('fr-FR') : ''}
                  {s.rappel_le ? ` · rappel le ${new Date(`${s.rappel_le}T12:00:00`).toLocaleDateString('fr-FR')}` : ''}
                </p>
                {s.notes && <p className="mt-1 text-corps-2 text-encre-2">{s.notes}</p>}
                {s.image_donnees && (
                  <button onClick={() => setAgrandie(s.image_donnees)} aria-label="Voir le document">
                    <img src={s.image_donnees} alt="" className="mt-2 h-20 rounded-lg object-cover" />
                  </button>
                )}
              </div>
              <button
                aria-label={`Supprimer ${s.libelle}`}
                onClick={() => {
                  if (confirm(`Supprimer « ${s.libelle} » ?`))
                    void muter({ table: 'sante', type: 'delete', cible_id: s.id, charge: {} }).then(rafraichir)
                }}
                className="min-h-sur-tactile text-encre-3"
              >
                ✕
              </button>
            </div>
          </Carte>
        ))}
      </div>

      <Feuille ouverte={agrandie !== null} onFermer={() => setAgrandie(null)} titre="Document">
        {agrandie && <img src={agrandie} alt="Document santé" className="w-full rounded-lg" />}
      </Feuille>

      <Feuille ouverte={creation} onFermer={() => setCreation(false)} titre={`Santé — ${personne}`}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <button
                key={t.cle}
                onClick={() => setBrouillon({ ...brouillon, type: t.cle })}
                aria-pressed={brouillon.type === t.cle}
                className={`min-h-sur-tactile rounded-full px-3 text-note font-[590]
                  ${brouillon.type === t.cle ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
              >
                {t.icone} {t.libelle}
              </button>
            ))}
          </div>
          <ChampTexte
            etiquette="Quoi"
            value={brouillon.libelle}
            onChange={(e) => setBrouillon({ ...brouillon, libelle: e.target.value })}
            placeholder={brouillon.type === 'mesure' ? '124 cm · 24 kg' : brouillon.type === 'vaccin' ? 'DTP — 3e dose' : 'Ordonnance Dr Martin'}
          />
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-legende text-encre-3">Date</span>
              <input
                type="date" value={brouillon.date}
                onChange={(e) => setBrouillon({ ...brouillon, date: e.target.value })}
                className="min-h-sur-tactile w-full rounded-md border border-trait bg-fond-eleve px-3 text-corps-2"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-legende text-encre-3">Rappel (optionnel)</span>
              <input
                type="date" value={brouillon.rappel}
                onChange={(e) => setBrouillon({ ...brouillon, rappel: e.target.value })}
                className="min-h-sur-tactile w-full rounded-md border border-trait bg-fond-eleve px-3 text-corps-2"
              />
            </label>
          </div>
          <ChampTexte
            etiquette="Notes (optionnel)"
            value={brouillon.notes}
            onChange={(e) => setBrouillon({ ...brouillon, notes: e.target.value })}
            placeholder="Posologie, médecin, pharmacie…"
          />
          <div className="flex items-center gap-2">
            <Bouton variante="discret" onClick={() => fichierRef.current?.click()}>
              {photo ? '✓ Photo jointe' : '📷 Photographier (ordonnance…)'}
            </Bouton>
            {photo && <button onClick={() => setPhoto(null)} className="text-legende text-encre-3 underline">retirer</button>}
          </div>
          <input
            ref={fichierRef} type="file" accept="image/*" capture="environment" hidden aria-hidden="true"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void compresserImage(f).then(setPhoto)
              e.target.value = ''
            }}
          />
          <Bouton pleineLargeur variante="valider" desactive={!brouillon.libelle.trim()} onClick={() => void enregistrer()}>
            Enregistrer
          </Bouton>
        </div>
      </Feuille>
    </div>
  )
}
