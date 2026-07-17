// La boîte à souvenirs : photos classées par dossier ET par voyage, géolocalisées,
// commentées, cherchables. Appareil photo ou pellicule, favoris, album imprimable.
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { utiliserSession } from '@/etat/session'
import { muter } from '@/lib/sync'
import { utiliserVoyages } from '@/fonctionnalites/voyages/donnees'
import { ajouterSouvenir, compresserImage, positionActuelle, utiliserSouvenirs } from './donnees'
import type { LigneSouvenir } from '@/lib/basedonnees.types'
import { Bouton } from '@/design/composants/Bouton'
import { Feuille } from '@/design/composants/Feuille'
import { EtatVide } from '@/design/composants/EtatVide'

export function EcranSouvenirs() {
  const { membre, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const naviguer = useNavigate()
  const souvenirs = utiliserSouvenirs()
  const voyages = utiliserVoyages()
  const [filtre, setFiltre] = useState<{ type: 'tous' } | { type: 'voyage'; id: string } | { type: 'dossier'; nom: string }>({ type: 'tous' })
  const [recherche, setRecherche] = useState('')
  const [ouvert, setOuvert] = useState<LigneSouvenir | null>(null)
  const [commentaire, setCommentaire] = useState('')
  const [ajoutEnCours, setAjoutEnCours] = useState(false)
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
    const position = await positionActuelle()
    for (const fichier of Array.from(fichiers)) {
      const image = await compresserImage(fichier)
      await ajouterSouvenir(foyer.id, membre.id, image, {
        voyage_id: filtre.type === 'voyage' ? filtre.id : null,
        dossier: filtre.type === 'dossier' ? filtre.nom : null,
        lieu: null,
        lat: position?.lat ?? null,
        lng: position?.lng ?? null,
      })
    }
    await rafraichir()
    setAjoutEnCours(false)
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
      <div className="flex items-center justify-between pb-2">
        <h2 className="text-titre-3 text-encre">📷 Souvenirs</h2>
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
            <Bouton variante="valider" pleineLargeur onClick={() => champCamera.current?.click()} desactive={ajoutEnCours}>
              {ajoutEnCours ? 'Ajout…' : '📷 Prendre une photo'}
            </Bouton>
            <Bouton variante="discret" pleineLargeur onClick={() => champPellicule.current?.click()} desactive={ajoutEnCours}>
              Pellicule
            </Bouton>
          </div>
          <input
            ref={champCamera} type="file" accept="image/*" capture="environment" hidden
            aria-hidden="true" onChange={(e) => void importer(e.target.files)}
          />
          <input
            ref={champPellicule} type="file" accept="image/*" multiple hidden
            aria-hidden="true" onChange={(e) => void importer(e.target.files)}
          />
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

          <div className="grid grid-cols-3 gap-1">
            {filtres.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setCommentaire(s.commentaire ?? '')
                  setOuvert(s)
                }}
                className="relative aspect-square overflow-hidden rounded-md"
              >
                <img src={s.image_donnees} alt={s.commentaire ?? 'Souvenir'} className="h-full w-full object-cover" />
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
