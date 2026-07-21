// 📬 La Boîte aux lettres : colle N'IMPORTE quel email ou texte (confirmation
// de commande, convocation école, garantie…) — STG le lit et range tout au
// bon endroit : colis suivi, agenda, Coffre, courses, mur. Zéro saisie.
import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { utiliserSession } from '@/etat/session'
import { ajouterArticle, creerEvenement, utiliserListeCourses } from '@/lib/requetes'
import { devinerRayon } from '@/fonctionnalites/courses/rayons'
import { versUtc } from '@/lib/dates'
import { compresserImage } from '@/fonctionnalites/souvenirs/donnees'
import { decoderBillet } from '@/fonctionnalites/voyages/billets'
import { enImages } from '@/lib/pdf'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'

// Une pièce jointe : l'aperçu compressé pour l'affichage/stockage, et le
// fichier ORIGINAL pleine résolution pour décoder le QR du billet.
interface PieceJointe {
  apercu: string
  fichier: File
}

interface Tri {
  resume?: string
  colis?: { numero: string; transporteur: string | null; libelle: string }[]
  evenements?: { titre: string; date: string; heure: string | null; lieu: string | null }[]
  documents?: { titre: string; type: string; expire_le: string | null }[]
  articles?: string[]
  notes?: string[]
}

const TRANSPORTEURS = ['laposte', 'colissimo', 'chronopost', 'mondial_relay', 'ups'] as const

export function EcranCourrier() {
  const { membre, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const courses = utiliserListeCourses()
  const [texte, setTexte] = useState('')
  const [tri, setTri] = useState<Tri | null>(null)
  const [pieces, setPieces] = useState<PieceJointe[]>([])
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [fini, setFini] = useState<string | null>(null)
  const champPieces = useRef<HTMLInputElement>(null)

  const ajouterPieces = async (fichiers: FileList | null) => {
    if (!fichiers) return
    setErreur(null)
    try {
      // Un PDF devient une image par page (billets multiples dans un seul PDF !).
      const images = (await Promise.all([...fichiers].map((f) => enImages(f)))).flat()
      const nouvelles = await Promise.all(
        images.map(async (fichier) => ({ apercu: await compresserImage(fichier), fichier })),
      )
      setPieces((p) => [...p, ...nouvelles])
    } catch {
      setErreur('Cette pièce jointe n’a pas pu être lue — réessaie ou envoie une capture d’écran.')
    }
  }

  // Chaque pièce jointe devient un billet du portefeuille Concerts & sorties :
  // QR décodé sur l'original (régénérable à l'entrée), infos reprises du tri.
  const rangerPieces = async (): Promise<number> => {
    if (!foyer) return 0
    const evenement = tri?.evenements?.[0]
    for (const [rang, piece] of pieces.entries()) {
      const decode = await decoderBillet(piece.fichier).catch(() => null)
      const id = crypto.randomUUID()
      await muter({
        table: 'concerts', type: 'insert', cible_id: id,
        charge: {
          id, foyer_id: foyer.id,
          titre: `${evenement?.titre ?? tri?.resume ?? 'Billet'}${pieces.length > 1 ? ` (${rang + 1}/${pieces.length})` : ''}`,
          lieu: evenement?.lieu ?? null,
          date_evenement: evenement?.date
            ? new Date(`${evenement.date}T${evenement.heure ?? '20:00'}:00`).toISOString()
            : null,
          codes_acces: decode?.texte ?? null, format: decode?.format ?? null,
          image_donnees: piece.apercu, notes: tri?.resume ?? null,
        },
      })
    }
    const n = pieces.length
    setPieces([])
    return n
  }

  const analyser = async () => {
    setEnCours(true)
    setErreur(null)
    setTri(null)
    try {
      const { data: session } = await supabase.auth.getSession()
      const reponse = await fetch('/api/trier-courrier', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          texte,
          aujourdhui: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        }),
      })
      const donnees = (await reponse.json()) as { proposition?: Tri; message?: string }
      if (donnees.proposition) setTri(donnees.proposition)
      else setErreur(donnees.message ?? 'STG n’a pas compris ce courrier — réessaie.')
    } catch {
      setErreur('Pas de réseau — réessaie.')
    } finally {
      setEnCours(false)
    }
  }

  const toutRanger = async () => {
    if (!tri || !foyer || !membre) return
    let n = 0
    n += await rangerPieces()
    for (const c of tri.colis ?? []) {
      if (!c.numero) continue
      const id = crypto.randomUUID()
      const transporteur = TRANSPORTEURS.find((t) => (c.transporteur ?? '').toLowerCase().includes(t.split('_')[0] ?? t)) ?? 'autre'
      await muter({
        table: 'colis', type: 'insert', cible_id: id,
        charge: {
          id, foyer_id: foyer.id, transporteur, numero: c.numero,
          libelle: c.libelle || null, statut: 'attendu', dernier_evenement: null,
          eta: null, destinataire_id: null, livre_le: null, cree_le: new Date().toISOString(),
        },
      })
      n += 1
    }
    for (const e of tri.evenements ?? []) {
      if (!e.date) continue
      const debut = new Date(`${e.date}T${e.heure ?? '09:00'}:00`)
      await creerEvenement(foyer.id, membre.id, {
        titre: e.titre, debut_a: versUtc(debut), fin_a: versUtc(new Date(debut.getTime() + 3600_000)),
        lieu: e.lieu, participants: [], journee_entiere: e.heure === null,
      })
      n += 1
    }
    for (const d of tri.documents ?? []) {
      const id = crypto.randomUUID()
      await muter({
        table: 'documents', type: 'insert', cible_id: id,
        charge: {
          id, foyer_id: foyer.id, titre: d.titre,
          type: ['garantie', 'assurance', 'ecole', 'sante'].includes(d.type) ? d.type : 'autre',
          membre_id: null, expire_le: d.expire_le, file_path: null, rappels: [30, 7],
          cree_le: new Date().toISOString(),
        },
      })
      n += 1
    }
    if (courses.data?.liste) {
      for (const a of tri.articles ?? []) {
        await ajouterArticle(courses.data.liste.id, membre.id, a, devinerRayon(a))
        n += 1
      }
    }
    for (const note of tri.notes ?? []) {
      const id = crypto.randomUUID()
      await muter({
        table: 'mur', type: 'insert', cible_id: id,
        charge: {
          id, foyer_id: foyer.id, auteur_id: membre.id, type: 'note', contenu: `📬 ${note}`,
          media_url: null, epingle: false, expire_le: new Date(Date.now() + 30 * 86400000).toISOString(),
        },
      })
      n += 1
    }
    await Promise.all(
      ['colis', 'evenements', 'courses', 'mur', 'documents', 'concerts'].map((cle) =>
        clientRequetes.invalidateQueries({ queryKey: [cle] }),
      ),
    )
    setTri(null)
    setTexte('')
    setFini(`📬 ${n} chose${n > 1 ? 's' : ''} rangée${n > 1 ? 's' : ''} au bon endroit ✓`)
    window.setTimeout(() => setFini(null), 3000)
  }

  const total = tri
    ? (tri.colis?.length ?? 0) + (tri.evenements?.length ?? 0) + (tri.documents?.length ?? 0) +
      (tri.articles?.length ?? 0) + (tri.notes?.length ?? 0) + pieces.length
    : 0

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">📬 La Boîte aux lettres</h1>
        <p className="text-legende text-encre-3">Colle un email — STG range tout, zéro saisie.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <p className="text-corps-2 text-encre-2">
          Confirmation de commande, convocation de l'école, contrat, garantie, billet… Ouvre l'email sur ton
          téléphone, <strong>sélectionne tout → copie</strong>, colle ici : STG détecte les numéros de suivi, les
          rendez-vous, les échéances, les choses à acheter — et range chaque élément dans le bon module.
        </p>

        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          rows={7}
          placeholder="Colle ici le contenu de l'email ou du courrier…"
          aria-label="Contenu du courrier à trier"
          className="w-full rounded-md border border-trait bg-fond-eleve px-3 py-2 text-corps-2 text-encre"
        />

        {/* 🎫 Les pièces jointes : billets, e-billets, captures d'écran — en
            plusieurs exemplaires. Elles filent dans le portefeuille de billets. */}
        <input
          ref={champPieces} type="file" accept="image/*,application/pdf,.pdf" multiple hidden aria-hidden="true"
          onChange={(e) => { void ajouterPieces(e.target.files); e.target.value = '' }}
        />
        <Bouton pleineLargeur variante="discret" onClick={() => champPieces.current?.click()}>
          🎫 Joindre les billets (PDF ou photos) {pieces.length > 0 ? `(${pieces.length})` : ''}
        </Bouton>
        {pieces.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pieces.map((piece, i) => (
              <div key={i} className="relative">
                <img src={piece.apercu} alt={`Pièce jointe ${i + 1}`} className="h-20 w-20 rounded-md object-cover shadow-carte" />
                <button
                  onClick={() => setPieces((p) => p.filter((_, j) => j !== i))}
                  aria-label={`Retirer la pièce jointe ${i + 1}`}
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-encre text-[11px] text-white shadow-carte"
                >
                  ✕
                </button>
              </div>
            ))}
            <p className="w-full text-legende text-encre-3">
              Chaque pièce deviendra un billet dans 🎟 Concerts & sorties (QR prêt pour l'entrée).
            </p>
          </div>
        )}

        <Bouton pleineLargeur variante="primaire" desactive={!texte.trim() || enCours} onClick={() => void analyser()}>
          {enCours ? 'STG lit le courrier…' : '📬 STG, trie ça !'}
        </Bouton>

        {/* Des billets sans texte à analyser ? On peut les ranger directement. */}
        {pieces.length > 0 && !tri && !enCours && (
          <Bouton
            pleineLargeur variante="valider"
            onClick={() => {
              void rangerPieces().then(async (n) => {
                await clientRequetes.invalidateQueries({ queryKey: ['concerts'] })
                setFini(`🎫 ${n} billet${n > 1 ? 's' : ''} rangé${n > 1 ? 's' : ''} dans Concerts & sorties ✓`)
                window.setTimeout(() => setFini(null), 3000)
              })
            }}
          >
            🎫 Ranger {pieces.length > 1 ? `les ${pieces.length} billets` : 'le billet'} ✓
          </Bouton>
        )}

        {erreur && <p className="text-corps-2 text-urgent">{erreur}</p>}
        {fini && <p className="text-center text-corps font-[590] text-fait">{fini}</p>}

        {tri && (
          <Carte>
            {tri.resume && <p className="mb-2 text-corps-2 text-encre-2">📄 « {tri.resume} »</p>}
            <div className="flex flex-col gap-1 text-corps-2 text-encre">
              {(tri.colis ?? []).map((c, i) => (
                <p key={`c${i}`}>📦 Colis {c.libelle || c.numero} — suivi {c.numero}</p>
              ))}
              {(tri.evenements ?? []).map((e, i) => (
                <p key={`e${i}`}>📅 {e.titre} — {new Date(`${e.date}T12:00:00`).toLocaleDateString('fr-FR')}{e.heure ? ` à ${e.heure}` : ''}</p>
              ))}
              {(tri.documents ?? []).map((d, i) => (
                <p key={`d${i}`}>🗄️ {d.titre} ({d.type}){d.expire_le ? ` — expire le ${new Date(`${d.expire_le}T12:00:00`).toLocaleDateString('fr-FR')}` : ''}</p>
              ))}
              {(tri.articles ?? []).map((a, i) => (
                <p key={`a${i}`}>🛒 {a}</p>
              ))}
              {(tri.notes ?? []).map((note, i) => (
                <p key={`n${i}`}>🧲 {note}</p>
              ))}
              {pieces.length > 0 && (
                <p>🎫 {pieces.length} billet{pieces.length > 1 ? 's' : ''} → Concerts & sorties</p>
              )}
              {total === 0 && <p className="text-encre-3">Rien d'actionnable détecté dans ce texte.</p>}
            </div>
            {total > 0 && (
              <div className="mt-3 flex gap-2">
                <Bouton pleineLargeur variante="valider" onClick={() => void toutRanger()}>
                  Tout ranger ({total}) ✓
                </Bouton>
                <Bouton variante="discret" onClick={() => setTri(null)}>Annuler</Bouton>
              </div>
            )}
          </Carte>
        )}
      </div>
    </div>
  )
}
