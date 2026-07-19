// Le scanner façon Yuka : caméra en direct, trait rouge qui balaie, BIP à la
// détection — puis la fiche santé du produit (Nutri-Score, NOVA, additifs,
// sel/sucres/graisses) et l'ajout aux courses ou aux placards.
import { useEffect, useRef, useState } from 'react'
import type { IScannerControls } from '@zxing/browser'
import { muter } from '@/lib/sync'
import { utiliserSession } from '@/etat/session'
import { ajouterArticle, utiliserListeCourses } from '@/lib/requetes'
import { devinerRayon } from './rayons'
import { COULEURS_NUTRISCORE, ficheParCodeBarres, type FicheProduit } from '@/lib/openfoodfacts'
import { Bouton } from '@/design/composants/Bouton'
import { Feuille } from '@/design/composants/Feuille'

const LIBELLES_SCORE: Record<string, string> = {
  a: 'Excellent', b: 'Bon', c: 'Moyen', d: 'Médiocre', e: 'Mauvais',
}
const NIVEAUX_FR: Record<string, string> = {
  fat: 'Graisses', 'saturated-fat': 'Graisses saturées', sugars: 'Sucres', salt: 'Sel',
}
const COULEUR_NIVEAU: Record<string, string> = {
  low: '#038141', moderate: '#fecb02', high: '#e63e11',
}

/** Le BIP de scan — généré au vol, aucun fichier audio. */
function bip() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 1318
    osc.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
    osc.start()
    osc.stop(ctx.currentTime + 0.16)
    window.setTimeout(() => void ctx.close(), 300)
  } catch {
    // pas de son : la vibration prend le relais
  }
}

interface Props {
  ouverte: boolean
  onFermer: () => void
  onAjout?: () => void
}

export function ScannerYuka({ ouverte, onFermer, onAjout }: Props) {
  const { membre, foyer } = utiliserSession()
  const courses = utiliserListeCourses()
  const [fiche, setFiche] = useState<FicheProduit | null>(null)
  const [codeInconnu, setCodeInconnu] = useState<string | null>(null)
  const [recherche, setRecherche] = useState(false)
  const [ajoute, setAjoute] = useState<string | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const controles = useRef<IScannerControls | null>(null)
  const [generation, setGeneration] = useState(0)

  // La caméra démarre à l'ouverture (et à chaque « scanner un autre »).
  useEffect(() => {
    if (!ouverte) return
    let arrete = false
    setFiche(null)
    setCodeInconnu(null)
    setAjoute(null)
    void (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { DecodeHintType }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ])
        if (arrete || !video.current) return
        const indices = new Map<import('@zxing/library').DecodeHintType, unknown>()
        indices.set(DecodeHintType.TRY_HARDER, true)
        const lecteur = new BrowserMultiFormatReader(indices as never)
        controles.current = await lecteur.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          video.current,
          (resultat) => {
            if (!resultat || arrete) return
            arrete = true
            controles.current?.stop()
            bip()
            navigator.vibrate?.(40)
            const code = resultat.getText()
            setRecherche(true)
            void ficheParCodeBarres(code)
              .then((f) => {
                if (f) setFiche(f)
                else setCodeInconnu(code)
              })
              .finally(() => setRecherche(false))
          },
        )
      } catch {
        setCodeInconnu('camera')
      }
    })()
    return () => {
      arrete = true
      controles.current?.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouverte, generation])

  const ajouterAuxCourses = () => {
    if (!fiche || !membre || !courses.data?.liste) return
    const libelle = [fiche.marque?.split(',')[0], fiche.nom].filter(Boolean).join(' ').slice(0, 120)
    void ajouterArticle(courses.data.liste.id, membre.id, libelle, devinerRayon(libelle), fiche.image ?? undefined)
    setAjoute('courses')
    onAjout?.()
  }

  const ajouterAuxPlacards = (zone: string) => {
    if (!fiche || !foyer) return
    const libelle = [fiche.marque?.split(',')[0], fiche.nom, fiche.quantite].filter(Boolean).join(' ').slice(0, 120)
    void muter({
      table: 'inventaire', type: 'insert', cible_id: crypto.randomUUID(),
      charge: {
        id: crypto.randomUUID(), foyer_id: foyer.id, zone, libelle,
        code_barres: fiche.code, image_url: fiche.image, quantite: 1, dlc: null,
        cree_le: new Date().toISOString(),
      },
    })
    setAjoute(zone)
    onAjout?.()
  }

  const rescanner = () => setGeneration((g) => g + 1)

  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre="Scanner un produit">
      {!fiche && !recherche && codeInconnu === null && (
        <div className="relative overflow-hidden rounded-xl bg-encre" style={{ aspectRatio: '3/4' }}>
          <video ref={video} className="h-full w-full object-cover" muted playsInline />
          {/* Le trait rouge qui balaie, façon Yuka */}
          <div className="scan-ligne pointer-events-none absolute inset-x-6 h-0.5 rounded bg-urgent" />
          <p className="absolute inset-x-0 bottom-3 text-center text-note font-[590] text-white/90">
            Vise le code-barres — bip dès qu’il est lu 🔊
          </p>
        </div>
      )}

      {recherche && <p className="py-10 text-center text-corps text-encre-2">🔎 Fiche du produit…</p>}

      {codeInconnu !== null && (
        <div className="flex flex-col gap-3 py-4">
          <p className="text-center text-corps-2 text-encre-3">
            {codeInconnu === 'camera'
              ? 'Caméra indisponible — autorise-la dans les réglages.'
              : `Produit inconnu des bases publiques (code ${codeInconnu}).`}
          </p>
          <Bouton pleineLargeur variante="discret" onClick={rescanner}>📷 Scanner un autre</Bouton>
        </div>
      )}

      {fiche && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            {fiche.image && <img src={fiche.image} alt="" className="h-20 w-20 shrink-0 rounded-md object-contain" />}
            <div className="min-w-0 flex-1">
              <p className="text-corps font-[590] leading-snug text-encre">{fiche.nom ?? 'Produit'}</p>
              <p className="text-legende text-encre-3">{[fiche.marque, fiche.quantite].filter(Boolean).join(' · ')}</p>
            </div>
            {fiche.nutriscore && (
              <div className="flex flex-col items-center gap-0.5">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-full text-titre-2 font-[800] uppercase text-white"
                  style={{ background: COULEURS_NUTRISCORE[fiche.nutriscore] ?? 'var(--encre-3)' }}
                >
                  {fiche.nutriscore}
                </span>
                <span className="text-legende font-[590] text-encre-2">
                  {LIBELLES_SCORE[fiche.nutriscore] ?? ''}
                </span>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-fond-sourd px-3 py-2">
            {Object.entries(NIVEAUX_FR).map(([cle, libelle]) => {
              const niveau = fiche.niveaux[cle]
              if (!niveau) return null
              return (
                <p key={cle} className="flex items-center gap-2 py-0.5 text-corps-2 text-encre-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: COULEUR_NIVEAU[niveau] ?? 'var(--encre-3)' }} />
                  {libelle} : {niveau === 'low' ? 'faible ✓' : niveau === 'moderate' ? 'modéré' : 'élevé ⚠️'}
                </p>
              )
            })}
            {fiche.nova !== null && (
              <p className={`py-0.5 text-corps-2 ${fiche.nova >= 4 ? 'font-[590] text-urgent' : 'text-encre-2'}`}>
                {fiche.nova >= 4 ? '⚠️ Ultra-transformé (NOVA 4)' : `Transformation : NOVA ${fiche.nova}`}
              </p>
            )}
            {fiche.additifs.length > 0 && (
              <p className="py-0.5 text-corps-2 text-encre-2">
                🧪 {fiche.additifs.length} additif{fiche.additifs.length > 1 ? 's' : ''} :{' '}
                {fiche.additifs.slice(0, 6).join(', ')}
                {fiche.additifs.length > 6 ? '…' : ''}
              </p>
            )}
            {fiche.allergenes.length > 0 && (
              <p className="py-0.5 text-corps-2 text-urgent">⚠️ Allergènes : {fiche.allergenes.join(', ')}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Bouton pleineLargeur variante="valider" desactive={ajoute === 'courses'} onClick={ajouterAuxCourses}>
              {ajoute === 'courses' ? '✓ Ajouté aux courses' : '🛒 Ajouter aux courses'}
            </Bouton>
            <div className="flex gap-2">
              {[['congelo', '🧊 Congélo'], ['frigo', '❄️ Frigo'], ['placard', '🥫 Placard']].map(([zone, libelle]) => (
                <Bouton key={zone} variante="discret" desactive={ajoute === zone} onClick={() => ajouterAuxPlacards(zone ?? '')}>
                  {ajoute === zone ? '✓' : libelle}
                </Bouton>
              ))}
            </div>
            <Bouton pleineLargeur variante="discret" onClick={rescanner}>📷 Scanner un autre</Bouton>
          </div>
        </div>
      )}
    </Feuille>
  )
}
