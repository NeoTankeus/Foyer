// L'album d'un voyage — mise en page prête à imprimer.
// « Imprimer / PDF » produit un fichier acceptable par n'importe quel
// service d'impression (CEWE, Photobox…). Les favoris ouvrent l'album.
import { useParams, useNavigate } from 'react-router-dom'
import { utiliserSouvenirs } from './donnees'
import { utiliserVoyages } from '@/fonctionnalites/voyages/donnees'
import { Bouton } from '@/design/composants/Bouton'

export function EcranAlbum() {
  const { voyageId } = useParams<{ voyageId: string }>()
  const naviguer = useNavigate()
  const souvenirs = utiliserSouvenirs()
  const voyages = utiliserVoyages()

  const voyage = voyages.data?.find((v) => v.id === voyageId)
  const photos = (souvenirs.data ?? [])
    .filter((s) => s.voyage_id === voyageId)
    .sort((a, b) => Number(b.favori) - Number(a.favori) || a.pris_le.localeCompare(b.pris_le))

  return (
    <div className="px-5 pt-3">
      <div className="flex items-center justify-between pb-3 print:hidden">
        <button onClick={() => naviguer('/nous/souvenirs')} className="min-h-sur-tactile text-corps-2 text-ardoise">
          ‹ Souvenirs
        </button>
        <Bouton onClick={() => window.print()}>Imprimer / PDF</Bouton>
      </div>

      <div className="mx-auto max-w-[720px]">
        {/* Page de titre */}
        <div className="mb-8 py-16 text-center">
          <p className="text-note uppercase tracking-widest text-encre-3">Album de famille</p>
          <h1 className="mt-2 text-titre text-encre">{voyage?.titre ?? 'Voyage'}</h1>
          {voyage?.destination && <p className="mt-1 text-corps text-encre-2">{voyage.destination}</p>}
          {voyage?.debut && voyage?.fin && (
            <p className="chiffres mt-1 text-note text-encre-3">
              {new Date(voyage.debut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} —{' '}
              {new Date(voyage.fin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
        </div>

        {photos.length === 0 ? (
          <p className="text-center text-corps-2 text-encre-3">
            Aucun souvenir dans ce voyage pour l’instant.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {photos.map((p, i) => (
              <figure
                key={p.id}
                className={`m-0 break-inside-avoid ${p.favori && i === 0 ? 'col-span-2' : ''}`}
              >
                <img src={p.image_donnees} alt="" className="w-full rounded-md" />
                <figcaption className="chiffres mt-1 text-legende text-encre-3">
                  {new Date(p.pris_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  {p.lieu ? ` · ${p.lieu}` : ''}
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        <p className="py-8 text-center text-legende text-encre-3 print:hidden">
          Astuce : « Imprimer / PDF » → Enregistrer en PDF. Ce fichier s’envoie tel quel à
          n’importe quel imprimeur photo (CEWE, Photobox…). Mets tes meilleures photos en ★ :
          elles ouvrent l’album.
        </p>
      </div>
    </div>
  )
}
