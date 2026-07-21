// 🔌 Objets sous garantie : tu scannes le ticket d'achat (four, télé, vélo…),
// STG lit la date et l'enseigne, tu choisis la durée — et il te prévient
// AVANT la fin de garantie (J-30 et J-7) pour faire jouer le SAV à temps.
import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { utiliserSession } from '@/etat/session'
import { compresserImage } from '@/fonctionnalites/souvenirs/donnees'
import type { LigneDocument } from '@/lib/basedonnees.types'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { BoutonEnvoi } from '@/design/composants/BoutonEnvoi'
import { EtatVide } from '@/design/composants/EtatVide'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'

const DUREES = [
  { mois: 12, libelle: '1 an' },
  { mois: 24, libelle: '2 ans (légale)' },
  { mois: 36, libelle: '3 ans' },
  { mois: 60, libelle: '5 ans' },
]

function plusMois(dateIso: string, mois: number): string {
  const d = new Date(`${dateIso}T12:00:00`)
  d.setMonth(d.getMonth() + mois)
  return d.toISOString().slice(0, 10)
}

function moinsMois(dateIso: string, mois: number): string {
  const d = new Date(`${dateIso}T12:00:00`)
  d.setMonth(d.getMonth() - mois)
  return d.toISOString().slice(0, 10)
}

export function EcranGaranties() {
  const { foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const [enEdition, setEnEdition] = useState<LigneDocument | 'nouvelle' | null>(null)
  const [scanEnCours, setScanEnCours] = useState(false)
  const [brouillon, setBrouillon] = useState({ titre: '', achat: '', mois: 24 })
  const fichierRef = useRef<HTMLInputElement>(null)

  const garanties = useQuery({
    queryKey: ['garanties'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('type', 'garantie')
        .order('expire_le')
      if (error) throw error
      return (data ?? []) as LigneDocument[]
    },
  })

  const rafraichir = () => clientRequetes.invalidateQueries({ queryKey: ['garanties'] })

  // Ouvre la Feuille vierge (création) ou seedée depuis une ligne (édition).
  // La date d'achat n'est pas stockée : on la retrouve depuis l'expiration
  // avec la durée légale (2 ans) — ajustable dans le formulaire.
  const ouvrirCreation = () => {
    setBrouillon({ titre: '', achat: '', mois: 24 })
    setEnEdition('nouvelle')
  }
  const ouvrirEdition = (g: LigneDocument) => {
    setBrouillon({ titre: g.titre, achat: g.expire_le ? moinsMois(g.expire_le, 24) : '', mois: 24 })
    setEnEdition(g)
  }

  const enregistrer = async () => {
    if (!foyer || !brouillon.titre.trim() || !brouillon.achat || enEdition === null) return
    if (enEdition === 'nouvelle') {
      const id = crypto.randomUUID()
      await muter({
        table: 'documents', type: 'insert', cible_id: id,
        charge: {
          id, foyer_id: foyer.id, titre: brouillon.titre.trim(), type: 'garantie',
          membre_id: null, expire_le: plusMois(brouillon.achat, brouillon.mois),
          file_path: null, rappels: [30, 7], cree_le: new Date().toISOString(),
        },
      })
    } else {
      await muter({
        table: 'documents', type: 'update', cible_id: enEdition.id,
        charge: {
          titre: brouillon.titre.trim(),
          expire_le: plusMois(brouillon.achat, brouillon.mois),
          rappels: [30, 7],
        },
      })
    }
    setEnEdition(null)
    setBrouillon({ titre: '', achat: '', mois: 24 })
    await rafraichir()
  }

  const scannerTicket = async (fichier: File) => {
    setScanEnCours(true)
    try {
      const image = await compresserImage(fichier)
      const { data: session } = await supabase.auth.getSession()
      const reponse = await fetch('/api/analyser-ticket', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${session.session?.access_token ?? ''}` },
        body: JSON.stringify({ image }),
      })
      const donnees = (await reponse.json()) as { ticket?: { commercant?: string | null; date?: string | null } }
      setBrouillon({
        titre: donnees.ticket?.commercant ? `Achat ${donnees.ticket.commercant}` : '',
        achat: donnees.ticket?.date ?? new Date().toISOString().slice(0, 10),
        mois: 24,
      })
      setEnEdition('nouvelle')
    } finally {
      setScanEnCours(false)
    }
  }

  const joursRestants = (expireLe: string | null) =>
    expireLe === null ? null : Math.round((new Date(`${expireLe}T12:00:00`).getTime() - Date.now()) / 86400000)

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🔌 Garanties</h1>
        <p className="text-legende text-encre-3">STG prévient AVANT que ça expire.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <div className="flex gap-2">
          <BoutonEnvoi
            pleineLargeur variante="primaire" enCours={scanEnCours}
            onClick={() => fichierRef.current?.click()} enfantsPendant="STG lit le ticket…"
          >
            📸 Scanner le ticket d’achat
          </BoutonEnvoi>
          <Bouton pleineLargeur variante="discret" onClick={ouvrirCreation}>✍️ À la main</Bouton>
        </div>
        <input
          ref={fichierRef} type="file" accept="image/*" capture="environment" hidden aria-hidden="true"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void scannerTicket(f)
            e.target.value = ''
          }}
        />

        {!garanties.isLoading && (garanties.data ?? []).length === 0 && (
          <EtatVide
            titre="Aucune garantie suivie"
            message="Scanne le ticket du dernier gros achat (électroménager, télé, vélo…) — STG te préviendra 30 puis 7 jours avant la fin de garantie."
          />
        )}

        <ul className="flex flex-col gap-2">
          {(garanties.data ?? []).map((g) => {
            const jours = joursRestants(g.expire_le)
            const fini = jours !== null && jours < 0
            const bientot = jours !== null && jours >= 0 && jours <= 30
            return (
              <li key={g.id} className="flex items-center gap-3 rounded-xl bg-fond-eleve p-3 shadow-carte">
                <div className={`flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded-xl ${fini ? 'bg-fond-sourd' : bientot ? 'bg-urgent/15' : 'bg-sauge/15'}`}>
                  <p className={`chiffres text-corps-2 font-[700] ${fini ? 'text-encre-3' : bientot ? 'text-urgent' : 'text-fait'}`}>
                    {fini ? '—' : `J-${jours}`}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`break-words text-corps-2 font-[590] leading-snug ${fini ? 'text-encre-3 line-through' : 'text-encre'}`}>
                    {g.titre}
                  </p>
                  <p className="text-legende text-encre-3">
                    {fini ? 'garantie terminée' : `couvert jusqu'au ${g.expire_le ? new Date(`${g.expire_le}T12:00:00`).toLocaleDateString('fr-FR') : '?'}`}
                  </p>
                </div>
                <button
                  aria-label={`Modifier ${g.titre}`}
                  onClick={() => ouvrirEdition(g)}
                  className="min-h-sur-tactile min-w-sur-tactile text-encre-3"
                >
                  ✏️
                </button>
                <button
                  aria-label={`Supprimer ${g.titre}`}
                  onClick={() => {
                    if (confirm(`Ne plus suivre « ${g.titre} » ?`))
                      void muter({ table: 'documents', type: 'delete', cible_id: g.id, charge: {} }).then(rafraichir)
                  }}
                  className="min-h-sur-tactile min-w-sur-tactile text-encre-3"
                >
                  ✕
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <Feuille
        ouverte={enEdition !== null}
        onFermer={() => setEnEdition(null)}
        titre={enEdition !== null && enEdition !== 'nouvelle' ? 'Modifier la garantie' : 'Objet sous garantie'}
      >
        <div className="flex flex-col gap-3">
          <ChampTexte
            etiquette="L'objet"
            value={brouillon.titre}
            onChange={(e) => setBrouillon({ ...brouillon, titre: e.target.value })}
            placeholder="Lave-linge Bosch, télé du salon…"
          />
          <label className="flex flex-col gap-1">
            <span className="text-legende text-encre-3">Date d'achat</span>
            <input
              type="date" value={brouillon.achat}
              onChange={(e) => setBrouillon({ ...brouillon, achat: e.target.value })}
              className="min-h-sur-tactile rounded-md border border-trait bg-fond-eleve px-3 text-corps"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {DUREES.map((d) => (
              <button
                key={d.mois}
                onClick={() => setBrouillon({ ...brouillon, mois: d.mois })}
                aria-pressed={brouillon.mois === d.mois}
                className={`min-h-sur-tactile rounded-full px-3 text-note font-[590]
                  ${brouillon.mois === d.mois ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
              >
                {d.libelle}
              </button>
            ))}
          </div>
          {brouillon.achat && (
            <p className="text-legende text-encre-3">
              → couvert jusqu'au {new Date(`${plusMois(brouillon.achat, brouillon.mois)}T12:00:00`).toLocaleDateString('fr-FR')} · rappels à J-30 et J-7
            </p>
          )}
          <BoutonEnvoi
            pleineLargeur variante="valider"
            desactive={!brouillon.titre.trim() || !brouillon.achat}
            onEnvoi={enregistrer} enfantsPendant="Enregistrement…"
          >
            {enEdition !== null && enEdition !== 'nouvelle' ? 'Enregistrer' : 'Suivre cette garantie'}
          </BoutonEnvoi>
        </div>
      </Feuille>
    </div>
  )
}
