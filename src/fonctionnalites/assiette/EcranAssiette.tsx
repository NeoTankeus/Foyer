// 🥗 Mon Assiette : décris (ou photographie) ce que tu manges — STG le note
// selon TON régime : score en ROUGE quand ça ne colle pas, avec l'explication
// précise (gras saturés, sucres, portions…), des conseils et une alternative.
// Chaque membre a son régime et son historique.
import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utiliserSession } from '@/etat/session'
import { compresserImage } from '@/fonctionnalites/souvenirs/donnees'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { BoutonEnvoi } from '@/design/composants/BoutonEnvoi'
import { Carte } from '@/design/composants/Carte'
import { EtatVide } from '@/design/composants/EtatVide'

interface Analyse {
  score: number
  plat: string
  verdict: string
  conseils?: string[]
  alternative?: string
}

interface EntreeAssiette extends Analyse {
  id: string
  membre_id: string
  quand: string
  texte: string
}

// Le score : rouge quand ça ne colle pas au régime, orange moyen, vert bon.
const couleurScore = (score: number) =>
  score < 50 ? 'var(--urgent)' : score < 75 ? 'var(--ambre)' : 'var(--sauge)'
const libelleScore = (score: number) =>
  score < 50 ? 'Pas bon pour ton régime' : score < 75 ? 'Moyen — peut mieux faire' : 'Bien joué !'

// L'analyse vient du relais (texte généré) et l'historique d'un JSON stocké
// côté serveur : score en chaîne, « conseils » qui n'est pas une liste,
// champs manquants… tout est remis en forme avant d'être affiché.
const listeDeTextes = (v: unknown): string[] =>
  (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string' && x.trim() !== '')

const scoreSur100 = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0
}

const analyseSure = (v: unknown): Analyse => {
  const a = (v && typeof v === 'object' ? v : {}) as Partial<Analyse>
  return {
    score: scoreSur100(a.score),
    plat: String(a.plat ?? 'Repas'),
    verdict: String(a.verdict ?? ''),
    conseils: listeDeTextes(a.conseils),
    alternative: a.alternative != null ? String(a.alternative) : undefined,
  }
}

const entreeSure = (v: unknown, i: number): EntreeAssiette => {
  const e = (v && typeof v === 'object' ? v : {}) as Partial<EntreeAssiette>
  return {
    ...analyseSure(v),
    id: String(e.id ?? `assiette-${i}`),
    membre_id: String(e.membre_id ?? ''),
    quand: String(e.quand ?? ''),
    texte: String(e.texte ?? ''),
  }
}

export function EcranAssiette() {
  const { foyer, membre } = utiliserSession()
  const clientRequetes = useQueryClient()
  const champPhoto = useRef<HTMLInputElement>(null)

  const donnees = useQuery({
    queryKey: ['assiette'],
    enabled: !!foyer,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<{ entrees: EntreeAssiette[]; regimes: Record<string, string> }> => {
      const { data } = await supabase.from('foyers').select('reglages').eq('id', foyer?.id ?? '').single()
      const brut = data?.reglages as unknown
      const reglages = (brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {}) as Record<string, unknown>
      const regimes = reglages['regimes']
      return {
        entrees: (Array.isArray(reglages['assiette']) ? reglages['assiette'] : []).map(entreeSure),
        regimes: (regimes && typeof regimes === 'object' && !Array.isArray(regimes) ? regimes : {}) as Record<string, string>,
      }
    },
  })

  const regimeServeur = donnees.data?.regimes[membre?.id ?? ''] ?? ''
  const [regime, setRegime] = useState<string | null>(null) // null = pas encore touché
  const regimeAffiche = regime ?? regimeServeur
  const [texte, setTexte] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoEnCours, setPhotoEnCours] = useState(false)
  const [resultat, setResultat] = useState<Analyse | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [suppression, setSuppression] = useState<string | null>(null)

  const ecrireReglages = async (patch: (base: Record<string, unknown>) => Record<string, unknown>) => {
    if (!foyer) return
    // Relecture fraîche : on n'écrase jamais le reste des réglages.
    const { data: frais } = await supabase.from('foyers').select('reglages').eq('id', foyer.id).single()
    const base = (frais?.reglages ?? foyer.reglages) as Record<string, unknown>
    await supabase.from('foyers').update({ reglages: patch(base) }).eq('id', foyer.id)
    await clientRequetes.invalidateQueries({ queryKey: ['assiette'] })
  }

  const enregistrerRegime = async () => {
    if (!membre) return
    await ecrireReglages((base) => ({
      ...base,
      regimes: { ...((base['regimes'] ?? {}) as Record<string, string>), [membre.id]: (regime ?? '').trim() },
    }))
  }

  const analyser = async () => {
    if (!membre || (!texte.trim() && !photo)) return
    setErreur(null)
    setResultat(null)
    const { data: session } = await supabase.auth.getSession()
    const reponse = await fetch('/api/analyser-repas', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ repas: texte, regime: regimeAffiche, image: photo ?? undefined }),
    })
    const corps = (await reponse.json()) as { proposition?: Analyse; message?: string }
    if (!corps.proposition || typeof corps.proposition.score !== 'number') {
      setErreur(corps.message ?? 'STG n’a pas réussi à analyser — réessaie.')
      return
    }
    const analyse: Analyse = analyseSure(corps.proposition)
    setResultat(analyse)
    // L'entrée part directement dans l'historique partagé (borné à 150).
    const entree: EntreeAssiette = {
      ...analyse,
      id: crypto.randomUUID(),
      membre_id: membre.id,
      quand: new Date().toISOString(),
      texte: texte.trim() || analyse.plat,
    }
    await ecrireReglages((base) => ({
      ...base,
      assiette: [entree, ...(Array.isArray(base['assiette']) ? (base['assiette'] as EntreeAssiette[]) : [])].slice(0, 150),
    }))
    setTexte('')
    setPhoto(null)
  }

  const supprimer = async (id: string) => {
    setSuppression(null)
    await ecrireReglages((base) => ({
      ...base,
      assiette: (Array.isArray(base['assiette']) ? (base['assiette'] as EntreeAssiette[]) : []).filter((e) => e?.id !== id),
    }))
  }

  const mesEntrees = (donnees.data?.entrees ?? []).filter((e) => e.membre_id === membre?.id)
  const ilYA7j = Date.now() - 7 * 86400000
  const semaine = mesEntrees.filter((e) => new Date(e.quand).getTime() > ilYA7j)
  const moyenne = semaine.length > 0 ? Math.round(semaine.reduce((s, e) => s + e.score, 0) / semaine.length) : null

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🥗 Mon Assiette</h1>
        <p className="text-legende text-encre-3">Chaque repas noté selon TON régime — sans langue de bois.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        {/* Le régime personnel — c'est LA référence de la notation. */}
        <Carte>
          <h2 className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">🎯 Mon régime ({membre?.prenom})</h2>
          <textarea
            value={regimeAffiche}
            onChange={(e) => setRegime(e.target.value)}
            rows={3}
            placeholder="Ex. : limiter le gras et les fritures, peu de sucre le soir, plus de légumes et de protéines maigres…"
            aria-label="Mon régime"
            className="w-full rounded-md border border-trait bg-fond-eleve px-3 py-2 text-corps-2 text-encre"
          />
          {regime !== null && regime !== regimeServeur && (
            <div className="mt-2">
              <BoutonEnvoi variante="valider" enfantsPendant="Enregistrement…" onEnvoi={enregistrerRegime}>
                Enregistrer mon régime ✓
              </BoutonEnvoi>
            </div>
          )}
        </Carte>

        {/* La saisie du repas : texte et/ou photo. */}
        <Carte>
          <h2 className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">🍽 Qu'est-ce que tu as mangé ?</h2>
          <textarea
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={2}
            placeholder="Ex. : un burger frites avec un soda, ou une salade de quinoa au poulet…"
            aria-label="Le repas à analyser"
            className="w-full rounded-md border border-trait bg-fond-eleve px-3 py-2 text-corps-2 text-encre"
          />
          <input
            ref={champPhoto} type="file" accept="image/*" hidden aria-hidden="true"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              setPhotoEnCours(true)
              void compresserImage(f).then(setPhoto).finally(() => setPhotoEnCours(false))
            }}
          />
          <div className="mt-2 flex flex-col gap-2">
            <BoutonEnvoi
              variante="discret" pleineLargeur enCours={photoEnCours} enfantsPendant="📷 Lecture…"
              onClick={() => champPhoto.current?.click()}
            >
              📷 {photo ? 'Changer la photo' : 'Photographier l’assiette (facultatif)'}
            </BoutonEnvoi>
            {photo && (
              <div className="relative self-start">
                <img src={photo} alt="Photo du repas" className="h-24 w-24 rounded-md object-cover shadow-carte" />
                <button
                  onClick={() => setPhoto(null)}
                  aria-label="Retirer la photo"
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-encre text-[11px] text-white shadow-carte"
                >
                  ✕
                </button>
              </div>
            )}
            <BoutonEnvoi
              variante="primaire" pleineLargeur desactive={!texte.trim() && !photo}
              enfantsPendant="🥗 STG examine l'assiette…" onEnvoi={analyser}
            >
              🥗 STG, note mon assiette !
            </BoutonEnvoi>
          </div>
          {erreur && <p className="mt-2 text-corps-2 text-urgent">{erreur}</p>}
        </Carte>

        {/* Le verdict du repas : score couleur + POURQUOI, précisément. */}
        {resultat && (
          <div
            className="rounded-xl p-4 shadow-carte"
            style={{ background: `color-mix(in srgb, ${couleurScore(resultat.score)} 14%, var(--fond-eleve))` }}
          >
            <div className="flex items-center gap-3">
              <span
                className="chiffres flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-[22px] font-[800] text-white"
                style={{ background: couleurScore(resultat.score) }}
              >
                {resultat.score}
              </span>
              <div className="min-w-0">
                <p className="text-corps font-[700] text-encre">{libelleScore(resultat.score)}</p>
                <p className="text-corps-2 text-encre-2">{resultat.plat}</p>
              </div>
            </div>
            <p className="mt-2 text-corps-2 leading-snug text-encre">{resultat.verdict}</p>
            {(resultat.conseils ?? []).length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {(resultat.conseils ?? []).map((c, i) => (
                  <li key={i} className="text-corps-2 text-encre-2">💡 {c}</li>
                ))}
              </ul>
            )}
            {resultat.alternative && (
              <p className="mt-2 rounded-lg bg-fond-eleve/70 px-3 py-2 text-corps-2 text-encre-2">
                🔄 À la place : {resultat.alternative}
              </p>
            )}
          </div>
        )}

        {/* La moyenne de la semaine + l'historique. */}
        {moyenne !== null && (
          <Carte>
            <div className="flex items-center justify-between">
              <p className="text-corps-2 font-[590] text-encre">📊 Ma moyenne sur 7 jours ({semaine.length} repas)</p>
              <span
                className="chiffres flex h-10 w-10 items-center justify-center rounded-full text-[16px] font-[800] text-white"
                style={{ background: couleurScore(moyenne) }}
              >
                {moyenne}
              </span>
            </div>
          </Carte>
        )}

        {mesEntrees.length === 0 && !resultat && (
          <EtatVide
            titre="Aucun repas noté pour l'instant"
            message="Décris ton prochain repas (ou photographie-le) — STG le notera selon ton régime, en rouge si ça ne colle pas, avec l'explication exacte."
          />
        )}

        {mesEntrees.slice(0, 30).map((e) => (
          <Carte key={e.id}>
            <button className="flex w-full items-center gap-3 text-left" onClick={() => setOuvert((o) => (o === e.id ? null : e.id))}>
              <span
                className="chiffres flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[15px] font-[800] text-white"
                style={{ background: couleurScore(e.score) }}
              >
                {e.score}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-corps-2 font-[590] text-encre">{e.plat || e.texte}</span>
                <span className="block text-legende text-encre-3">
                  {Number.isNaN(new Date(e.quand).getTime())
                    ? 'date inconnue'
                    : new Date(e.quand).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </span>
              <span className="text-legende text-encre-3">{ouvert === e.id ? '▲' : '▼'}</span>
            </button>
            {ouvert === e.id && (
              <div className="mt-2 flex flex-col gap-2">
                <p className="text-corps-2 leading-snug text-encre-2">{e.verdict}</p>
                {(e.conseils ?? []).map((c, i) => (
                  <p key={i} className="text-corps-2 text-encre-2">💡 {c}</p>
                ))}
                <Bouton
                  variante={suppression === e.id ? 'urgent' : 'discret'}
                  onClick={() => {
                    if (suppression !== e.id) {
                      setSuppression(e.id)
                      window.setTimeout(() => setSuppression((s) => (s === e.id ? null : s)), 3000)
                      return
                    }
                    void supprimer(e.id)
                  }}
                >
                  {suppression === e.id ? 'Confirmer la suppression ?' : '✕ Retirer ce repas'}
                </Bouton>
              </div>
            )}
          </Carte>
        ))}
      </div>
    </div>
  )
}
