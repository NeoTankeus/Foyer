// Courses : ajout en moins de 3 secondes, tri par rayon, temps réel, mode magasin.
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { utiliserSession } from '@/etat/session'
import {
  ajouterArticle,
  basculerArticle,
  historiqueLibelles,
  supprimerArticlesCoches,
  utiliserListeCourses,
  utiliserRealtimeCourses,
} from '@/lib/requetes'
import { devinerRayon, indexRayon } from './rayons'
import { chercherVisuels } from '@/lib/images'
import { muter } from '@/lib/sync'
import { ChoixVisuel } from '@/design/composants/ChoixVisuel'
import { ScannerYuka } from './ScannerYuka'
import type { LigneArticle } from '@/lib/basedonnees.types'
import { Coche } from '@/design/composants/Coche'
import { Bouton } from '@/design/composants/Bouton'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { EtatVide } from '@/design/composants/EtatVide'
import { ModeMagasin } from './ModeMagasin'
import { demarrerDictee, dicteePossible } from './dictee'

export function EcranCourses() {
  const { membre } = utiliserSession()
  const clientRequetes = useQueryClient()
  const courses = utiliserListeCourses()
  const realtime = utiliserRealtimeCourses()
  const [saisie, setSaisie] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [magasinOuvert, setMagasinOuvert] = useState(false)
  const [dicteeEnCours, setDicteeEnCours] = useState(false)
  const [visuelsEnCours, setVisuelsEnCours] = useState(false)
  const [erreurVisuels, setErreurVisuels] = useState<string | null>(null)
  const [choixVisuelPour, setChoixVisuelPour] = useState<LigneArticle | null>(null)
  const [articleEnEdition, setArticleEnEdition] = useState<LigneArticle | null>(null)
  const [libelleEdite, setLibelleEdite] = useState('')
  const [confirmeSupprArticle, setConfirmeSupprArticle] = useState(false)
  const [scannerOuvert, setScannerOuvert] = useState(false)
  const [messageAction, setMessageAction] = useState<string | null>(null)
  const champRef = useRef<HTMLInputElement>(null)

  // Plusieurs personnes cochent en même temps : temps réel obligatoire.
  useEffect(() => realtime.demarrer(), []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Le cache local peut être inaccessible (mode privé, quota) : pas de
    // promesse non rattrapée, on se contente de zéro suggestion.
    void historiqueLibelles()
      .then(setSuggestions)
      .catch(() => setSuggestions([]))
  }, [courses.data])

  const liste = courses.data?.liste ?? null
  const articles = Array.isArray(courses.data?.articles) ? courses.data.articles : []
  // `libelle` / `rayon` viennent de la base : jamais supposés présents.
  const aFaire = articles
    .filter((a) => !a.coche)
    .sort((a, b) => indexRayon(a.rayon) - indexRayon(b.rayon) || (a.libelle ?? '').localeCompare(b.libelle ?? ''))
  const coches = articles.filter((a) => a.coche)

  const rafraichir = () => clientRequetes.invalidateQueries({ queryKey: ['courses'] })

  // Le bouton général : un visuel internet pour chaque produit sans image, d'un coup.
  const chercherTousLesVisuels = async () => {
    // Un article sans libellé n'a rien à chercher (et ferait planter la recherche).
    const sansImage = aFaire.filter((a) => !a.image_url && Boolean(a.libelle)).slice(0, 25)
    if (sansImage.length === 0) return
    setVisuelsEnCours(true)
    setErreurVisuels(null)
    try {
      const images = await chercherVisuels(sansImage.map((a) => a.libelle))
      let trouves = 0
      for (const article of sansImage) {
        const image = images[article.libelle]
        if (!image) continue
        await muter({ table: 'articles', type: 'update', cible_id: article.id, charge: { image_url: image } })
        trouves += 1
      }
      if (trouves === 0) setErreurVisuels('Aucun visuel trouvé — réessaie dans un instant.')
      await rafraichir()
    } catch {
      setErreurVisuels('Recherche impossible — vérifie le réseau, ou colle la mise à jour SQL « visuels des courses ».')
    } finally {
      setVisuelsEnCours(false)
    }
  }

  const ajouter = (libelle: string) => {
    const propre = libelle.trim()
    if (!propre) return
    if (!liste || !membre) {
      // Le champ semblait avaler la saisie sans rien faire : on explique.
      setMessageAction('Liste indisponible pour l’instant — réessaie dans un instant.')
      return
    }
    setMessageAction(null)
    void ajouterArticle(liste.id, membre.id, propre, devinerRayon(propre))
      .then(rafraichir)
      .catch(() => setMessageAction(`« ${propre} » n’a pas pu être ajouté — vérifie le réseau.`))
    setSaisie('')
    champRef.current?.focus()
  }

  const basculer = (article: LigneArticle) => {
    if (!membre) return
    void basculerArticle(article, membre.id)
      .then(rafraichir)
      .catch(() => setMessageAction('Modification non enregistrée — vérifie le réseau.'))
  }

  const dicter = () => {
    setDicteeEnCours(true)
    demarrerDictee(
      (texte) => {
        // « des piles et du lait » → deux articles
        texte
          .split(/\s+et\s+|,/)
          .map((morceau) => morceau.replace(/^(des?|du|de la|de l')\s+/i, '').trim())
          .filter(Boolean)
          .forEach(ajouter)
        setDicteeEnCours(false)
      },
      () => setDicteeEnCours(false),
    )
  }

  const grouperParRayon = (lignes: LigneArticle[]) => {
    const groupes = new Map<string, LigneArticle[]>()
    for (const article of lignes) {
      // Un rayon absent devient « divers » : sans cela la clé valait null et
      // le titre de section plantait sur `.toUpperCase()`.
      const rayon = article.rayon || 'divers'
      const existant = groupes.get(rayon) ?? []
      existant.push(article)
      groupes.set(rayon, existant)
    }
    return [...groupes.entries()]
  }

  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-2">
        <h2 className="text-titre-3 text-encre">Courses</h2>
        {aFaire.length > 0 && (
          <div className="flex gap-1">
            <Bouton
              variante="discret"
              etiquette="Copier la liste et ouvrir Chronodrive"
              onClick={() => {
                // Chronodrive V1 : liste triée par rayon dans le presse-papier + le site.
                // (Le remplissage automatique du panier — V2 — demande un robot serveur, à venir.)
                const parRayon = grouperParRayon(aFaire)
                  .map(
                    ([rayon, lignes]) =>
                      `${rayon.toUpperCase()}\n${lignes.map((l) => `- ${l.libelle ?? ''}`).join('\n')}`,
                  )
                  .join('\n\n')
                // Le presse-papier peut être absent ou refusé (Safari sans
                // geste, HTTP) : on le dit au lieu de laisser croire que c'est copié.
                const copie = navigator.clipboard?.writeText(parRayon)
                if (copie) {
                  void copie
                    .then(() => setMessageAction('Liste copiée — colle-la dans Chronodrive.'))
                    .catch(() => setMessageAction('Copie refusée par le navigateur — recopie la liste à la main.'))
                } else {
                  setMessageAction('Copie indisponible sur ce navigateur — recopie la liste à la main.')
                }
                window.open('https://www.chronodrive.com', '_blank', 'noopener')
              }}
            >
              Chronodrive
            </Bouton>
            <Bouton variante="discret" onClick={() => setMagasinOuvert(true)}>
              Mode magasin
            </Bouton>
          </div>
        )}
      </div>

      {/* Le champ toujours accessible — plus rapide qu'un Post-it */}
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          ajouter(saisie)
        }}
      >
        <input
          ref={champRef}
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder="Ajouter…"
          aria-label="Ajouter un article"
          list="historique-courses"
          enterKeyHint="done"
          className="min-h-sur-tactile flex-1 rounded-md border border-trait bg-fond-eleve px-3
            text-corps text-encre placeholder:text-encre-3"
        />
        <datalist id="historique-courses">
          {suggestions.map((libelle) => (
            <option key={libelle} value={libelle} />
          ))}
        </datalist>
        {dicteePossible() && (
          <Bouton
            variante={dicteeEnCours ? 'urgent' : 'discret'}
            onClick={dicter}
            etiquette="Dicter un article"
          >
            {dicteeEnCours ? '●' : '🎙'}
          </Bouton>
        )}
      </form>

      {messageAction && <p className="mb-2 px-1 text-legende text-encre-3">{messageAction}</p>}

      {courses.isLoading && (
        <p className="px-8 py-10 text-center text-corps-2 text-encre-3">Chargement de la liste…</p>
      )}
      {liste === null && !courses.isLoading && (
        <div>
          <EtatVide titre="Pas encore de liste" message="La liste « Courses » arrive avec les données du foyer." />
          <div className="px-8">
            <Bouton pleineLargeur variante="discret" onClick={() => void rafraichir()}>
              Réessayer
            </Bouton>
          </div>
        </div>
      )}
      {liste !== null && articles.length === 0 && (
        <EtatVide titre="Liste vide" message="Dis un mot, il est déjà dessus." />
      )}

      <div className="mb-3">
        <Bouton pleineLargeur variante="primaire" onClick={() => setScannerOuvert(true)}>
          📷 Scanner un produit — Nutri-Score & santé
        </Bouton>
      </div>

      {aFaire.some((a) => !a.image_url) && (
        <div className="mb-3">
          <Bouton variante="discret" pleineLargeur desactive={visuelsEnCours} onClick={() => void chercherTousLesVisuels()}>
            {visuelsEnCours ? 'Recherche des visuels…' : '🖼 Chercher les visuels des produits'}
          </Bouton>
          {erreurVisuels && <p className="mt-1 text-legende text-urgent">{erreurVisuels}</p>}
        </div>
      )}

      {grouperParRayon(aFaire).map(([rayon, lignes]) => (
        <section key={rayon} className="mb-3">
          <h3 className="mb-1 px-1 text-note font-[590] uppercase tracking-wide text-encre-3">{rayon}</h3>
          <ul className="flex flex-col gap-1">
            {lignes.map((article) => (
              <li key={article.id} className="flex items-center gap-1 rounded-md bg-fond-eleve px-2 shadow-carte">
                <Coche
                  cochee={false}
                  onBascule={() => basculer(article)}
                  etiquette={`Cocher ${article.libelle}`}
                />
                <button
                  onClick={() => setChoixVisuelPour(article)}
                  aria-label={`Choisir le visuel de ${article.libelle}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-fond-sourd"
                >
                  {article.image_url ? (
                    <img src={article.image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span aria-hidden="true" className="text-encre-3">🖼</span>
                  )}
                </button>
                <button
                  onClick={() => {
                    setLibelleEdite(article.libelle)
                    setConfirmeSupprArticle(false)
                    setArticleEnEdition(article)
                  }}
                  aria-label={`Modifier ${article.libelle}`}
                  className="flex-1 py-3 text-left text-corps text-encre"
                >
                  {article.libelle}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* Les cochés glissent en bas */}
      {coches.length > 0 && (
        <section className="mt-5 opacity-50">
          <div className="mb-1 flex items-center justify-between px-1">
            <h3 className="text-note font-[590] uppercase tracking-wide text-encre-3">Dans le panier</h3>
            <button
              className="min-h-sur-tactile text-note text-encre-3 underline"
              onClick={() =>
                void supprimerArticlesCoches(coches)
                  .then(rafraichir)
                  .catch(() => setMessageAction('Le panier n’a pas pu être vidé — vérifie le réseau.'))
              }
            >
              Vider
            </button>
          </div>
          <ul>
            {coches.map((article) => (
              <li key={article.id} className="flex items-center px-2">
                <Coche
                  cochee
                  onBascule={() => basculer(article)}
                  etiquette={`Décocher ${article.libelle}`}
                />
                <span className="flex-1 py-2 text-corps text-encre-3 line-through">{article.libelle}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Modifier / supprimer un article : appui sur son libellé */}
      <Feuille
        ouverte={articleEnEdition !== null}
        onFermer={() => setArticleEnEdition(null)}
        titre="Modifier l’article"
      >
        {articleEnEdition && (
          <div className="flex flex-col gap-3">
            <ChampTexte
              etiquette="Libellé"
              value={libelleEdite}
              onChange={(e) => setLibelleEdite(e.target.value)}
              placeholder="Lait, piles…"
            />
            <Bouton
              pleineLargeur
              variante="valider"
              onClick={() => {
                const propre = libelleEdite.trim()
                if (!propre) return
                // Le rayon suit le nouveau libellé (« lait » → « piles » change de rayon).
                void muter({
                  table: 'articles', type: 'update', cible_id: articleEnEdition.id,
                  charge: { libelle: propre, rayon: devinerRayon(propre) },
                })
                  .then(rafraichir)
                  .catch(() => setMessageAction('Modification non enregistrée — vérifie le réseau.'))
                setArticleEnEdition(null)
              }}
            >
              Enregistrer
            </Bouton>
            <Bouton
              pleineLargeur
              variante={confirmeSupprArticle ? 'urgent' : 'discret'}
              onClick={() => {
                if (!confirmeSupprArticle) {
                  setConfirmeSupprArticle(true)
                  return
                }
                void muter({ table: 'articles', type: 'delete', cible_id: articleEnEdition.id, charge: {} })
                  .then(rafraichir)
                  .catch(() => setMessageAction('Suppression non enregistrée — vérifie le réseau.'))
                setConfirmeSupprArticle(false)
                setArticleEnEdition(null)
              }}
            >
              {confirmeSupprArticle ? 'Confirmer la suppression ?' : 'Supprimer cet article'}
            </Bouton>
          </div>
        )}
      </Feuille>

      <ScannerYuka ouverte={scannerOuvert} onFermer={() => setScannerOuvert(false)} onAjout={rafraichir} />

      <ChoixVisuel
        ouverte={choixVisuelPour !== null}
        nomInitial={choixVisuelPour?.libelle ?? ''}
        onFermer={() => setChoixVisuelPour(null)}
        onChoix={(image, nom) => {
          const article = choixVisuelPour
          setChoixVisuelPour(null)
          if (!article) return
          void muter({
            table: 'articles', type: 'update', cible_id: article.id,
            charge: { image_url: image, ...(nom && nom !== article.libelle ? { libelle: nom } : {}) },
          })
            .then(rafraichir)
            .catch(() => setMessageAction('Visuel non enregistré — vérifie le réseau.'))
        }}
      />

      <ModeMagasin
        ouvert={magasinOuvert}
        onFermer={() => setMagasinOuvert(false)}
        articles={articles}
        onBascule={basculer}
      />
    </div>
  )
}
