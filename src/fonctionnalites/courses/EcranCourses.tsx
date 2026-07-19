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
  const [scannerOuvert, setScannerOuvert] = useState(false)
  const champRef = useRef<HTMLInputElement>(null)

  // Plusieurs personnes cochent en même temps : temps réel obligatoire.
  useEffect(() => realtime.demarrer(), []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void historiqueLibelles().then(setSuggestions)
  }, [courses.data])

  const liste = courses.data?.liste ?? null
  const articles = courses.data?.articles ?? []
  const aFaire = articles
    .filter((a) => !a.coche)
    .sort((a, b) => indexRayon(a.rayon) - indexRayon(b.rayon) || a.libelle.localeCompare(b.libelle))
  const coches = articles.filter((a) => a.coche)

  const rafraichir = () => clientRequetes.invalidateQueries({ queryKey: ['courses'] })

  // Le bouton général : un visuel internet pour chaque produit sans image, d'un coup.
  const chercherTousLesVisuels = async () => {
    const sansImage = aFaire.filter((a) => !a.image_url).slice(0, 25)
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
    if (!propre || !liste || !membre) return
    void ajouterArticle(liste.id, membre.id, propre, devinerRayon(propre)).then(rafraichir)
    setSaisie('')
    champRef.current?.focus()
  }

  const basculer = (article: LigneArticle) => {
    if (!membre) return
    void basculerArticle(article, membre.id).then(rafraichir)
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
      const existant = groupes.get(article.rayon) ?? []
      existant.push(article)
      groupes.set(article.rayon, existant)
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
                  .map(([rayon, lignes]) => `${rayon.toUpperCase()}\n${lignes.map((l) => `- ${l.libelle}`).join('\n')}`)
                  .join('\n\n')
                void navigator.clipboard?.writeText(parRayon)
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

      {liste === null && !courses.isLoading && (
        <EtatVide titre="Pas encore de liste" message="La liste « Courses » arrive avec les données du foyer." />
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
                <span className="flex-1 py-3 text-corps text-encre">{article.libelle}</span>
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
              onClick={() => void supprimerArticlesCoches(coches).then(rafraichir)}
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
          }).then(rafraichir)
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
