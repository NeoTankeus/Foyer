// Menus de la semaine → liste de courses. On ne fait pas la liste, on fait les menus.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { utiliserSession } from '@/etat/session'
import {
  creerRecette,
  genererCoursesDepuisMenus,
  modifierRecette,
  planifierRepas,
  retirerRepas,
  supprimerRecette,
  utiliserRecettes,
  utiliserSemaineRepas,
} from './donnees'
import { utiliserListeCourses } from '@/lib/requetes'
import { addDays, dateIsoJour, formatJourCourt, maintenantLocal } from '@/lib/dates'
import type { LigneRecette, LigneRepas } from '@/lib/basedonnees.types'
import { Feuille } from '@/design/composants/Feuille'
import { Bouton } from '@/design/composants/Bouton'
import { ChampTexte } from '@/design/composants/ChampTexte'

const CRENEAUX: { valeur: LigneRepas['creneau']; libelle: string }[] = [
  { valeur: 'midi', libelle: 'Midi' },
  { valeur: 'soir', libelle: 'Soir' },
]

export function EcranMenus() {
  const { membre, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const repas = utiliserSemaineRepas()
  const recettes = utiliserRecettes()
  const courses = utiliserListeCourses()
  const [creneauOuvert, setCreneauOuvert] = useState<{ date: string; creneau: LigneRepas['creneau'] } | null>(null)
  const [recetteEnEdition, setRecetteEnEdition] = useState<LigneRecette | 'nouvelle' | null>(null)
  const [confirmeSuppr, setConfirmeSuppr] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const jours = Array.from({ length: 7 }, (_, i) => addDays(maintenantLocal(), i))
  const estAdulte = membre?.role === 'adult'

  const repasPour = (date: string, creneau: LigneRepas['creneau']) =>
    (repas.data ?? []).find((r) => r.date === date && r.creneau === creneau)

  const libelleRepas = (r: LigneRepas | undefined) => {
    if (!r) return null
    if (r.notes) return r.notes
    return recettes.data?.find((rec) => rec.id === r.recette_id)?.titre ?? '…'
  }

  const rafraichir = () => clientRequetes.invalidateQueries({ queryKey: ['repas'] })

  const genererCourses = async () => {
    if (!courses.data?.liste || !membre) return
    const n = await genererCoursesDepuisMenus(
      repas.data ?? [],
      recettes.data ?? [],
      courses.data.articles,
      courses.data.liste.id,
      membre.id,
    )
    await clientRequetes.invalidateQueries({ queryKey: ['courses'] })
    setMessage(
      n === 0
        ? 'Tout y est déjà — rien à ajouter.'
        : `${n} ingrédient${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} aux courses.`,
    )
    setTimeout(() => setMessage(null), 4000)
  }

  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-2">
        <h2 className="text-titre-3 text-encre">Menus</h2>
        {estAdulte && (
          <Bouton variante="discret" onClick={() => void genererCourses()}>
            → Courses
          </Bouton>
        )}
      </div>
      {message && <p className="mb-2 px-1 text-note text-fait">{message}</p>}

      <div className="flex flex-col gap-2">
        {jours.map((jour) => {
          const date = dateIsoJour(jour)
          return (
            <div key={date} className="rounded-md bg-fond-eleve p-3 shadow-carte">
              <p className="mb-1 text-note font-[590] capitalize text-encre-3">{formatJourCourt(jour)}</p>
              <div className="flex gap-2">
                {CRENEAUX.map(({ valeur, libelle }) => {
                  const existant = repasPour(date, valeur)
                  const titre = libelleRepas(existant)
                  return (
                    <button
                      key={valeur}
                      onClick={() => estAdulte && setCreneauOuvert({ date, creneau: valeur })}
                      className={`min-h-sur-tactile flex-1 rounded-sm px-3 py-2 text-left
                        ${titre ? 'bg-fond-sourd' : 'border border-dashed border-trait'}`}
                    >
                      <span className="block text-legende uppercase tracking-wide text-encre-3">{libelle}</span>
                      <span className={`text-corps-2 ${titre ? 'text-encre' : 'text-encre-3'}`}>
                        {titre ?? 'Ajouter'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <Feuille
        ouverte={creneauOuvert !== null}
        onFermer={() => setCreneauOuvert(null)}
        titre="Quoi au menu ?"
      >
        {creneauOuvert && foyer && (
          <ChoixRepas
            surChoix={async (choix) => {
              await planifierRepas(
                foyer.id,
                repasPour(creneauOuvert.date, creneauOuvert.creneau),
                creneauOuvert.date,
                creneauOuvert.creneau,
                choix,
              )
              await rafraichir()
              setCreneauOuvert(null)
            }}
            surRetrait={async () => {
              const existant = repasPour(creneauOuvert.date, creneauOuvert.creneau)
              if (existant) {
                await retirerRepas(existant.id)
                await rafraichir()
              }
              setCreneauOuvert(null)
            }}
            existe={repasPour(creneauOuvert.date, creneauOuvert.creneau) !== undefined}
            surNouvelleRecette={() => setRecetteEnEdition('nouvelle')}
            surModifierRecette={(r) => { setRecetteEnEdition(r); setConfirmeSuppr(null) }}
          />
        )}
      </Feuille>

      <Feuille
        ouverte={recetteEnEdition !== null}
        onFermer={() => setRecetteEnEdition(null)}
        titre={recetteEnEdition === 'nouvelle' ? 'Nouvelle recette' : `Modifier « ${recetteEnEdition?.titre ?? ''} »`}
      >
        {recetteEnEdition !== null && foyer && (
          <FormRecette
            initiale={recetteEnEdition === 'nouvelle' ? null : recetteEnEdition}
            surEnregistrement={async (titre, ingredients) => {
              if (recetteEnEdition === 'nouvelle') await creerRecette(foyer.id, titre, ingredients)
              else await modifierRecette(recetteEnEdition.id, titre, ingredients)
              await clientRequetes.invalidateQueries({ queryKey: ['recettes'] })
              setRecetteEnEdition(null)
            }}
            surSuppression={
              recetteEnEdition === 'nouvelle'
                ? undefined
                : async () => {
                    if (confirmeSuppr !== recetteEnEdition.id) {
                      setConfirmeSuppr(recetteEnEdition.id)
                      return
                    }
                    await supprimerRecette(recetteEnEdition.id)
                    setConfirmeSuppr(null)
                    await clientRequetes.invalidateQueries({ queryKey: ['recettes'] })
                    setRecetteEnEdition(null)
                  }
            }
            confirme={recetteEnEdition !== 'nouvelle' && confirmeSuppr === recetteEnEdition.id}
          />
        )}
      </Feuille>
    </div>
  )
}

function ChoixRepas({
  surChoix,
  surRetrait,
  surNouvelleRecette,
  surModifierRecette,
  existe,
}: {
  surChoix: (choix: { recette_id: string | null; notes: string | null }) => Promise<void>
  surRetrait: () => Promise<void>
  surNouvelleRecette: () => void
  surModifierRecette: (r: LigneRecette) => void
  existe: boolean
}) {
  const recettes = utiliserRecettes()
  const [libre, setLibre] = useState('')

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (libre.trim()) void surChoix({ recette_id: null, notes: libre.trim() })
        }}
      >
        <input
          value={libre}
          onChange={(e) => setLibre(e.target.value)}
          placeholder="Libre : restes, pizza, chez mamie…"
          aria-label="Repas libre"
          className="min-h-sur-tactile flex-1 rounded-md border border-trait bg-fond-eleve px-3 text-corps"
        />
        <Bouton type="submit" variante="discret">OK</Bouton>
      </form>

      {(recettes.data?.length ?? 0) > 0 && (
        <div>
          <p className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">Recettes du foyer</p>
          <div className="flex flex-col gap-1">
            {(recettes.data ?? []).map((r) => (
              <div key={r.id} className="flex items-center gap-1 rounded-md bg-fond-sourd">
                <button
                  onClick={() => void surChoix({ recette_id: r.id, notes: null })}
                  className="min-h-sur-tactile min-w-0 flex-1 px-3 text-left text-corps text-encre"
                >
                  {r.titre}
                  <span className="ml-2 text-note text-encre-3">{r.ingredients.length} ingrédients</span>
                </button>
                <button
                  aria-label={`Modifier la recette ${r.titre}`}
                  onClick={() => surModifierRecette(r)}
                  className="min-h-sur-tactile min-w-sur-tactile shrink-0 text-encre-3"
                >
                  ✎
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Bouton variante="discret" pleineLargeur onClick={surNouvelleRecette}>
        Créer une recette
      </Bouton>
      {existe && (
        <Bouton variante="urgent" pleineLargeur onClick={() => void surRetrait()}>
          Retirer ce repas
        </Bouton>
      )}
    </div>
  )
}

function FormRecette({
  initiale,
  surEnregistrement,
  surSuppression,
  confirme,
}: {
  initiale: LigneRecette | null
  surEnregistrement: (titre: string, ingredients: string[]) => Promise<void>
  surSuppression?: () => Promise<void>
  confirme: boolean
}) {
  const [titre, setTitre] = useState(initiale?.titre ?? '')
  const [ingredients, setIngredients] = useState(
    initiale ? initiale.ingredients.map((i) => i.libelle).join('\n') : '',
  )
  return (
    <div className="flex flex-col gap-3">
      <ChampTexte etiquette="Titre" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Lasagnes" />
      <label className="block">
        <span className="mb-1 block text-note font-[500] text-encre-2">
          Ingrédients — un par ligne (le rayon est deviné tout seul)
        </span>
        <textarea
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          rows={6}
          placeholder={'pâtes à lasagnes\nboeuf haché\ntomates\nmozzarella'}
          className="w-full rounded-md border border-trait bg-fond-eleve px-3 py-2 text-corps"
        />
      </label>
      <Bouton
        pleineLargeur
        onClick={() => {
          if (titre.trim()) void surEnregistrement(titre.trim(), ingredients.split('\n'))
        }}
      >
        Enregistrer
      </Bouton>
      {surSuppression && (
        <Bouton pleineLargeur variante={confirme ? 'urgent' : 'discret'} onClick={() => void surSuppression()}>
          {confirme ? 'Confirmer la suppression ?' : 'Supprimer cette recette'}
        </Bouton>
      )}
    </div>
  )
}
