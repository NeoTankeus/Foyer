// La boîte à souvenirs : photos classées par dossier ET par voyage, géolocalisées,
// commentées, cherchables. Appareil photo ou pellicule, favoris, album imprimable.
import { useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { utiliserSession } from '@/etat/session'
import { muter } from '@/lib/sync'
import { utiliserVoyages } from '@/fonctionnalites/voyages/donnees'
import { ajouterSouvenir, compresserImage, positionActuelle, utiliserSouvenirs } from './donnees'
import type { LigneSouvenir } from '@/lib/basedonnees.types'
import { Bouton } from '@/design/composants/Bouton'
import { BoutonEnvoi } from '@/design/composants/BoutonEnvoi'
import { Feuille } from '@/design/composants/Feuille'
import { EtatVide } from '@/design/composants/EtatVide'
import { BarreRetour } from '@/design/composants/BarreRetour'

export function EcranSouvenirs() {
  const { membre, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const naviguer = useNavigate()
  const souvenirs = utiliserSouvenirs()
  const voyages = utiliserVoyages()
  const [parametres] = useSearchParams()
  const [filtre, setFiltre] = useState<{ type: 'tous' } | { type: 'voyage'; id: string } | { type: 'dossier'; nom: string }>(() => {
    const dossierDemande = parametres.get('dossier')
    return dossierDemande ? { type: 'dossier', nom: dossierDemande } : { type: 'tous' }
  })
  const [recherche, setRecherche] = useState('')
  const [ouvert, setOuvert] = useState<LigneSouvenir | null>(null)
  const [commentaire, setCommentaire] = useState('')
  const [ajoutEnCours, setAjoutEnCours] = useState(false)
  const [progres, setProgres] = useState<{ fait: number; total: number } | null>(null)
  const [selection, setSelection] = useState<Set<string> | null>(null)
  const champCamera = useRef<HTMLInputElement>(null)
  const champPellicule = useRef<HTMLInputElement>(null)

  const rafraichir = () => clientRequetes.invalidateQueries({ queryKey: ['souvenirs'] })

  // Les dossiers existent dès qu'une photo les porte — pas de table à gérer.
  const dossiers = useMemo(() => {
    const noms = new Set<string>()
    for (const s of souvenirs.data ?? []) if (s.dossier) noms.add(s.dossier)
    return [...noms].sort((a, b) => a.localeCompare(b))
  }, [souvenirs.data])

  const importer = async (fichiers: FileList | null) => {
    if (!fichiers || !membre || !foyer) return
    setAjoutEnCours(true)
    const liste = Array.from(fichiers)
    setProgres({ fait: 0, total: liste.length })
    const position = await positionActuelle()
    for (let i = 0; i < liste.length; i++) {
      const fichier = liste[i]
      if (!fichier) continue
      const image = await compresserImage(fichier)
      await ajouterSouvenir(foyer.id, membre.id, image, {
        voyage_id: filtre.type === 'voyage' ? filtre.id : null,
        dossier: filtre.type === 'dossier' ? filtre.nom : null,
        lieu: null,
        lat: position?.lat ?? null,
        lng: position?.lng ?? null,
      })
      setProgres({ fait: i + 1, total: liste.length })
    }
    await rafraichir()
    setAjoutEnCours(false)
    setProgres(null)
  }

  const creerDossier = () => {
    const nom = window.prompt('Nom du nouveau dossier ? (ex. Noël 2026, École, Dessins)')
    if (nom?.trim()) setFiltre({ type: 'dossier', nom: nom.trim() })
  }

  const filtres = (souvenirs.data ?? [])
    .filter((s) => {
      if (filtre.type === 'voyage') return s.voyage_id === filtre.id
      if (filtre.type === 'dossier') return s.dossier === filtre.nom
      return true
    })
    .filter((s) => {
      const q = recherche.trim().toLowerCase()
      if (!q) return true
      return [s.commentaire, s.titre, s.lieu, s.dossier]
        .some((champ) => champ?.toLowerCase().includes(q))
    })

  const tableManquante = souvenirs.isError

  const enregistrerCommentaire = async () => {
    if (!ouvert) return
    await muter({
      table: 'souvenirs', type: 'update', cible_id: ouvert.id,
      charge: { commentaire: commentaire.trim() || null },
    })
    await rafraichir()
    setOuvert({ ...ouvert, commentaire: commentaire.trim() || null })
  }

  return (
    <div className="px-5 pt-3">
      <BarreRetour vers="/nous" />
      <div className="flex items-center justify-between gap-3 pb-3">
        <h2 className="text-titre-3 text-encre">📷 Souvenirs</h2>
        <button
          onClick={() => setSelection(selection === null ? new Set() : null)}
          className="min-h-sur-tactile rounded-full bg-fond-sourd px-4 text-note font-[590] text-encre-2"
        >
          {selection === null ? 'Sélectionner' : 'Annuler'}
        </button>
        {filtre.type === 'voyage' && filtres.length > 0 && (
          <Bouton variante="discret" onClick={() => naviguer(`/nous/souvenirs/album/${filtre.id}`)}>
            Album
          </Bouton>
        )}
      </div>

      {tableManquante ? (
        <EtatVide
          titre="Une mise à jour de la base est nécessaire"
          message="Colle le fichier « mise-a-jour-souvenirs.sql » (envoyé dans la conversation) dans Supabase → SQL Editor → Run, puis reviens ici."
        />
      ) : (
        <>
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="🔍 Chercher (commentaire, lieu, dossier…)"
            aria-label="Chercher dans les souvenirs"
            className="mb-2 min-h-sur-tactile w-full rounded-full border border-trait bg-fond-eleve px-4 text-corps-2"
          />

          <div className="mb-3 flex gap-1 overflow-x-auto pb-1">
            <button
              onClick={() => setFiltre({ type: 'tous' })}
              aria-pressed={filtre.type === 'tous'}
              className={`min-h-[36px] shrink-0 rounded-full px-3 text-note font-[590]
                ${filtre.type === 'tous' ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
            >
              Tout
            </button>
            {dossiers.map((d) => (
              <button
                key={d}
                onClick={() => setFiltre({ type: 'dossier', nom: d })}
                aria-pressed={filtre.type === 'dossier' && filtre.nom === d}
                className={`min-h-[36px] shrink-0 rounded-full px-3 text-note font-[590]
                  ${filtre.type === 'dossier' && filtre.nom === d ? 'degrade-chaud text-white' : 'bg-fond-sourd text-encre-2'}`}
              >
                📁 {d}
              </button>
            ))}
            {(voyages.data ?? []).map((v) => (
              <button
                key={v.id}
                onClick={() => setFiltre({ type: 'voyage', id: v.id })}
                aria-pressed={filtre.type === 'voyage' && filtre.id === v.id}
                className={`min-h-[36px] shrink-0 rounded-full px-3 text-note font-[590]
                  ${filtre.type === 'voyage' && filtre.id === v.id ? 'degrade-froid text-white' : 'bg-fond-sourd text-encre-2'}`}
              >
                ✈️ {v.titre}
              </button>
            ))}
            <button
              onClick={creerDossier}
              className="min-h-[36px] shrink-0 rounded-full bg-fond-sourd px-3 text-note font-[590] text-encre-2"
            >
              + Dossier
            </button>
          </div>

          <div className="mb-3 flex gap-2">
            <BoutonEnvoi
              variante="valider" pleineLargeur enCours={ajoutEnCours}
              onClick={() => champCamera.current?.click()} enfantsPendant="Ajout…"
            >
              📷 Photo
            </BoutonEnvoi>
            <BoutonEnvoi
              variante="discret" pleineLargeur enCours={ajoutEnCours}
              onClick={() => champPellicule.current?.click()} enfantsPendant="Ajout…"
            >
              Pellicule
            </BoutonEnvoi>
          </div>
          <input
            ref={champCamera} type="file" accept="image/*" capture="environment" hidden
            aria-hidden="true"
            onChange={(e) => {
              void importer(e.target.files)
              e.target.value = '' // pour pouvoir reprendre la même photo
            }}
          />
          <input
            ref={champPellicule} type="file" accept="image/*" multiple hidden
            aria-hidden="true"
            onChange={(e) => {
              void importer(e.target.files)
              e.target.value = '' // pour pouvoir rechoisir les mêmes fichiers
            }}
          />
          {progres && (
            <div className="mb-2">
              <div className="h-2 overflow-hidden rounded-full bg-fond-sourd">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{ width: `${(progres.fait / progres.total) * 100}%`, background: 'var(--sauge)' }}
                />
              </div>
              <p className="chiffres mt-1 text-legende text-encre-3">
                {progres.fait}/{progres.total} photo{progres.total > 1 ? 's' : ''} envoyée{progres.fait > 1 ? 's' : ''}…
              </p>
            </div>
          )}
          {filtre.type !== 'tous' && (
            <p className="mb-2 text-legende text-encre-3">
              Les nouvelles photos iront dans {filtre.type === 'dossier' ? `📁 ${filtre.nom}` : 'ce voyage'}.
            </p>
          )}

          {filtres.length === 0 && !souvenirs.isLoading && (
            <EtatVide
              titre={recherche ? 'Rien ne correspond' : 'Aucun souvenir ici'}
              message={recherche ? 'Essaie un autre mot.' : 'Une photo prise = un souvenir daté, localisé, classé, commenté.'}
            />
          )}

          {filtre.type === 'tous' && !recherche && dossiers.length > 0 && (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {dossiers.map((d) => {
                const contenu = (souvenirs.data ?? []).filter((x) => x.dossier === d)
                const couverture = contenu[0]?.image_donnees
                return (
                  <button
                    key={d}
                    onClick={() => setFiltre({ type: 'dossier', nom: d })}
                    className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-fond-sourd shadow-carte"
                    aria-label={`Ouvrir le dossier ${d}`}
                  >
                    {couverture && <img src={couverture} alt="" className="h-full w-full object-cover" />}
                    <span className="absolute inset-x-0 bottom-0 bg-encre/55 px-1 py-0.5 text-legende font-[590] text-white">
                      📁 {d} · {contenu.length}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          <div className="grid grid-cols-3 gap-1">
            {filtres.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  if (selection !== null) {
                    const suivante = new Set(selection)
                    if (suivante.has(s.id)) suivante.delete(s.id)
                    else suivante.add(s.id)
                    setSelection(suivante)
                    navigator.vibrate?.(4)
                    return
                  }
                  setCommentaire(s.commentaire ?? '')
                  setOuvert(s)
                }}
                className="relative aspect-square overflow-hidden rounded-md"
                style={selection?.has(s.id) ? { outline: '3px solid var(--ardoise)', outlineOffset: -3 } : undefined}
              >
                <img src={s.image_donnees} alt={s.commentaire ?? 'Souvenir'} className="h-full w-full object-cover" />
                {selection !== null && (
                  <span
                    className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full text-note"
                    style={{ background: selection.has(s.id) ? 'var(--ardoise)' : 'rgb(255 255 255 / .7)', color: '#fff' }}
                  >
                    {selection.has(s.id) ? '✓' : ''}
                  </span>
                )}
                {s.favori && <span className="absolute right-1 top-1 text-note" aria-label="Favori">⭐</span>}
                {s.commentaire && (
                  <span className="absolute bottom-0 inset-x-0 truncate bg-encre/50 px-1 text-legende text-white">
                    {s.commentaire}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {selection !== null && selection.size > 0 && (
        <div className="au-dessus-onglets fixed inset-x-4 z-30 flex gap-2 rounded-2xl bg-fond-eleve p-2 shadow-carte">
          <Bouton
            variante="discret"
            pleineLargeur
            onClick={() => {
              const nom = window.prompt('Déplacer vers quel dossier ?')
              if (!nom?.trim()) return
              void Promise.all(
                [...selection].map((idSel) =>
                  muter({ table: 'souvenirs', type: 'update', cible_id: idSel, charge: { dossier: nom.trim() } }),
                ),
              ).then(() => {
                setSelection(null)
                void rafraichir()
              })
            }}
          >
            📁 Dossier
          </Bouton>
          <Bouton
            variante="urgent"
            pleineLargeur
            onClick={() => {
              void Promise.all(
                [...selection].map((idSel) => muter({ table: 'souvenirs', type: 'delete', cible_id: idSel, charge: {} })),
              ).then(() => {
                setSelection(null)
                void rafraichir()
              })
            }}
          >
            Supprimer ({selection.size})
          </Bouton>
        </div>
      )}

      <Feuille ouverte={ouvert !== null} onFermer={() => setOuvert(null)} titre="Souvenir">
        {ouvert && (
          <div className="flex flex-col gap-3">
            <img src={ouvert.image_donnees} alt={ouvert.commentaire ?? 'Souvenir'} className="w-full rounded-xl" />
            <p className="chiffres text-note text-encre-3">
              {new Date(ouvert.pris_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              {ouvert.dossier ? ` · 📁 ${ouvert.dossier}` : ''}
              {ouvert.lat !== null && ouvert.lng !== null && (
                <a href={`https://maps.apple.com/?ll=${ouvert.lat},${ouvert.lng}`} className="ml-2 text-ardoise underline">
                  voir le lieu
                </a>
              )}
            </p>
            <div className="flex gap-2">
              <input
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder="Un commentaire…"
                aria-label="Commentaire"
                className="min-h-sur-tactile flex-1 rounded-md border border-trait bg-fond-eleve px-3 text-corps-2"
              />
              <Bouton variante="valider" onClick={() => void enregistrerCommentaire()}>OK</Bouton>
            </div>
            <label className="block">
              <span className="mb-1 block text-note font-[500] text-encre-2">Dossier</span>
              <select
                value={ouvert.dossier ?? ''}
                onChange={(e) => {
                  const dossier = e.target.value || null
                  void muter({ table: 'souvenirs', type: 'update', cible_id: ouvert.id, charge: { dossier } }).then(rafraichir)
                  setOuvert({ ...ouvert, dossier })
                }}
                className="min-h-sur-tactile w-full rounded-md border border-trait bg-fond-eleve px-3 text-corps-2"
              >
                <option value="">Sans dossier</option>
                {dossiers.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <Bouton
                variante="discret"
                pleineLargeur
                onClick={() => {
                  void muter({ table: 'souvenirs', type: 'update', cible_id: ouvert.id, charge: { favori: !ouvert.favori } }).then(rafraichir)
                  setOuvert({ ...ouvert, favori: !ouvert.favori })
                }}
              >
                {ouvert.favori ? '⭐ Favori' : '☆ Mettre en favori'}
              </Bouton>
              <Bouton
                variante="urgent"
                onClick={() => {
                  void muter({ table: 'souvenirs', type: 'delete', cible_id: ouvert.id, charge: {} }).then(rafraichir)
                  setOuvert(null)
                }}
              >
                Supprimer
              </Bouton>
            </div>
          </div>
        )}
      </Feuille>
    </div>
  )
}
