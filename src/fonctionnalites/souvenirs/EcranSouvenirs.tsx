// La boîte à souvenirs : photos du foyer, classées par voyage, géolocalisées.
// Appareil photo ou pellicule, favoris, et album imprimable par voyage.
import { useRef, useState } from 'react'
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
  const [filtreVoyage, setFiltreVoyage] = useState<string | null>(null)
  const [ouvert, setOuvert] = useState<LigneSouvenir | null>(null)
  const [ajoutEnCours, setAjoutEnCours] = useState(false)
  const champCamera = useRef<HTMLInputElement>(null)
  const champPellicule = useRef<HTMLInputElement>(null)

  const rafraichir = () => clientRequetes.invalidateQueries({ queryKey: ['souvenirs'] })

  const importer = async (fichiers: FileList | null) => {
    if (!fichiers || !membre || !foyer) return
    setAjoutEnCours(true)
    const position = await positionActuelle()
    for (const fichier of Array.from(fichiers)) {
      const image = await compresserImage(fichier)
      await ajouterSouvenir(foyer.id, membre.id, image, {
        voyage_id: filtreVoyage,
        lieu: null,
        lat: position?.lat ?? null,
        lng: position?.lng ?? null,
      })
    }
    await rafraichir()
    setAjoutEnCours(false)
  }

  const filtres = (souvenirs.data ?? []).filter(
    (s) => filtreVoyage === null || s.voyage_id === filtreVoyage,
  )

  const tableManquante = souvenirs.isError

  return (
    <div className="px-5 pt-3">
      <div className="flex items-center justify-between pb-2">
        <h2 className="text-titre-3 text-encre">Souvenirs</h2>
        {filtreVoyage && filtres.length > 0 && (
          <Bouton variante="discret" onClick={() => naviguer(`/nous/souvenirs/album/${filtreVoyage}`)}>
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
          <div className="mb-3 flex gap-1 overflow-x-auto pb-1">
            <button
              onClick={() => setFiltreVoyage(null)}
              aria-pressed={filtreVoyage === null}
              className={`min-h-[36px] shrink-0 rounded-full px-3 text-note font-[500]
                ${filtreVoyage === null ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
            >
              Tous
            </button>
            {(voyages.data ?? []).map((v) => (
              <button
                key={v.id}
                onClick={() => setFiltreVoyage(v.id)}
                aria-pressed={filtreVoyage === v.id}
                className={`min-h-[36px] shrink-0 rounded-full px-3 text-note font-[500]
                  ${filtreVoyage === v.id ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
              >
                {v.titre}
              </button>
            ))}
          </div>

          <div className="mb-3 flex gap-2">
            <Bouton variante="discret" pleineLargeur onClick={() => champCamera.current?.click()} desactive={ajoutEnCours}>
              {ajoutEnCours ? 'Ajout…' : '📷 Prendre une photo'}
            </Bouton>
            <Bouton variante="discret" pleineLargeur onClick={() => champPellicule.current?.click()} desactive={ajoutEnCours}>
              Depuis la pellicule
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

          {filtres.length === 0 && !souvenirs.isLoading && (
            <EtatVide titre="Aucun souvenir ici" message="Une photo prise = un souvenir gardé, daté, localisé, classé par voyage." />
          )}

          <div className="grid grid-cols-3 gap-1">
            {filtres.map((s) => (
              <button key={s.id} onClick={() => setOuvert(s)} className="relative aspect-square overflow-hidden rounded-sm">
                <img src={s.image_donnees} alt={s.titre ?? 'Souvenir'} className="h-full w-full object-cover" />
                {s.favori && (
                  <span className="absolute right-1 top-1 text-note" aria-label="Favori">★</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      <Feuille ouverte={ouvert !== null} onFermer={() => setOuvert(null)} titre="Souvenir">
        {ouvert && (
          <div className="flex flex-col gap-3">
            <img src={ouvert.image_donnees} alt={ouvert.titre ?? 'Souvenir'} className="w-full rounded-md" />
            <p className="chiffres text-note text-encre-3">
              {new Date(ouvert.pris_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              {ouvert.lat !== null && ouvert.lng !== null && (
                <a
                  href={`https://maps.apple.com/?ll=${ouvert.lat},${ouvert.lng}`}
                  className="ml-2 text-ardoise underline"
                >
                  voir le lieu
                </a>
              )}
            </p>
            <div className="flex gap-2">
              <Bouton
                variante="discret"
                pleineLargeur
                onClick={() => {
                  void muter({
                    table: 'souvenirs', type: 'update', cible_id: ouvert.id,
                    charge: { favori: !ouvert.favori },
                  }).then(rafraichir)
                  setOuvert({ ...ouvert, favori: !ouvert.favori })
                }}
              >
                {ouvert.favori ? '★ Favori' : '☆ Mettre en favori'}
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
