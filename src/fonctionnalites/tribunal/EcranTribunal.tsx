// ⚖️ Le Tribunal du foyer : un désaccord ? Chacun plaide, STG rend un verdict
// solennel et de mauvaise foi assumée — et la jurisprudence reste gravée.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { lireAvecRepli } from '@/lib/lecture'
import { utiliserSession } from '@/etat/session'
import { demanderAStiga } from '@/lib/stiga'
import type { LigneTribunal } from '@/lib/basedonnees.types'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { EtatVide } from '@/design/composants/EtatVide'

export function EcranTribunal() {
  const { membres, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const adultes = membres.filter((m) => m.role === 'adult').map((m) => m.prenom)
  const [affaire, setAffaire] = useState('')
  const [plaignant, setPlaignant] = useState(adultes[0] ?? '')
  const [accuse, setAccuse] = useState(adultes[1] ?? adultes[0] ?? '')
  const [plaidoirie1, setPlaidoirie1] = useState('')
  const [plaidoirie2, setPlaidoirie2] = useState('')
  const [audience, setAudience] = useState(false)

  const dossiers = useQuery({
    queryKey: ['tribunal'],
    queryFn: () =>
      lireAvecRepli<LigneTribunal>('tribunal', async () => {
        const { data, error } = await supabase.from('tribunal').select('*').order('cree_le', { ascending: false }).limit(30)
        if (error) throw error
        return data
      }),
  })

  const juger = async () => {
    if (!foyer || !affaire.trim()) return
    setAudience(true)
    try {
      const verdict = await demanderAStiga(
        `Tu es LE JUGE du Tribunal du foyer — solennel, théâtral, et d'une mauvaise foi assumée mais toujours bienveillante et drôle (jamais blessante). ` +
          `AFFAIRE : « ${affaire} ». Plaignant(e) : ${plaignant}. Accusé(e) : ${accuse}. ` +
          `Plaidoirie de ${plaignant} : « ${plaidoirie1 || 'aucune — outrage à la cour'} ». ` +
          `Plaidoirie de ${accuse} : « ${plaidoirie2 || 'aucune — la défense garde le silence'} ». ` +
          `Rends ton VERDICT en 4 parties courtes : « ATTENDU QUE… » (2-3 attendus juridiques ridicules mais logiques), ` +
          `« LA COUR DÉCLARE » (le/la coupable, ou un partage des torts inattendu), ` +
          `« PEINE PRONONCÉE » (une sanction domestique drôle et proportionnée : débarrasser 3 soirs, choisir le film, un câlin d'excuse…), ` +
          `« JURISPRUDENCE » (la règle absurde qui fera loi désormais). Maximum 12 lignes, très solennel.`,
      )
      const id = crypto.randomUUID()
      await muter({
        table: 'tribunal', type: 'insert', cible_id: id,
        charge: {
          id, foyer_id: foyer.id, affaire: affaire.trim(), plaignant, accuse,
          plaidoirie_plaignant: plaidoirie1.trim() || null, plaidoirie_accuse: plaidoirie2.trim() || null,
          verdict, cree_le: new Date().toISOString(),
        },
      })
      await clientRequetes.invalidateQueries({ queryKey: ['tribunal'] })
      setAffaire('')
      setPlaidoirie1('')
      setPlaidoirie2('')
    } finally {
      setAudience(false)
    }
  }

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">⚖️ Le Tribunal du foyer</h1>
        <p className="text-legende text-encre-3">La cour est ouverte. Silence dans la cuisine.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <Carte>
          <ChampTexte
            etiquette="L'affaire portée devant la cour"
            value={affaire}
            onChange={(e) => setAffaire(e.target.value)}
            placeholder="Affaire de la vaisselle abandonnée du 19 juillet"
          />
          <div className="mt-2 flex gap-2">
            <div className="flex-1">
              <p className="mb-1 text-legende text-encre-3">Plaignant(e)</p>
              <div className="flex gap-1">
                {adultes.map((p) => (
                  <button key={p} onClick={() => setPlaignant(p)} aria-pressed={plaignant === p}
                    className={`min-h-sur-tactile flex-1 rounded-full px-2 text-note font-[590] ${plaignant === p ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <p className="mb-1 text-legende text-encre-3">Accusé(e)</p>
              <div className="flex gap-1">
                {adultes.map((p) => (
                  <button key={p} onClick={() => setAccuse(p)} aria-pressed={accuse === p}
                    className={`min-h-sur-tactile flex-1 rounded-full px-2 text-note font-[590] ${accuse === p ? 'bg-urgent/20 text-encre' : 'bg-fond-sourd text-encre-2'}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <label className="mt-2 block">
            <span className="mb-1 block text-note font-[500] text-encre-2">Plaidoirie de {plaignant}</span>
            <textarea value={plaidoirie1} onChange={(e) => setPlaidoirie1(e.target.value)} rows={2}
              placeholder="Les faits sont accablants…"
              className="w-full rounded-md border border-trait bg-fond-eleve px-3 py-2 text-corps-2" />
          </label>
          <label className="mt-2 block">
            <span className="mb-1 block text-note font-[500] text-encre-2">Plaidoirie de {accuse} (la défense)</span>
            <textarea value={plaidoirie2} onChange={(e) => setPlaidoirie2(e.target.value)} rows={2}
              placeholder="Objection ! Le contexte prouve que…"
              className="w-full rounded-md border border-trait bg-fond-eleve px-3 py-2 text-corps-2" />
          </label>
          <div className="mt-3">
            <Bouton pleineLargeur variante="primaire" desactive={!affaire.trim() || audience} onClick={() => void juger()}>
              {audience ? '🔨 La cour délibère…' : '🔨 Que justice soit rendue !'}
            </Bouton>
          </div>
        </Carte>

        {!dossiers.isLoading && (dossiers.data ?? []).length === 0 && (
          <EtatVide titre="Aucune affaire au rôle" message="Le premier « c'est pas moi qui ai fini le chocolat » fera l'affaire." />
        )}

        {(dossiers.data ?? []).map((d) => (
          <Carte key={d.id}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-corps-2 font-[590] text-encre">⚖️ {d.affaire}</p>
              <button
                aria-label="Supprimer cette affaire"
                onClick={() => {
                  if (confirm('Effacer cette affaire de la jurisprudence ?'))
                    void muter({ table: 'tribunal', type: 'delete', cible_id: d.id, charge: {} }).then(() =>
                      clientRequetes.invalidateQueries({ queryKey: ['tribunal'] }),
                    )
                }}
                className="text-encre-3"
              >
                ✕
              </button>
            </div>
            <p className="text-legende text-encre-3">
              {d.plaignant} c. {d.accuse} · {new Date(d.cree_le).toLocaleDateString('fr-FR')}
            </p>
            {d.verdict && (
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-fond-sourd px-3 py-2 text-corps-2 leading-relaxed text-encre">
                {d.verdict}
              </p>
            )}
          </Carte>
        ))}
      </div>
    </div>
  )
}
