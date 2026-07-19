// Le Comparateur : en boutique, on scanne le code-barres — Gastif identifie
// le produit et ouvre les prix internet. Acheter malin, décider sur place.
import { useEffect, useRef, useState } from 'react'
import type { IScannerControls } from '@zxing/browser'
import { decoderBillet } from '@/fonctionnalites/voyages/billets'
import { utiliserSession } from '@/etat/session'
import { ajouterArticle, utiliserListeCourses } from '@/lib/requetes'
import { devinerRayon } from '@/fonctionnalites/courses/rayons'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'
import { BarreRetour } from '@/design/composants/BarreRetour'

interface Produit {
  nom: string | null
  marque: string | null
  quantite: string | null
  image: string | null
}

/** Identité du produit par son code-barres : Open Food Facts, puis Open Products Facts. */
async function identifierProduit(code: string): Promise<Produit | null> {
  const bases = [
    'https://world.openfoodfacts.org',
    'https://world.openproductsfacts.org',
    'https://world.openbeautyfacts.org',
  ]
  for (const base of bases) {
    try {
      const reponse = await fetch(
        `${base}/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,image_url,quantity`,
      )
      if (!reponse.ok) continue
      const donnees = (await reponse.json()) as {
        status?: number
        product?: { product_name?: string; brands?: string; image_url?: string; quantity?: string }
      }
      if (donnees.status === 1 && donnees.product) {
        return {
          nom: donnees.product.product_name || null,
          marque: donnees.product.brands || null,
          quantite: donnees.product.quantity || null,
          image: donnees.product.image_url || null,
        }
      }
    } catch {
      // base suivante
    }
  }
  return null
}

export function EcranComparateur() {
  const { membre } = utiliserSession()
  const courses = utiliserListeCourses()
  const [code, setCode] = useState<string | null>(null)
  const [produit, setProduit] = useState<Produit | null>(null)
  const [etat, setEtat] = useState<'scan' | 'recherche' | 'resultat' | 'erreur-camera'>('scan')
  const [saisie, setSaisie] = useState('')
  const [ajoute, setAjoute] = useState(false)
  const [analysePhoto, setAnalysePhoto] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const controles = useRef<IScannerControls | null>(null)

  const traiterCode = async (brut: string) => {
    const propre = brut.trim()
    if (!propre) return
    controles.current?.stop()
    navigator.vibrate?.(30)
    setCode(propre)
    setAjoute(false)
    setEtat('recherche')
    setProduit(await identifierProduit(propre))
    setEtat('resultat')
  }

  // Scan en direct par la caméra arrière — le code est attrapé au vol.
  useEffect(() => {
    let arrete = false
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
            if (resultat && !arrete) {
              arrete = true
              void traiterCode(resultat.getText())
            }
          },
        )
      } catch {
        setEtat('erreur-camera')
      }
    })()
    return () => {
      arrete = true
      controles.current?.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const photoSecours = async (fichier: File) => {
    setAnalysePhoto(true)
    try {
      const decode = await decoderBillet(fichier)
      if (decode) await traiterCode(decode.texte)
    } finally {
      setAnalysePhoto(false)
    }
  }

  const requete = (() => {
    if (produit?.nom) return [produit.marque, produit.nom, produit.quantite].filter(Boolean).join(' ')
    return code ?? ''
  })()

  const COMPARATEURS: { nom: string; url: (q: string, ean: string) => string }[] = [
    { nom: '🔎 Google Shopping', url: (q, ean) => `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(ean || q)}` },
    { nom: '🏷 Idealo', url: (q, ean) => `https://www.idealo.fr/prechcat.html?q=${encodeURIComponent(ean || q)}` },
    { nom: '🛒 Amazon', url: (q, ean) => `https://www.amazon.fr/s?k=${encodeURIComponent(ean || q)}` },
    { nom: '📦 LeDénicheur', url: (q, ean) => `https://ledenicheur.fr/search?query=${encodeURIComponent(ean || q)}` },
  ]

  const rescanner = () => {
    setCode(null)
    setProduit(null)
    setEtat('scan')
    window.location.reload() // le plus fiable pour relancer la caméra proprement
  }

  return (
    <div className="px-5 pb-6 pt-3">
      <BarreRetour vers="/nous" />
      <h2 className="pb-1 text-titre-3 text-encre">🏷 Comparateur de prix</h2>
      <p className="pb-3 text-note text-encre-3">
        En boutique : vise le code-barres — StiGa identifie le produit et ouvre ses prix sur internet.
      </p>

      {(etat === 'scan' || etat === 'erreur-camera') && (
        <>
          <div className="relative overflow-hidden rounded-xl bg-encre" style={{ aspectRatio: '3/4' }}>
            <video ref={video} className="h-full w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 rounded bg-corail opacity-80" />
          </div>
          {etat === 'erreur-camera' && (
            <p className="mt-2 text-corps-2 text-encre-3">
              Caméra indisponible — autorise-la dans Réglages → StiGa, ou utilise la photo / la saisie ci-dessous.
            </p>
          )}
          <div className="mt-3 flex flex-col gap-2">
            <label className="btn-3d btn-clair inline-flex min-h-sur-tactile cursor-pointer items-center justify-center px-4 py-2.5 text-center text-corps-2 leading-tight">
              {analysePhoto ? 'Analyse…' : '📷 Photographier le code-barres'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const fichier = e.target.files?.[0]
                  if (fichier) void photoSecours(fichier)
                  e.target.value = ''
                }}
              />
            </label>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void traiterCode(saisie)
              }}
            >
              <input
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                inputMode="numeric"
                placeholder="Ou tape le code-barres (13 chiffres)"
                aria-label="Code-barres"
                className="chiffres min-h-sur-tactile w-full min-w-0 flex-1 rounded-md border border-trait bg-fond-eleve px-3 text-corps"
              />
              <Bouton type="submit" variante="valider" desactive={!saisie.trim()}>OK</Bouton>
            </form>
          </div>
        </>
      )}

      {etat === 'recherche' && (
        <Carte>
          <p className="py-4 text-center text-corps text-encre-2">🔎 Identification du produit…</p>
        </Carte>
      )}

      {etat === 'resultat' && code && (
        <div className="flex flex-col gap-3">
          <Carte>
            <div className="flex items-center gap-3">
              {produit?.image && (
                <img src={produit.image} alt="" className="h-20 w-20 shrink-0 rounded-md object-contain" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-corps font-[590] text-encre">
                  {produit?.nom ?? 'Produit non répertorié'}
                </p>
                <p className="text-legende text-encre-3">
                  {[produit?.marque, produit?.quantite].filter(Boolean).join(' · ')}
                </p>
                <p className="chiffres text-legende text-encre-3">Code {code}</p>
              </div>
            </div>
            {!produit?.nom && (
              <p className="mt-2 text-legende text-encre-3">
                Inconnu des bases publiques (courant hors alimentaire) — les comparateurs ci-dessous
                cherchent directement par le code.
              </p>
            )}
          </Carte>

          <Carte>
            <h3 className="mb-2 text-note font-[590] uppercase tracking-wide text-encre-3">
              💶 Les prix sur internet
            </h3>
            <div className="flex flex-wrap gap-2">
              {COMPARATEURS.map((c) => (
                <a
                  key={c.nom}
                  href={c.url(requete, code)}
                  target="_blank"
                  rel="noopener"
                  className="btn-3d btn-clair inline-flex min-h-sur-tactile items-center justify-center px-4 py-2.5 text-center text-corps-2 leading-tight"
                >
                  {c.nom}
                </a>
              ))}
            </div>
            <p className="mt-2 text-legende text-encre-3">
              Compare avec l’étiquette du magasin — s’il y a une vraie différence, commande en ligne.
            </p>
          </Carte>

          <div className="flex flex-wrap gap-2">
            {courses.data?.liste && membre && produit?.nom && (
              <Bouton
                variante="valider"
                desactive={ajoute}
                onClick={() => {
                  const libelle = produit.nom ?? ''
                  void ajouterArticle(courses.data?.liste?.id ?? '', membre.id, libelle, devinerRayon(libelle)).then(() =>
                    setAjoute(true),
                  )
                }}
              >
                {ajoute ? '✓ Ajouté aux courses' : '🛒 Ajouter aux courses'}
              </Bouton>
            )}
            <Bouton variante="discret" onClick={rescanner}>📷 Scanner un autre</Bouton>
          </div>
        </div>
      )}
    </div>
  )
}
