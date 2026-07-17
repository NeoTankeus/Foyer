// L'album d'un voyage — mise en page prête à imprimer.
// « Imprimer / PDF » produit un fichier acceptable par n'importe quel
// service d'impression (CEWE, Photobox…). Les favoris ouvrent l'album.
import { useParams, useNavigate } from 'react-router-dom'
import { utiliserSouvenirs } from './donnees'
import { utiliserVoyages } from '@/fonctionnalites/voyages/donnees'
import { useState } from 'react'
import { Bouton } from '@/design/composants/Bouton'

export function EcranAlbum() {
  const { voyageId } = useParams<{ voyageId: string }>()
  const naviguer = useNavigate()
  const souvenirs = utiliserSouvenirs()
  const voyages = utiliserVoyages()

  const [zipEnCours, setZipEnCours] = useState(false)
  const voyage = voyages.data?.find((v) => v.id === voyageId)

  const telechargerZip = async () => {
    setZipEnCours(true)
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      photos.forEach((p, i) => {
        zip.file(
          `photo-${String(i + 1).padStart(3, '0')}.jpg`,
          p.image_donnees.replace(/^data:image\/\w+;base64,/, ''),
          { base64: true },
        )
      })
      const blob = await zip.generateAsync({ type: 'blob' })
      const lien = document.createElement('a')
      lien.href = URL.createObjectURL(blob)
      lien.download = `album-${(voyage?.titre ?? 'foyer').toLowerCase().replace(/\W+/g, '-')}.zip`
      lien.click()
      URL.revokeObjectURL(lien.href)
    } finally {
      setZipEnCours(false)
    }
  }
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

        <div className="mt-6 rounded-xl bg-fond-eleve p-4 shadow-carte print:hidden">
          <h2 className="text-note font-[700] uppercase tracking-wide text-encre-3">
            🖨️ Commander l’album papier
          </h2>
          <p className="mt-1 text-corps-2 text-encre-2">
            1. Télécharge les photos de l’album en un fichier — 2. dépose-le sur le site
            d’impression de ton choix (aucun n’a d’API publique, mais l’envoi prend 2 minutes).
          </p>
          <div className="mt-2 flex flex-col gap-2">
            <Bouton variante="valider" pleineLargeur desactive={zipEnCours || photos.length === 0} onClick={() => void telechargerZip()}>
              {zipEnCours ? 'Préparation…' : `⬇️ Télécharger les ${photos.length} photos (ZIP)`}
            </Bouton>
            <div className="flex flex-wrap gap-2">
              <a href="https://www.cewe.fr/livres-photo.html" target="_blank" rel="noopener" className="text-note text-ardoise underline">CEWE (qualité)</a>
              <a href="https://www.photobox.fr/boutique/livres-photo" target="_blank" rel="noopener" className="text-note text-ardoise underline">Photobox</a>
              <a href="https://www.monalbumphoto.fr" target="_blank" rel="noopener" className="text-note text-ardoise underline">monalbumphoto (prix)</a>
              <a href="https://www.flexilivre.com" target="_blank" rel="noopener" className="text-note text-ardoise underline">Flexilivre</a>
            </div>
          </div>
        </div>

        <p className="py-8 text-center text-legende text-encre-3 print:hidden">
          Astuce : « Imprimer / PDF » → Enregistrer en PDF. Ce fichier s’envoie tel quel à
          n’importe quel imprimeur photo (CEWE, Photobox…). Mets tes meilleures photos en ★ :
          elles ouvrent l’album.
        </p>
      </div>
    </div>
  )
}
