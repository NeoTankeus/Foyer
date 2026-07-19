// Choisir le visuel d'un produit : nom modifiable, relance de recherche,
// grille de photos candidates — un appui pour adopter la bonne.
import { useEffect, useState } from 'react'
import { chercherChoixVisuels } from '@/lib/images'
import { Feuille } from './Feuille'
import { Bouton } from './Bouton'

interface Props {
  ouverte: boolean
  nomInitial: string
  onFermer: () => void
  /** L'image choisie + le nom (éventuellement corrigé) à enregistrer. */
  onChoix: (image: string, nom: string) => void
}

export function ChoixVisuel({ ouverte, nomInitial, onFermer, onChoix }: Props) {
  const [nom, setNom] = useState(nomInitial)
  const [resultats, setResultats] = useState<string[]>([])
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const chercher = async (requete: string) => {
    if (!requete.trim()) return
    setEnCours(true)
    setErreur(null)
    try {
      const choix = await chercherChoixVisuels(requete)
      setResultats(choix)
      if (choix.length === 0) setErreur('Rien trouvé — précise le nom (marque, modèle…) et relance.')
    } catch {
      setErreur('Recherche impossible — vérifie le réseau.')
    } finally {
      setEnCours(false)
    }
  }

  // À l'ouverture : le nom courant, et une première recherche lancée d'office.
  useEffect(() => {
    if (!ouverte) return
    setNom(nomInitial)
    setResultats([])
    void chercher(nomInitial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouverte, nomInitial])

  return (
    <Feuille ouverte={ouverte} onFermer={onFermer} titre="Choisir le visuel">
      <div className="flex flex-col gap-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void chercher(nom)
          }}
        >
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            aria-label="Nom du produit à chercher"
            placeholder="Précise le nom (marque, modèle…)"
            className="min-h-sur-tactile w-full min-w-0 flex-1 rounded-md border border-trait bg-fond-eleve px-3 text-corps"
          />
          <Bouton type="submit" variante="valider" desactive={enCours || !nom.trim()}>
            {enCours ? '…' : 'Chercher'}
          </Bouton>
        </form>
        {erreur && <p className="text-legende text-urgent">{erreur}</p>}
        {enCours && resultats.length === 0 && (
          <p className="py-4 text-center text-corps-2 text-encre-3">Recherche des photos…</p>
        )}
        <div className="grid grid-cols-3 gap-2">
          {resultats.map((url) => (
            <button
              key={url}
              onClick={() => {
                navigator.vibrate?.(4)
                onChoix(url, nom.trim() || nomInitial)
              }}
              aria-label="Choisir cette photo"
              className="overflow-hidden rounded-md bg-fond-sourd"
            >
              <img src={url} alt="" loading="lazy" className="h-24 w-full object-cover" />
            </button>
          ))}
        </div>
        {resultats.length > 0 && (
          <p className="text-legende text-encre-3">
            Touche la bonne photo. Si aucune ne va, corrige le nom ci-dessus et relance.
          </p>
        )}
      </div>
    </Feuille>
  )
}
