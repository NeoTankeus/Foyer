// Colis — suivi manuel + lien direct transporteur.
// Le suivi automatique (API La Poste toutes les 2 h) arrive en phase 3 : on ne fait pas semblant.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { lireAvecRepli } from '@/lib/lecture'
import { utiliserSession } from '@/etat/session'
import type { LigneColis } from '@/lib/basedonnees.types'
import { Bouton } from '@/design/composants/Bouton'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { EtatVide } from '@/design/composants/EtatVide'
import { BarreRetour } from '@/design/composants/BarreRetour'

const TRANSPORTEURS: { valeur: LigneColis['transporteur']; libelle: string; suivi: (n: string) => string }[] = [
  { valeur: 'laposte', libelle: 'La Poste / Colissimo', suivi: (n) => `https://www.laposte.fr/outils/suivre-vos-envois?code=${n}` },
  { valeur: 'chronopost', libelle: 'Chronopost', suivi: (n) => `https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT=${n}` },
  { valeur: 'mondial_relay', libelle: 'Mondial Relay', suivi: (n) => `https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=${n}` },
  { valeur: 'ups', libelle: 'UPS', suivi: (n) => `https://www.ups.com/track?tracknum=${n}` },
  { valeur: 'autre', libelle: 'Autre', suivi: () => '' },
]

const STATUTS: { valeur: LigneColis['statut']; libelle: string }[] = [
  { valeur: 'attendu', libelle: 'Attendu' },
  { valeur: 'en_transit', libelle: 'En route' },
  { valeur: 'livre', libelle: 'Livré' },
]

export function EcranColis() {
  const { membre, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const [enEdition, setEnEdition] = useState<LigneColis | 'nouvelle' | null>(null)
  const [confirmeSuppr, setConfirmeSuppr] = useState<string | null>(null)

  const colis = useQuery({
    queryKey: ['colis'],
    queryFn: async () => {
      const lignes = await lireAvecRepli<LigneColis>('colis', async () => {
        const { data, error } = await supabase.from('colis').select('*').neq('statut', 'archive').order('cree_le', { ascending: false })
        if (error) throw error
        return data
      })
      return lignes.filter((c) => c.statut !== 'archive')
    },
  })

  if (membre?.role !== 'adult') return null
  const rafraichir = () => clientRequetes.invalidateQueries({ queryKey: ['colis'] })

  return (
    <div className="px-5 pt-3">
      <BarreRetour vers="/nous" />
      <div className="flex items-center justify-between gap-3 pb-3">
        <h2 className="text-titre-3 text-encre">Colis</h2>
        <Bouton variante="discret" onClick={() => setEnEdition('nouvelle')} etiquette="Nouveau colis">+</Bouton>
      </div>
      <p className="mb-3 text-note text-encre-3">
        Invisible pour Gabriel — les surprises restent des surprises. Suivi automatique en phase 3.
      </p>

      {(colis.data?.length ?? 0) === 0 && !colis.isLoading && (
        <EtatVide titre="Aucun colis en route" message="Colle un numéro de suivi et garde l’œil dessus depuis ici." />
      )}

      <ul className="flex flex-col gap-2">
        {(colis.data ?? []).map((c) => {
          const transporteur = TRANSPORTEURS.find((t) => t.valeur === c.transporteur)
          const lien = transporteur?.suivi(c.numero)
          return (
            <li key={c.id} className="rounded-md bg-fond-eleve p-3 shadow-carte">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-corps text-encre">{c.libelle ?? 'Colis'}</p>
                <span className="chiffres text-legende text-encre-3">{c.numero}</span>
                <button
                  onClick={() => setEnEdition(c)}
                  aria-label={`Modifier ${c.libelle ?? c.numero}`}
                  className="min-h-[32px] min-w-[32px] rounded-full text-note text-encre-3"
                >
                  ✎
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex gap-1">
                  {STATUTS.map((s) => (
                    <button
                      key={s.valeur}
                      onClick={() =>
                        void muter({
                          table: 'colis', type: 'update', cible_id: c.id,
                          charge: { statut: s.valeur, livre_le: s.valeur === 'livre' ? new Date().toISOString() : null },
                        }).then(rafraichir)
                      }
                      aria-pressed={c.statut === s.valeur}
                      className={`min-h-[36px] rounded-full px-3 text-note font-[500]
                        ${c.statut === s.valeur ? (s.valeur === 'livre' ? 'bg-fait text-fond-eleve' : 'bg-encre text-fond') : 'bg-fond-sourd text-encre-2'}`}
                    >
                      {s.libelle}
                    </button>
                  ))}
                </div>
                {lien && (
                  <a href={lien} target="_blank" rel="noopener" className="text-note text-ardoise underline">
                    Suivre
                  </a>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <Feuille
        ouverte={enEdition !== null}
        onFermer={() => {
          setEnEdition(null)
          setConfirmeSuppr(null)
        }}
        titre={enEdition === 'nouvelle' ? 'Nouveau colis' : 'Modifier le colis'}
      >
        {enEdition !== null && foyer && (
          <FormColis
            initiale={enEdition === 'nouvelle' ? null : enEdition}
            surEnregistrement={async (b) => {
              if (enEdition === 'nouvelle') {
                const id = crypto.randomUUID()
                await muter({
                  table: 'colis', type: 'insert', cible_id: id,
                  charge: {
                    id, foyer_id: foyer.id, statut: 'attendu', dernier_evenement: null,
                    eta: null, destinataire_id: null, livre_le: null, ...b,
                  },
                })
              } else {
                await muter({ table: 'colis', type: 'update', cible_id: enEdition.id, charge: b })
              }
              await rafraichir()
              setEnEdition(null)
            }}
            surSuppression={
              enEdition === 'nouvelle'
                ? undefined
                : async () => {
                    if (confirmeSuppr !== enEdition.id) {
                      setConfirmeSuppr(enEdition.id)
                      return
                    }
                    await muter({ table: 'colis', type: 'delete', cible_id: enEdition.id, charge: {} })
                    setConfirmeSuppr(null)
                    await rafraichir()
                    setEnEdition(null)
                  }
            }
            confirme={enEdition !== 'nouvelle' && confirmeSuppr === enEdition.id}
          />
        )}
      </Feuille>
    </div>
  )
}

function FormColis({
  initiale,
  surEnregistrement,
  surSuppression,
  confirme,
}: {
  initiale: LigneColis | null
  surEnregistrement: (b: { numero: string; transporteur: LigneColis['transporteur']; libelle: string | null }) => Promise<void>
  surSuppression?: () => Promise<void>
  confirme: boolean
}) {
  const [numero, setNumero] = useState(initiale?.numero ?? '')
  const [transporteur, setTransporteur] = useState<LigneColis['transporteur']>(initiale?.transporteur ?? 'laposte')
  const [libelle, setLibelle] = useState(initiale?.libelle ?? '')
  return (
    <div className="flex flex-col gap-3">
      <ChampTexte etiquette="Numéro de suivi" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="6A123456789FR" />
      <div className="flex flex-wrap gap-1">
        {TRANSPORTEURS.map((t) => (
          <button
            key={t.valeur}
            onClick={() => setTransporteur(t.valeur)}
            aria-pressed={transporteur === t.valeur}
            className={`min-h-sur-tactile rounded-full px-3 text-note font-[500]
              ${transporteur === t.valeur ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
          >
            {t.libelle}
          </button>
        ))}
      </div>
      <ChampTexte etiquette="C'est quoi ? (facultatif)" value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Chaussures Gabriel" />
      <Bouton
        pleineLargeur
        onClick={() => {
          if (numero.trim())
            void surEnregistrement({ numero: numero.trim(), transporteur, libelle: libelle.trim() || null })
        }}
      >
        {initiale ? 'Enregistrer' : 'Suivre ce colis'}
      </Bouton>
      {surSuppression && (
        <Bouton pleineLargeur variante={confirme ? 'urgent' : 'discret'} onClick={() => void surSuppression()}>
          {confirme ? 'Confirmer la suppression ?' : 'Supprimer ce colis'}
        </Bouton>
      )}
    </div>
  )
}
