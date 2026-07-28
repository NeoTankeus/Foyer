// 🍽 LES BONNES ADRESSES — le carnet gourmand du foyer.
//
// Trois onglets :
//  • « À découvrir » : la sélection de STG pour un coin (guide écrit à la main
//    quand la région est couverte, complété par l'IA pour n'importe où) ;
//  • « Notre carnet » : VOS adresses, ajoutées, notées, modifiées, supprimées ;
//  • « Chez nous »   : le même travail, mais autour de la maison.
//
// Aucune donnée sensible : les adresses du carnet vivent dans les réglages du
// foyer, donc partagées entre Stéphane et Tiphaine, et jamais perdues.
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utiliserSession } from '@/etat/session'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'
import { EtatVide } from '@/design/composants/EtatVide'
import { Feuille } from '@/design/composants/Feuille'
import {
  CATEGORIES,
  emojiCategorie,
  libelleCategorie,
  lienAvis,
  lienInstagram,
  lienItineraire,
  lienSite,
  regionPour,
  type CategorieAdresse,
} from '@/lib/adresses-guide'

/** Une adresse du carnet du foyer — tout est modifiable, tout est effaçable. */
interface AdresseCarnet {
  id: string
  nom: string
  commune: string
  categorie: string
  quoi: string
  pourquoi: string
  prix: string
  conseil: string
  note: number // 0 à 5, 0 = pas encore noté
  coupDeCoeur: boolean
  ajouteeLe: string
}

/** Une fiche affichable, quelle que soit sa provenance. */
interface Fiche {
  nom: string
  commune: string
  categorie: string
  quoi: string
  pourquoi: string
  prix: string
  conseil: string
}

const PRIX = ['€', '€€', '€€€', '€€€€']

/** Le contenu des réglages est du JSON libre : on ne croit que la bonne forme. */
const carnetSur = (brut: unknown): AdresseCarnet[] => {
  if (!Array.isArray(brut)) return []
  const propre: AdresseCarnet[] = []
  for (const a of brut) {
    if (!a || typeof a !== 'object') continue
    const o = a as Record<string, unknown>
    const nom = String(o['nom'] ?? '').trim()
    if (!nom) continue
    propre.push({
      id: String(o['id'] ?? `${nom}-${propre.length}`),
      nom,
      commune: String(o['commune'] ?? ''),
      categorie: String(o['categorie'] ?? 'table'),
      quoi: String(o['quoi'] ?? ''),
      pourquoi: String(o['pourquoi'] ?? ''),
      prix: PRIX.includes(String(o['prix'] ?? '')) ? String(o['prix']) : '',
      conseil: String(o['conseil'] ?? ''),
      note: Number.isFinite(Number(o['note'])) ? Math.max(0, Math.min(5, Math.round(Number(o['note'])))) : 0,
      coupDeCoeur: o['coupDeCoeur'] === true,
      ajouteeLe: String(o['ajouteeLe'] ?? ''),
    })
  }
  return propre
}

/** Les liens d'une fiche : avis clients, site, Instagram, itinéraire. */
function LiensFiche({ nom, commune }: { nom: string; commune: string }) {
  const liens: { href: string; libelle: string }[] = [
    { href: lienAvis(nom, commune), libelle: '⭐ Avis & horaires' },
    { href: lienSite(nom, commune), libelle: '🌐 Site' },
    { href: lienInstagram(nom, commune), libelle: '📸 Instagram' },
    { href: lienItineraire(nom, commune), libelle: '🧭 Y aller' },
  ]
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {liens.map((l) => (
        <a
          key={l.libelle}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-sur-tactile flex items-center rounded-full bg-fond-sourd px-3 text-note font-[590] text-encre-2 active:bg-trait"
        >
          {l.libelle}
        </a>
      ))}
    </div>
  )
}

export function EcranAdresses() {
  const [parametres] = useSearchParams()
  const foyer = utiliserSession((e) => e.foyer)
  const membre = utiliserSession((e) => e.membre)
  const clientRequetes = useQueryClient()

  const lieuUrl = (parametres.get('lieu') ?? '').trim()
  const [onglet, setOnglet] = useState<'decouvrir' | 'carnet'>(lieuUrl ? 'decouvrir' : 'carnet')
  const [lieu, setLieu] = useState(lieuUrl)
  const [saisieLieu, setSaisieLieu] = useState(lieuUrl)
  const [envie, setEnvie] = useState('')
  const [filtre, setFiltre] = useState<CategorieAdresse | null>(null)
  const [enEdition, setEnEdition] = useState<AdresseCarnet | 'nouvelle' | null>(null)
  const [aSupprimer, setASupprimer] = useState<string | null>(null)

  // ——— Le carnet du foyer, relu du serveur ———
  const carnet = useQuery({
    queryKey: ['adresses-carnet'],
    enabled: !!foyer,
    staleTime: 15 * 1000,
    queryFn: async (): Promise<AdresseCarnet[]> => {
      const { data } = await supabase.from('foyers').select('reglages').eq('id', foyer?.id ?? '').single()
      const brut = data?.reglages as unknown
      const reglages = (brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {}) as Record<string, unknown>
      return carnetSur(reglages['adresses'])
    },
  })
  const mesAdresses = useMemo(() => {
    const liste = [...(carnet.data ?? [])]
    // Les coups de cœur d'abord, puis les mieux notées, puis l'alphabet.
    liste.sort(
      (a, b) =>
        Number(b.coupDeCoeur) - Number(a.coupDeCoeur) ||
        b.note - a.note ||
        (a.nom ?? '').localeCompare(b.nom ?? '', 'fr', { sensitivity: 'base' }),
    )
    return liste
  }, [carnet.data])

  /** Écrit le carnet après RELECTURE fraîche : rien de l'autre n'est écrasé. */
  const ecrireCarnet = async (transformer: (actuel: AdresseCarnet[]) => AdresseCarnet[]) => {
    if (!foyer) return
    const { data: frais } = await supabase.from('foyers').select('reglages').eq('id', foyer.id).single()
    const base = (frais?.reglages ?? foyer.reglages ?? {}) as Record<string, unknown>
    const suivant = transformer(carnetSur(base['adresses']))
    await supabase.from('foyers').update({ reglages: { ...base, adresses: suivant } }).eq('id', foyer.id)
    await clientRequetes.invalidateQueries({ queryKey: ['adresses-carnet'] })
  }

  const ajouterAuCarnet = async (f: Fiche) => {
    navigator.vibrate?.(8)
    await ecrireCarnet((actuel) => {
      // Pas de doublon : même nom, même commune.
      if (actuel.some((a) => a.nom.toLowerCase() === f.nom.toLowerCase() && a.commune.toLowerCase() === f.commune.toLowerCase())) {
        return actuel
      }
      return [
        ...actuel,
        {
          id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`,
          nom: f.nom,
          commune: f.commune,
          categorie: f.categorie,
          quoi: f.quoi,
          pourquoi: f.pourquoi,
          prix: f.prix,
          conseil: f.conseil,
          note: 0,
          coupDeCoeur: false,
          ajouteeLe: new Date().toISOString().slice(0, 10),
        },
      ]
    })
  }

  const dansLeCarnet = (nom: string, commune: string) =>
    mesAdresses.some(
      (a) => a.nom.toLowerCase() === nom.toLowerCase() && a.commune.toLowerCase() === commune.toLowerCase(),
    )

  // ——— La sélection de STG pour le lieu demandé ———
  const region = useMemo(() => regionPour(lieu), [lieu])

  const suggestions = useQuery({
    queryKey: ['adresses-ia', lieu, envie],
    enabled: onglet === 'decouvrir' && lieu.trim().length >= 2,
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<{ resume: string; adresses: Fiche[] }> => {
      const { data: session } = await supabase.auth.getSession()
      const r = await fetch('/api/bonnes-adresses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ lieu, envie }),
      })
      // On lit le corps MÊME en erreur : le serveur y met la vraie raison.
      const d = (await r.json().catch(() => null)) as {
        resume?: string
        adresses?: Fiche[]
        message?: string
      } | null
      if (!r.ok || !Array.isArray(d?.adresses)) {
        throw new Error(
          d?.message ??
            (r.status === 429
              ? 'Les IA sont saturées à l’instant — réessaie dans une minute.'
              : `Le serveur n’a pas répondu correctement (${r.status}).`),
        )
      }
      return { resume: String(d.resume ?? ''), adresses: d.adresses }
    },
  })

  // Le guide écrit à la main d'abord, les propositions de STG ensuite.
  const fichesGuide: Fiche[] = useMemo(
    () =>
      (region?.adresses ?? []).map((a) => ({
        nom: a.nom,
        commune: a.commune,
        categorie: a.categorie,
        quoi: a.quoi,
        pourquoi: a.pourquoi,
        prix: a.prix ?? '',
        conseil: a.conseil ?? '',
      })),
    [region],
  )
  const fichesIa: Fiche[] = useMemo(() => {
    const dejaLa = new Set(fichesGuide.map((f) => f.nom.toLowerCase()))
    return (suggestions.data?.adresses ?? []).filter((f) => !dejaLa.has(f.nom.toLowerCase()))
  }, [suggestions.data, fichesGuide])

  const filtrer = (liste: Fiche[]) => (filtre ? liste.filter((f) => f.categorie === filtre) : liste)

  const lancer = (ou: string) => {
    const propre = ou.trim()
    if (propre.length < 2) return
    navigator.vibrate?.(4)
    setLieu(propre)
    setSaisieLieu(propre)
    setOnglet('decouvrir')
  }

  const maison = (foyer?.reglages ?? {})['maison'] as { adresse?: string; nom?: string } | undefined
  const chezNous = String(maison?.adresse ?? maison?.nom ?? '').trim()

  return (
    <div className="pb-8">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🍽 Les Bonnes Adresses</h1>
        <p className="text-legende text-encre-3">
          Les maisons qu’on ne veut pas louper — et votre carnet à vous.
        </p>
        <div className="mt-2 flex gap-2">
          {(
            [
              ['decouvrir', '✨ À découvrir'],
              ['carnet', `📔 Notre carnet${mesAdresses.length > 0 ? ` (${mesAdresses.length})` : ''}`],
            ] as const
          ).map(([cle, libelle]) => (
            <button
              key={cle}
              onClick={() => {
                navigator.vibrate?.(4)
                setOnglet(cle)
              }}
              aria-pressed={onglet === cle}
              className={`min-h-sur-tactile flex-1 rounded-full px-3 text-note font-[590]
                ${onglet === cle ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
            >
              {libelle}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        {onglet === 'decouvrir' && (
          <>
            {/* Où ? Un voyage, chez nous, ou n'importe quel coin. */}
            <Carte>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  lancer(saisieLieu)
                }}
                className="flex gap-2"
              >
                <input
                  value={saisieLieu}
                  onChange={(e) => setSaisieLieu(e.target.value)}
                  placeholder="Pays basque, Saint-Jean-de-Luz, Lyon…"
                  aria-label="Quel endroit ?"
                  className="min-h-sur-tactile min-w-0 flex-1 rounded-lg bg-fond-sourd px-3 text-corps-2 text-encre"
                />
                <Bouton type="submit" variante="primaire" desactive={saisieLieu.trim().length < 2}>
                  Chercher
                </Bouton>
              </form>
              <input
                value={envie}
                onChange={(e) => setEnvie(e.target.value)}
                placeholder="Une envie ? (poisson, avec un enfant, petit budget…)"
                aria-label="Une envie particulière"
                className="mt-2 min-h-sur-tactile w-full rounded-lg bg-fond-sourd px-3 text-corps-2 text-encre"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {chezNous && (
                  <Bouton variante="discret" onClick={() => lancer(chezNous)}>
                    🏠 Chez nous
                  </Bouton>
                )}
                <Bouton variante="discret" onClick={() => lancer('Pays basque et sud des Landes')}>
                  🌊 Côte basque
                </Bouton>
              </div>
            </Carte>

            {lieu.trim().length < 2 && (
              <EtatVide
                titre="Où va-t-on ?"
                message="Tape un coin, une ville, une région — ou touche « Chez nous ». STG sort les vraies bonnes adresses, pas la liste des monuments."
              />
            )}

            {/* Le mot de la région, quand le guide la couvre. */}
            {region && (
              <Carte>
                <p className="text-corps-2 font-[590] text-encre">📖 {region.libelle}</p>
                <p className="mt-1 text-corps-2 text-encre-2">{region.resume}</p>
                <p className="mt-1 text-legende text-encre-3">
                  La sélection écrite à la main de STG — {region.adresses.length} adresses.
                </p>
              </Carte>
            )}

            {suggestions.data?.resume && (
              <Carte>
                <p className="text-corps-2 font-[590] text-encre">✨ Ce qu’il faut savoir</p>
                <p className="mt-1 text-corps-2 text-encre-2">{suggestions.data.resume}</p>
              </Carte>
            )}

            {/* Filtrer par famille d'adresses. */}
            {fichesGuide.length + fichesIa.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  onClick={() => setFiltre(null)}
                  aria-pressed={filtre === null}
                  className={`min-h-sur-tactile shrink-0 rounded-full px-3 text-note font-[590]
                    ${filtre === null ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-3'}`}
                >
                  Tout
                </button>
                {CATEGORIES.filter((c) => [...fichesGuide, ...fichesIa].some((f) => f.categorie === c.cle)).map((c) => (
                  <button
                    key={c.cle}
                    onClick={() => setFiltre(filtre === c.cle ? null : c.cle)}
                    aria-pressed={filtre === c.cle}
                    className={`min-h-sur-tactile shrink-0 rounded-full px-3 text-note font-[590]
                      ${filtre === c.cle ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-3'}`}
                  >
                    {c.emoji} {c.libelle}
                  </button>
                ))}
              </div>
            )}

            {/* Les fiches du guide écrit à la main. */}
            {filtrer(fichesGuide).map((f) => (
              <Carte key={`guide-${f.nom}-${f.commune}`}>
                <p className="text-corps-2 font-[590] text-encre">
                  {emojiCategorie(f.categorie)} {f.nom}
                  {f.prix && <span className="ml-1 text-encre-3">{f.prix}</span>}
                </p>
                <p className="text-legende text-encre-3">
                  {f.commune} · {libelleCategorie(f.categorie)}
                </p>
                <p className="mt-1 text-corps-2 text-encre-2">{f.quoi}</p>
                <p className="mt-1 text-corps-2 text-encre">{f.pourquoi}</p>
                {f.conseil && <p className="mt-1 text-legende text-ardoise">💡 {f.conseil}</p>}
                <LiensFiche nom={f.nom} commune={f.commune} />
                <div className="mt-2">
                  <Bouton
                    variante="discret"
                    desactive={dansLeCarnet(f.nom, f.commune)}
                    onClick={() => void ajouterAuCarnet(f)}
                  >
                    {dansLeCarnet(f.nom, f.commune) ? '✓ Dans notre carnet' : '➕ Ajouter à notre carnet'}
                  </Bouton>
                </div>
              </Carte>
            ))}

            {suggestions.isPending && lieu.trim().length >= 2 && (
              <p className="py-4 text-center text-corps-2 text-encre-3">🍽 STG cherche les bonnes adresses…</p>
            )}
            {suggestions.isError && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-center text-corps-2 text-encre-3">
                  {suggestions.error instanceof Error ? suggestions.error.message : 'Les propositions n’ont pas pu être chargées.'}
                </p>
                <Bouton variante="discret" onClick={() => void suggestions.refetch()}>🔄 Réessayer</Bouton>
              </div>
            )}

            {filtrer(fichesIa).length > 0 && (
              <p className="mt-1 text-legende text-encre-3">
                Et les trouvailles de STG pour ce coin — à vérifier avant d’y aller (touche « Avis & horaires ») :
              </p>
            )}
            {filtrer(fichesIa).map((f, i) => (
              <Carte key={`ia-${f.nom}-${i}`}>
                <p className="text-corps-2 font-[590] text-encre">
                  {emojiCategorie(f.categorie)} {f.nom}
                  {f.prix && <span className="ml-1 text-encre-3">{f.prix}</span>}
                </p>
                <p className="text-legende text-encre-3">
                  {f.commune} · {libelleCategorie(f.categorie)}
                </p>
                {f.quoi && <p className="mt-1 text-corps-2 text-encre-2">{f.quoi}</p>}
                {f.pourquoi && <p className="mt-1 text-corps-2 text-encre">{f.pourquoi}</p>}
                {f.conseil && <p className="mt-1 text-legende text-ardoise">💡 {f.conseil}</p>}
                <LiensFiche nom={f.nom} commune={f.commune} />
                <div className="mt-2">
                  <Bouton
                    variante="discret"
                    desactive={dansLeCarnet(f.nom, f.commune)}
                    onClick={() => void ajouterAuCarnet(f)}
                  >
                    {dansLeCarnet(f.nom, f.commune) ? '✓ Dans notre carnet' : '➕ Ajouter à notre carnet'}
                  </Bouton>
                </div>
              </Carte>
            ))}
          </>
        )}

        {onglet === 'carnet' && (
          <>
            <Bouton pleineLargeur variante="primaire" onClick={() => setEnEdition('nouvelle')}>
              ➕ Ajouter une adresse
            </Bouton>

            {carnet.isPending && <p className="py-4 text-center text-corps-2 text-encre-3">📔 Ouverture du carnet…</p>}

            {!carnet.isPending && mesAdresses.length === 0 && (
              <EtatVide
                titre="Le carnet est vide"
                message="Ajoute vos tables, vos producteurs, vos coups de cœur — ou pioche dans « À découvrir » : chaque fiche a un bouton pour l’ajouter ici."
              />
            )}

            {mesAdresses.map((a) => (
              <Carte key={a.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-corps-2 font-[590] text-encre">
                      {a.coupDeCoeur ? '❤️ ' : ''}
                      {emojiCategorie(a.categorie)} {a.nom}
                      {a.prix && <span className="ml-1 text-encre-3">{a.prix}</span>}
                    </p>
                    <p className="text-legende text-encre-3">
                      {[a.commune, libelleCategorie(a.categorie)].filter(Boolean).join(' · ')}
                      {a.note > 0 ? ` · ${'★'.repeat(a.note)}${'☆'.repeat(5 - a.note)}` : ''}
                    </p>
                  </div>
                  {membre?.role === 'adult' && (
                    <button
                      onClick={() => setEnEdition(a)}
                      aria-label={`Modifier ${a.nom}`}
                      className="min-h-sur-tactile shrink-0 px-2 text-corps-2"
                    >
                      ✏️
                    </button>
                  )}
                </div>
                {a.quoi && <p className="mt-1 text-corps-2 text-encre-2">{a.quoi}</p>}
                {a.pourquoi && <p className="mt-1 text-corps-2 text-encre">{a.pourquoi}</p>}
                {a.conseil && <p className="mt-1 text-legende text-ardoise">💡 {a.conseil}</p>}
                <LiensFiche nom={a.nom} commune={a.commune} />
              </Carte>
            ))}
          </>
        )}
      </div>

      {/* La fiche d'édition — création, modification, suppression. */}
      <Feuille
        ouverte={enEdition !== null}
        onFermer={() => {
          setEnEdition(null)
          setASupprimer(null)
        }}
        titre={enEdition === 'nouvelle' ? '➕ Une adresse' : '✏️ Modifier'}
      >
        {enEdition !== null && (
          <FormAdresse
            initiale={enEdition === 'nouvelle' ? null : enEdition}
            aSupprimer={aSupprimer}
            surSupprimerDemande={setASupprimer}
            surEnregistrer={async (valeur) => {
              await ecrireCarnet((actuel) =>
                enEdition === 'nouvelle'
                  ? [...actuel, { ...valeur, id: `${Date.now()}-${Math.round(Math.random() * 1e6)}` }]
                  : actuel.map((a) => (a.id === enEdition.id ? { ...valeur, id: a.id } : a)),
              )
              setEnEdition(null)
              setASupprimer(null)
            }}
            surSupprimer={async () => {
              if (enEdition === 'nouvelle') return
              await ecrireCarnet((actuel) => actuel.filter((a) => a.id !== enEdition.id))
              setEnEdition(null)
              setASupprimer(null)
            }}
          />
        )}
      </Feuille>
    </div>
  )
}

// ————————————————————————— Le formulaire —————————————————————————

function FormAdresse({
  initiale,
  aSupprimer,
  surSupprimerDemande,
  surEnregistrer,
  surSupprimer,
}: {
  initiale: AdresseCarnet | null
  aSupprimer: string | null
  surSupprimerDemande: (id: string | null) => void
  surEnregistrer: (valeur: Omit<AdresseCarnet, 'id'>) => Promise<void>
  surSupprimer: () => Promise<void>
}) {
  const [nom, setNom] = useState(initiale?.nom ?? '')
  const [commune, setCommune] = useState(initiale?.commune ?? '')
  const [categorie, setCategorie] = useState<string>(initiale?.categorie ?? 'table')
  const [quoi, setQuoi] = useState(initiale?.quoi ?? '')
  const [pourquoi, setPourquoi] = useState(initiale?.pourquoi ?? '')
  const [prix, setPrix] = useState(initiale?.prix ?? '')
  const [conseil, setConseil] = useState(initiale?.conseil ?? '')
  const [note, setNote] = useState(initiale?.note ?? 0)
  const [coupDeCoeur, setCoupDeCoeur] = useState(initiale?.coupDeCoeur ?? false)
  const [enCours, setEnCours] = useState(false)

  const champ = 'min-h-sur-tactile w-full rounded-lg bg-fond-sourd px-3 text-corps-2 text-encre'

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!nom.trim() || enCours) return
        setEnCours(true)
        void surEnregistrer({
          nom: nom.trim(),
          commune: commune.trim(),
          categorie,
          quoi: quoi.trim(),
          pourquoi: pourquoi.trim(),
          prix,
          conseil: conseil.trim(),
          note,
          coupDeCoeur,
          ajouteeLe: initiale?.ajouteeLe || new Date().toISOString().slice(0, 10),
        }).finally(() => setEnCours(false))
      }}
      className="flex flex-col gap-2"
    >
      <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Le nom" aria-label="Nom" className={champ} />
      <input
        value={commune}
        onChange={(e) => setCommune(e.target.value)}
        placeholder="La commune"
        aria-label="Commune"
        className={champ}
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.cle}
            type="button"
            onClick={() => setCategorie(c.cle)}
            aria-pressed={categorie === c.cle}
            className={`min-h-sur-tactile shrink-0 rounded-full px-3 text-note font-[590]
              ${categorie === c.cle ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-3'}`}
          >
            {c.emoji} {c.libelle}
          </button>
        ))}
      </div>

      <textarea
        value={quoi}
        onChange={(e) => setQuoi(e.target.value)}
        placeholder="Ce que c’est, en une ligne"
        aria-label="Ce que c’est"
        rows={2}
        className="w-full rounded-lg bg-fond-sourd p-3 text-corps-2 text-encre"
      />
      <textarea
        value={pourquoi}
        onChange={(e) => setPourquoi(e.target.value)}
        placeholder="Pourquoi on y retourne — le plat, le moment, l’ambiance"
        aria-label="Pourquoi"
        rows={3}
        className="w-full rounded-lg bg-fond-sourd p-3 text-corps-2 text-encre"
      />
      <input
        value={conseil}
        onChange={(e) => setConseil(e.target.value)}
        placeholder="Un conseil (réserver, jour de fermeture, quoi commander)"
        aria-label="Conseil"
        className={champ}
      />

      <div className="flex flex-wrap items-center gap-2">
        {PRIX.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPrix(prix === p ? '' : p)}
            aria-pressed={prix === p}
            className={`min-h-sur-tactile rounded-full px-3 text-note font-[590]
              ${prix === p ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-3'}`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-corps-2 text-encre-2">Note :</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setNote(note === n ? 0 : n)}
            aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
            className="min-h-sur-tactile px-1 text-corps"
          >
            {n <= note ? '★' : '☆'}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setCoupDeCoeur((v) => !v)}
        aria-pressed={coupDeCoeur}
        className={`min-h-sur-tactile rounded-full px-4 text-note font-[590]
          ${coupDeCoeur ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-3'}`}
      >
        ❤️ Coup de cœur
      </button>

      <Bouton type="submit" pleineLargeur variante="valider" desactive={!nom.trim() || enCours}>
        {enCours ? 'Enregistrement…' : 'Enregistrer'}
      </Bouton>

      {initiale && (
        <Bouton
          pleineLargeur
          variante="discret"
          onClick={() => {
            // Deux appuis : on ne supprime jamais une adresse par accident.
            if (aSupprimer === initiale.id) void surSupprimer()
            else surSupprimerDemande(initiale.id)
          }}
        >
          {aSupprimer === initiale.id ? '⚠️ Confirmer la suppression' : '🗑 Supprimer cette adresse'}
        </Bouton>
      )}
    </form>
  )
}
