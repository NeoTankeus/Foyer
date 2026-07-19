// 🧑‍🍳 Le Chef StiGa : le menu du soir avec ce qu'on a DÉJÀ dans les
// placards (anti-gaspi DLC), adapté à la météo — et ce qui manque part
// direct dans la liste de courses. Le samedi : menu de la semaine complet.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { lireAvecRepli } from '@/lib/lecture'
import { demanderAStiga } from '@/lib/stiga'
import { previsions, villeMeteo, iconeMeteo } from '@/lib/meteo'
import { ajouterArticle, utiliserListeCourses } from '@/lib/requetes'
import { devinerRayon } from '@/fonctionnalites/courses/rayons'
import { utiliserSession } from '@/etat/session'
import type { LigneInventaire } from '@/lib/basedonnees.types'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'
import { EtatVide } from '@/design/composants/EtatVide'

/** La ligne « MANQUE : a, b, c » de la réponse du Chef → la liste des courses. */
function extraireManquants(texte: string): string[] {
  const m = /MANQUE\s*:\s*(.+)/i.exec(texte)
  if (!m) return []
  const brut = (m[1] ?? '').trim()
  if (/^(rien|aucun|—|-)\.?$/i.test(brut)) return []
  return brut
    .split(/[,;·]/)
    .map((x) => x.replace(/\.$/, '').trim())
    .filter((x) => x.length > 1 && x.length < 60)
    .slice(0, 12)
}

export function EcranChef() {
  const { membre } = utiliserSession()
  const courses = utiliserListeCourses()
  const [proposition, setProposition] = useState<string | null>(null)
  const [mode, setMode] = useState<'soir' | 'semaine'>('soir')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [ajoutes, setAjoutes] = useState(false)

  const inventaire = useQuery({
    queryKey: ['inventaire'],
    queryFn: () =>
      lireAvecRepli<LigneInventaire>('inventaire', async () => {
        const { data, error } = await supabase.from('inventaire').select('*')
        if (error) throw error
        return data
      }),
  })

  const stocks = inventaire.data ?? []
  const manquants = proposition ? extraireManquants(proposition) : []

  const cuisiner = async (quoi: 'soir' | 'semaine') => {
    setMode(quoi)
    setEnCours(true)
    setErreur(null)
    setProposition(null)
    setAjoutes(false)
    try {
      const meteo = await previsions().catch(() => [])
      const ville = villeMeteo()
      const garde = stocks
        .map((s) => `${s.libelle}${s.quantite > 1 ? ` ×${s.quantite}` : ''}${s.dlc ? ` (DLC ${s.dlc})` : ''} [${s.zone}]`)
        .join(' · ')
      const ciel = meteo
        .map((j) => `${j.date} : ${iconeMeteo(j.code)} ${j.tMin}–${j.tMax}° pluie ${j.probaPluie}%`)
        .join(' · ')
      const question =
        quoi === 'soir'
          ? `Tu es le Chef du foyer. Dans nos placards/frigo/congélo il y a : ${garde || 'rien de renseigné'}. ` +
            `Météo${ville ? ` à ${ville.nom}` : ''} : ${ciel || 'inconnue'}. ` +
            `Propose LE dîner de ce soir pour 2 adultes + 1 enfant de 7 ans, en utilisant en priorité ce qu'on a déjà ` +
            `(et d'abord ce qui a une DLC proche). Adapte au temps qu'il fait. ` +
            `Format EXACT : le nom du plat en première ligne, puis la recette en 4-6 étapes courtes numérotées, ` +
            `puis le temps total, et TERMINE par une ligne « MANQUE : ... » listant les ingrédients à acheter ` +
            `(ou « MANQUE : rien »).`
          : `Tu es le Chef du foyer. Dans nos placards/frigo/congélo il y a : ${garde || 'rien de renseigné'}. ` +
            `Météo${ville ? ` à ${ville.nom}` : ''} : ${ciel || 'inconnue'}. ` +
            `Propose le menu des 7 prochains dîners pour 2 adultes + 1 enfant de 7 ans : varié, de saison, ` +
            `adapté à la météo connue (plat réconfortant s'il fait froid/pluie, léger s'il fait chaud), ` +
            `en écoulant d'abord ce qui a une DLC proche. ` +
            `Format : une ligne par jour « Lundi — Plat (pourquoi en 5 mots) », ` +
            `et TERMINE par une ligne « MANQUE : ... » avec les courses à prévoir pour tout le menu ` +
            `(ou « MANQUE : rien »).`
      setProposition(await demanderAStiga(question))
    } catch (e) {
      setErreur(String(e instanceof Error ? e.message : e))
    } finally {
      setEnCours(false)
    }
  }

  const ajouterManquants = async () => {
    const liste = courses.data?.liste
    if (!liste || !membre) return
    for (const libelle of manquants) {
      await ajouterArticle(liste.id, membre.id, libelle, devinerRayon(libelle))
    }
    setAjoutes(true)
  }

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🧑‍🍳 Le Chef</h1>
        <p className="text-legende text-encre-3">
          Le menu avec ce qu'on a déjà — ce qui manque part dans les courses.
        </p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <div className="flex gap-2">
          <Bouton pleineLargeur variante="primaire" desactive={enCours} onClick={() => void cuisiner('soir')}>
            {enCours && mode === 'soir' ? 'Le Chef réfléchit…' : '🍽 Le dîner de ce soir'}
          </Bouton>
          <Bouton pleineLargeur variante="discret" desactive={enCours} onClick={() => void cuisiner('semaine')}>
            {enCours && mode === 'semaine' ? 'Le Chef réfléchit…' : '📅 La semaine'}
          </Bouton>
        </div>

        {stocks.length === 0 && !proposition && (
          <EtatVide
            titre="Placards vides (dans l'app !)"
            message="Le Chef cuisine avec ce que contiennent Placards & congélo — scanne ou ajoute quelques produits, il fera des merveilles."
          />
        )}
        {stocks.length > 0 && !proposition && !enCours && (
          <p className="text-legende text-encre-3">
            Le Chef connaît {stocks.length} produit{stocks.length > 1 ? 's' : ''} de tes placards
            {stocks.some((s) => s.dlc) ? ' — il utilisera d’abord les DLC proches' : ''}.
          </p>
        )}

        {erreur && <p className="text-corps-2 text-urgent">{erreur}</p>}

        {proposition && (
          <Carte>
            <p className="whitespace-pre-wrap text-corps-2 leading-relaxed text-encre">
              {proposition.replace(/MANQUE\s*:.*$/is, '').trim()}
            </p>
            {manquants.length > 0 && (
              <div className="mt-3 border-t border-trait pt-3">
                <p className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">🛒 Il manque</p>
                <p className="mb-2 text-corps-2 text-encre-2">{manquants.join(' · ')}</p>
                <Bouton pleineLargeur variante="valider" desactive={ajoutes || !courses.data?.liste} onClick={() => void ajouterManquants()}>
                  {ajoutes ? '✓ Ajoutés à la liste de courses' : `Ajouter les ${manquants.length} aux courses`}
                </Bouton>
              </div>
            )}
            {manquants.length === 0 && (
              <p className="mt-2 text-legende text-fait">✓ Tout est déjà dans tes placards.</p>
            )}
          </Carte>
        )}
      </div>
    </div>
  )
}
