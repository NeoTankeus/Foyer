// 🕵️ Le Détective des prix : photographie N'IMPORTE quelle étiquette de rayon
// — STG lit le prix au litre/kilo (celui écrit en tout petit) et te dit si
// c'est une vraie affaire ou du marketing.
import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demanderAStiga } from '@/lib/stiga'
import { compresserImage } from '@/fonctionnalites/souvenirs/donnees'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { BoutonEnvoi } from '@/design/composants/BoutonEnvoi'
import { Carte } from '@/design/composants/Carte'
import { EtatVide } from '@/design/composants/EtatVide'

interface Etiquette {
  produit: string | null
  marque: string | null
  prix: number | null
  quantite: string | null
  prix_unitaire: number | null
  unite: string | null
}

export function EcranDetective() {
  const fichierRef = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [etiquette, setEtiquette] = useState<Etiquette | null>(null)
  const [verdict, setVerdict] = useState<string | null>(null)
  const [etat, setEtat] = useState<'repos' | 'lit' | 'juge' | 'erreur'>('repos')
  const [erreur, setErreur] = useState('')

  const enqueter = async (fichier: File) => {
    setEtat('lit')
    setEtiquette(null)
    setVerdict(null)
    setErreur('')
    try {
      const image = await compresserImage(fichier)
      setPhoto(image)
      const { data: session } = await supabase.auth.getSession()
      const reponse = await fetch('/api/lire-etiquette', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${session.session?.access_token ?? ''}` },
        body: JSON.stringify({ image }),
      })
      const donnees = (await reponse.json()) as { etiquette?: Etiquette; message?: string }
      if (!donnees.etiquette) throw new Error(donnees.message ?? 'étiquette illisible')
      setEtiquette(donnees.etiquette)

      // Le verdict : STG compare au prix habituel de ce type de produit.
      setEtat('juge')
      const e = donnees.etiquette
      setVerdict(
        await demanderAStiga(
          `Je suis en magasin devant cette étiquette : produit « ${e.produit ?? '?'} »${e.marque ? ` (${e.marque})` : ''}, ` +
            `prix ${e.prix ?? '?'} €${e.quantite ? ` pour ${e.quantite}` : ''}` +
            `${e.prix_unitaire ? `, soit ${e.prix_unitaire} €/${e.unite ?? 'unité'}` : ''}. ` +
            `Verdict de détective en 3 lignes MAX : 1) est-ce cher, correct ou une affaire par rapport aux prix ` +
            `habituels en France pour ce type de produit (base-toi sur le prix au ${e.unite ?? 'kilo/litre'}, c'est lui qui compte) ? ` +
            `2) le piège marketing éventuel (format, marque vs distributeur…) 3) ton conseil direct. ` +
            `Sois franc et chiffré quand tu peux — et si tu n'es pas sûr des prix habituels, dis-le.`,
        ),
      )
      setEtat('repos')
    } catch (e) {
      setErreur(String(e instanceof Error ? e.message : e))
      setEtat('erreur')
    }
  }

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🕵️ Le Détective des prix</h1>
        <p className="text-legende text-encre-3">L'étiquette dit tout — surtout ce qui est écrit en petit.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <BoutonEnvoi
          pleineLargeur variante="primaire"
          enCours={etat === 'lit' || etat === 'juge'}
          onClick={() => fichierRef.current?.click()}
          enfantsPendant={etat === 'lit' ? '🔍 Lecture de l’étiquette…' : '⚖️ Le Détective délibère…'}
        >
          📸 Photographier une étiquette de rayon
        </BoutonEnvoi>
        <input
          ref={fichierRef} type="file" accept="image/*" capture="environment" hidden aria-hidden="true"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void enqueter(f)
            e.target.value = ''
          }}
        />

        {etat === 'erreur' && <p className="text-corps-2 text-urgent">Enquête ratée ({erreur}) — reprends la photo bien de face, sans reflet.</p>}

        {!etiquette && etat === 'repos' && (
          <EtatVide
            titre="À toi de jouer, détective"
            message="Vise l'étiquette du rayon (pas le produit) : STG lit le prix au kilo/litre écrit en tout petit — c'est LUI qui dit la vérité, pas le gros prix."
          />
        )}

        {photo && etiquette && (
          <Carte>
            <div className="flex items-start gap-3">
              <img src={photo} alt="Étiquette" className="h-24 w-24 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-corps-2 font-[590] text-encre">
                  {etiquette.produit ?? 'Produit'} {etiquette.marque ? `· ${etiquette.marque}` : ''}
                </p>
                {etiquette.prix !== null && (
                  <p className="chiffres text-titre-3 text-encre">
                    {etiquette.prix.toFixed(2).replace('.', ',')} €
                    {etiquette.quantite ? <span className="text-corps-2 text-encre-3"> / {etiquette.quantite}</span> : null}
                  </p>
                )}
                {etiquette.prix_unitaire !== null && (
                  <p className="text-corps-2 font-[590] text-ardoise">
                    → {etiquette.prix_unitaire.toFixed(2).replace('.', ',')} €/{etiquette.unite ?? 'unité'}
                  </p>
                )}
              </div>
            </div>
          </Carte>
        )}

        {verdict && (
          <Carte>
            <p className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">⚖️ Le verdict du Détective</p>
            <p className="whitespace-pre-wrap text-corps-2 leading-relaxed text-encre">{verdict}</p>
          </Carte>
        )}
      </div>
    </div>
  )
}
