// 💌 Les Capsules temporelles : un mot ou une photo d'aujourd'hui, scellé
// jusqu'à la date choisie. STG le garde secret et prévient le jour J.
// « Message de Stéphane pour les 10 ans de Gabriel »… frissons garantis.
import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { lireAvecRepli } from '@/lib/lecture'
import { utiliserSession } from '@/etat/session'
import { compresserImage } from '@/fonctionnalites/souvenirs/donnees'
import type { LigneCapsule } from '@/lib/basedonnees.types'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { BoutonEnvoi } from '@/design/composants/BoutonEnvoi'
import { Carte } from '@/design/composants/Carte'
import { EtatVide } from '@/design/composants/EtatVide'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'

export function EcranCapsules() {
  const { membre, membres, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const [creation, setCreation] = useState(false)
  const [titre, setTitre] = useState('')
  const [contenu, setContenu] = useState('')
  const [ouvrirLe, setOuvrirLe] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [compressionEnCours, setCompressionEnCours] = useState(false)
  const fichierRef = useRef<HTMLInputElement>(null)
  const [reveleee, setRevelee] = useState<LigneCapsule | null>(null)

  const capsules = useQuery({
    queryKey: ['capsules'],
    queryFn: () =>
      lireAvecRepli<LigneCapsule>('capsules', async () => {
        const { data, error } = await supabase.from('capsules').select('*').order('ouvrir_le')
        if (error) throw error
        return data
      }),
  })

  const rafraichir = () => clientRequetes.invalidateQueries({ queryKey: ['capsules'] })
  const prenom = (id: string | null) => membres.find((m) => m.id === id)?.prenom ?? 'quelqu’un'
  const aujourdHui = new Date().toISOString().slice(0, 10)

  const sceller = async () => {
    if (!foyer || !membre || !titre.trim() || !ouvrirLe) return
    const id = crypto.randomUUID()
    await muter({
      table: 'capsules', type: 'insert', cible_id: id,
      charge: {
        id, foyer_id: foyer.id, auteur_id: membre.id,
        titre: titre.trim(), contenu: contenu.trim() || null,
        image_donnees: photo, ouvrir_le: ouvrirLe, ouverte: false,
        cree_le: new Date().toISOString(),
      },
    })
    setCreation(false)
    setTitre('')
    setContenu('')
    setOuvrirLe('')
    setPhoto(null)
    await rafraichir()
  }

  const ouvrir = async (c: LigneCapsule) => {
    navigator.vibrate?.([10, 60, 20])
    await muter({ table: 'capsules', type: 'update', cible_id: c.id, charge: { ouverte: true } })
    setRevelee({ ...c, ouverte: true })
    await rafraichir()
  }

  const toutes = capsules.data ?? []
  const pretes = toutes.filter((c) => !c.ouverte && c.ouvrir_le <= aujourdHui)
  const scellees = toutes.filter((c) => !c.ouverte && c.ouvrir_le > aujourdHui)
  const ouvertes = toutes.filter((c) => c.ouverte)

  const joursRestants = (c: LigneCapsule) =>
    Math.max(0, Math.round((new Date(`${c.ouvrir_le}T12:00:00`).getTime() - Date.now()) / 86400000))

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 flex items-start justify-between px-5 pb-2 pt-3">
        <div>
          <BarreRetour />
          <h1 className="text-titre-2 text-encre">💌 Capsules temporelles</h1>
          <p className="text-legende text-encre-3">Des mots d'aujourd'hui pour plus tard.</p>
        </div>
        <Bouton variante="primaire" onClick={() => setCreation(true)}>+ Sceller</Bouton>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        {!capsules.isLoading && toutes.length === 0 && (
          <EtatVide
            titre="Aucune capsule"
            message="Écris un mot pour les 10 ans de Gabriel, votre prochain anniversaire de mariage, le réveillon… STG le garde secret et le délivre le jour J."
          />
        )}

        {pretes.map((c) => (
          <button key={c.id} onClick={() => void ouvrir(c)} className="text-left">
            <Carte>
              <div className="flex items-center gap-3">
                <span className="text-[30px]" aria-hidden="true">🎁</span>
                <div className="flex-1">
                  <p className="text-corps font-[590] text-encre">Une capsule s'ouvre aujourd'hui !</p>
                  <p className="text-legende text-encre-3">De {prenom(c.auteur_id)} — scellée le {new Date(c.cree_le).toLocaleDateString('fr-FR')}</p>
                </div>
                <span className="rounded-full bg-corail/20 px-3 py-1 text-note font-[590] text-encre">Ouvrir ✨</span>
              </div>
            </Carte>
          </button>
        ))}

        {scellees.length > 0 && (
          <>
            <p className="text-note font-[590] uppercase tracking-wide text-encre-3">🔒 Scellées</p>
            {scellees.map((c) => (
              <Carte key={c.id}>
                <div className="flex items-center gap-3">
                  <span className="text-[26px]" aria-hidden="true">🔒</span>
                  <div className="flex-1">
                    <p className="text-corps-2 font-[590] text-encre">{c.titre}</p>
                    <p className="text-legende text-encre-3">
                      De {prenom(c.auteur_id)} · s'ouvre le {new Date(`${c.ouvrir_le}T12:00:00`).toLocaleDateString('fr-FR')} — J-{joursRestants(c)}
                    </p>
                  </div>
                  {c.auteur_id === membre?.id && (
                    <button
                      aria-label="Détruire la capsule"
                      onClick={() => {
                        if (confirm('Détruire cette capsule scellée ? Personne ne la lira jamais.'))
                          void muter({ table: 'capsules', type: 'delete', cible_id: c.id, charge: {} }).then(rafraichir)
                      }}
                      className="min-h-sur-tactile text-encre-3"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <p className="mt-1 text-legende italic text-encre-3">Le contenu reste secret jusqu'au jour J — même pour celui qui l'a écrite.</p>
              </Carte>
            ))}
          </>
        )}

        {ouvertes.length > 0 && (
          <>
            <p className="text-note font-[590] uppercase tracking-wide text-encre-3">💌 Ouvertes</p>
            {ouvertes.map((c) => (
              <Carte key={c.id}>
                <p className="text-corps font-[590] text-encre">{c.titre}</p>
                <p className="text-legende text-encre-3">
                  De {prenom(c.auteur_id)} · écrit le {new Date(c.cree_le).toLocaleDateString('fr-FR')} · ouvert le {new Date(`${c.ouvrir_le}T12:00:00`).toLocaleDateString('fr-FR')}
                </p>
                {c.contenu && <p className="mt-2 whitespace-pre-wrap text-corps-2 leading-relaxed text-encre">{c.contenu}</p>}
                {c.image_donnees && <img src={c.image_donnees} alt="" className="mt-2 max-h-72 rounded-lg object-cover" />}
              </Carte>
            ))}
          </>
        )}
      </div>

      {/* La révélation, plein écran */}
      <Feuille ouverte={reveleee !== null} onFermer={() => setRevelee(null)} titre="✨ La capsule s'ouvre">
        {reveleee && (
          <div className="flex flex-col gap-3 text-center">
            <p className="text-[44px]" aria-hidden="true">💌</p>
            <p className="text-titre-3 text-encre">{reveleee.titre}</p>
            <p className="text-legende text-encre-3">
              {prenom(reveleee.auteur_id)} a écrit ceci le {new Date(reveleee.cree_le).toLocaleDateString('fr-FR')} :
            </p>
            {reveleee.contenu && (
              <p className="whitespace-pre-wrap rounded-xl bg-fond-sourd p-4 text-left text-corps leading-relaxed text-encre">
                {reveleee.contenu}
              </p>
            )}
            {reveleee.image_donnees && <img src={reveleee.image_donnees} alt="" className="max-h-80 rounded-xl object-cover" />}
          </div>
        )}
      </Feuille>

      <Feuille ouverte={creation} onFermer={() => setCreation(false)} titre="Sceller une capsule">
        <div className="flex flex-col gap-3">
          <ChampTexte etiquette="Titre (visible, il fait patienter)" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Pour les 10 ans de Gabriel" />
          <label className="block">
            <span className="mb-1 block text-note font-[500] text-encre-2">Le message (secret jusqu'au jour J)</span>
            <textarea
              value={contenu}
              onChange={(e) => setContenu(e.target.value)}
              rows={5}
              placeholder="Aujourd'hui tu as 7 ans et tu…"
              className="w-full rounded-md border border-trait bg-fond-eleve px-3 py-2 text-corps text-encre"
            />
          </label>
          <div className="flex items-center gap-2">
            <BoutonEnvoi
              variante="discret" enCours={compressionEnCours}
              onClick={() => fichierRef.current?.click()} enfantsPendant="Photo en préparation…"
            >
              {photo ? '✓ Photo jointe' : '📷 Joindre une photo'}
            </BoutonEnvoi>
            {photo && (
              <button onClick={() => setPhoto(null)} className="text-legende text-encre-3 underline">retirer</button>
            )}
          </div>
          <input
            ref={fichierRef} type="file" accept="image/*" hidden aria-hidden="true"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) {
                setCompressionEnCours(true)
                void compresserImage(f).then(setPhoto).finally(() => setCompressionEnCours(false))
              }
              e.target.value = ''
            }}
          />
          <label className="flex flex-col gap-1">
            <span className="text-legende text-encre-3">S'ouvrira le</span>
            <input
              type="date"
              value={ouvrirLe}
              min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
              onChange={(e) => setOuvrirLe(e.target.value)}
              className="min-h-sur-tactile rounded-md border border-trait bg-fond-eleve px-3 text-corps"
            />
          </label>
          <BoutonEnvoi
            pleineLargeur variante="valider"
            desactive={!titre.trim() || !ouvrirLe || (!contenu.trim() && !photo)}
            onEnvoi={sceller} enfantsPendant="Scellage…"
          >
            🔒 Sceller jusqu'au jour J
          </BoutonEnvoi>
          <p className="text-legende text-encre-3">
            Une fois scellée, plus personne ne peut la lire — pas même toi. Le jour J, tout le foyer reçoit une notification.
          </p>
        </div>
      </Feuille>
    </div>
  )
}
