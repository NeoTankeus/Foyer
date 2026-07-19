// 🎲 La Roue des décisions : pour tous les « on mange quoi ? / on va où ? ».
// Elle tourne avec VOS options — restos favoris (pondérés), vos plats, ou
// une liste perso — et STG tranche. Plus de débat.
import { useEffect, useMemo, useState } from 'react'
import { motion, useAnimationControls } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { lireAvecRepli } from '@/lib/lecture'
import type { LigneRecette, LigneRestaurant } from '@/lib/basedonnees.types'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { ChampTexte } from '@/design/composants/ChampTexte'

const COULEURS = ['#e8b04b', '#7d9c88', '#a5788d', '#6d87a8', '#c98f6a', '#8b8bb5', '#9aab6e', '#c47f7f']
const CLE_PERSO = 'stiga-roue-perso'
const CLE_PLATS = 'stiga-roue-plats'
const PLATS_SECOURS = ['Pizza', 'Pâtes carbo', 'Raclette', 'Burgers maison', 'Sushis', 'Crêpes', 'Gratin', 'Salade géante']

const lireListe = (cle: string): string[] => {
  try { return JSON.parse(localStorage.getItem(cle) ?? '[]') as string[] } catch { return [] }
}

interface Option { libelle: string; poids: number }

export function EcranRoue() {
  const [mode, setMode] = useState<'restos' | 'plats' | 'perso'>('restos')
  const [perso, setPerso] = useState<string[]>(() => lireListe(CLE_PERSO))
  const [plats, setPlats] = useState<string[]>(() => lireListe(CLE_PLATS))
  const [nouvelle, setNouvelle] = useState('')
  const [angle, setAngle] = useState(0)
  const [tourne, setTourne] = useState(false)
  const [gagnant, setGagnant] = useState<string | null>(null)
  const controles = useAnimationControls()

  const restaurants = useQuery({
    queryKey: ['restaurants'],
    queryFn: () =>
      lireAvecRepli<LigneRestaurant>('restaurants', async () => {
        const { data, error } = await supabase.from('restaurants').select('*')
        if (error) throw error
        return data
      }),
  })
  const recettes = useQuery({
    queryKey: ['recettes'],
    queryFn: () =>
      lireAvecRepli<LigneRecette>('recettes', async () => {
        const { data, error } = await supabase.from('recettes').select('*')
        if (error) throw error
        return data
      }),
  })

  // Au premier passage sur « plats », la liste modifiable se remplit toute
  // seule (vos recettes si vous en avez, sinon les classiques) — ensuite tu
  // ajoutes et retires ce que tu veux, c'est mémorisé.
  useEffect(() => {
    if (mode !== 'plats' || plats.length > 0 || recettes.isLoading) return
    const recettesMaison = (recettes.data ?? []).map((r) => r.titre).slice(0, 8)
    const graine = recettesMaison.length >= 2 ? recettesMaison : PLATS_SECOURS
    setPlats(graine)
    localStorage.setItem(CLE_PLATS, JSON.stringify(graine))
  }, [mode, plats.length, recettes.isLoading, recettes.data])

  const options: Option[] = useMemo(() => {
    if (mode === 'restos') {
      const liste = (restaurants.data ?? [])
        .map((r) => ({ libelle: r.nom, poids: r.favori ? 2 : (r.note ?? 0) >= 4 ? 1.5 : 1 }))
        .slice(0, 8)
      return liste.length >= 2 ? liste : []
    }
    if (mode === 'plats') return plats.map((p) => ({ libelle: p, poids: 1 })).slice(0, 8)
    return perso.map((p) => ({ libelle: p, poids: 1 })).slice(0, 8)
  }, [mode, restaurants.data, plats, perso])

  const totalPoids = options.reduce((s, o) => s + o.poids, 0)

  // Les parts du gâteau : chaque option a un secteur proportionnel à son poids.
  const secteurs = useMemo(() => {
    let depart = 0
    return options.map((o, i) => {
      const taille = (o.poids / totalPoids) * 360
      const s = { ...o, depart, taille, couleur: COULEURS[i % COULEURS.length] ?? '#999' }
      depart += taille
      return s
    })
  }, [options, totalPoids])

  const lancer = async () => {
    if (options.length < 2 || tourne) return
    setTourne(true)
    setGagnant(null)
    navigator.vibrate?.(8)
    // Tirage pondéré, puis on fait tomber ce secteur sous l'aiguille (en haut).
    let tirage = Math.random() * totalPoids
    let choisi = secteurs[0]
    for (const s of secteurs) {
      tirage -= s.poids
      if (tirage <= 0) { choisi = s; break }
    }
    if (!choisi) { setTourne(false); return }
    const centre = choisi.depart + choisi.taille / 2
    const cible = angle + 5 * 360 + ((360 - centre - (angle % 360) + 360) % 360)
    await controles.start({ rotate: cible, transition: { duration: 3.6, ease: [0.12, 0.8, 0.16, 1] } })
    setAngle(cible)
    setGagnant(choisi.libelle)
    navigator.vibrate?.([15, 40, 25])
    setTourne(false)
  }

  // La liste en cours d'édition : les plats et la liste perso se modifient pareil.
  const listeActive = mode === 'plats' ? plats : perso
  const majListe = (liste: string[]) => {
    if (mode === 'plats') {
      setPlats(liste)
      localStorage.setItem(CLE_PLATS, JSON.stringify(liste))
    } else {
      setPerso(liste)
      localStorage.setItem(CLE_PERSO, JSON.stringify(liste))
    }
  }

  // Le camembert SVG : un arc par option.
  const arc = (depart: number, taille: number): string => {
    const r = 96
    const a1 = ((depart - 90) * Math.PI) / 180
    const a2 = ((depart + taille - 90) * Math.PI) / 180
    const x1 = 100 + r * Math.cos(a1)
    const y1 = 100 + r * Math.sin(a1)
    const x2 = 100 + r * Math.cos(a2)
    const y2 = 100 + r * Math.sin(a2)
    return `M100,100 L${x1},${y1} A${r},${r} 0 ${taille > 180 ? 1 : 0} 1 ${x2},${y2} Z`
  }

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">🎲 La Roue</h1>
        <p className="text-legende text-encre-3">Elle décide, plus de débat.</p>
      </header>

      <div className="flex flex-col items-center gap-3 px-5 pt-3">
        <div className="flex w-full gap-2">
          {([['restos', '🍴 Restos'], ['plats', '🍲 On mange quoi ?'], ['perso', '✏️ Perso']] as const).map(([cle, libelle]) => (
            <button
              key={cle}
              onClick={() => { setMode(cle); setGagnant(null) }}
              aria-pressed={mode === cle}
              className={`min-h-sur-tactile flex-1 rounded-full px-2 text-note font-[590]
                ${mode === cle ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
            >
              {libelle}
            </button>
          ))}
        </div>

        {options.length < 2 ? (
          <p className="py-8 text-center text-corps-2 text-encre-3">
            {mode === 'restos'
              ? 'Il faut au moins 2 restaurants dans le carnet — ajoute tes adresses dans Restaurants.'
              : 'Ajoute au moins 2 options ci-dessous.'}
          </p>
        ) : (
          <>
            <div className="relative mt-2">
              {/* L'aiguille */}
              <div aria-hidden="true" className="absolute left-1/2 top-[-6px] z-10 -translate-x-1/2 text-[26px] drop-shadow">🔻</div>
              <motion.svg
                width="272" height="272" viewBox="0 0 200 200"
                animate={controles}
                initial={{ rotate: 0 }}
                style={{ originX: '50%', originY: '50%' }}
                aria-label="Roue des décisions"
              >
                {secteurs.map((s) => (
                  <path key={s.libelle} d={arc(s.depart, s.taille)} fill={s.couleur} stroke="#fff" strokeWidth="1.2" />
                ))}
                {secteurs.map((s) => {
                  const a = ((s.depart + s.taille / 2 - 90) * Math.PI) / 180
                  const x = 100 + 62 * Math.cos(a)
                  const y = 100 + 62 * Math.sin(a)
                  return (
                    <text
                      key={`t-${s.libelle}`}
                      x={x} y={y}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize="8.5" fill="#fff" fontWeight="600"
                      transform={`rotate(${s.depart + s.taille / 2}, ${x}, ${y})`}
                    >
                      {s.libelle.length > 14 ? `${s.libelle.slice(0, 13)}…` : s.libelle}
                    </text>
                  )
                })}
                <circle cx="100" cy="100" r="14" fill="#fff" />
                <text x="100" y="104" textAnchor="middle" fontSize="12">🎲</text>
              </motion.svg>
            </div>

            <Bouton pleineLargeur variante="primaire" desactive={tourne} onClick={() => void lancer()}>
              {tourne ? 'Ça tourne…' : gagnant ? '🔄 On relance ?' : '🎡 Tourne la roue !'}
            </Bouton>

            {gagnant && !tourne && (
              <div className="w-full rounded-xl bg-fond-eleve p-4 text-center shadow-carte">
                <p className="text-legende uppercase tracking-wide text-encre-3">Le verdict</p>
                <p className="mt-1 text-titre-3 text-encre">✨ {gagnant} ✨</p>
                <p className="mt-1 text-legende text-encre-3">La roue a parlé. On ne discute pas avec la roue.</p>
              </div>
            )}
          </>
        )}

        {mode !== 'restos' && (
          <div className="w-full">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const propre = nouvelle.trim()
                if (propre && listeActive.length < 8 && !listeActive.includes(propre)) {
                  majListe([...listeActive, propre])
                  setNouvelle('')
                }
              }}
            >
              <div className="flex-1">
                <ChampTexte
                  etiquette={mode === 'plats' ? 'Ajouter un plat' : 'Ajouter une option'}
                  value={nouvelle}
                  onChange={(e) => setNouvelle(e.target.value)}
                  placeholder={mode === 'plats' ? 'Tartiflette' : 'Balade en forêt'}
                />
              </div>
              <div className="self-end">
                <Bouton type="submit" variante="valider" desactive={!nouvelle.trim() || listeActive.length >= 8}>+</Bouton>
              </div>
            </form>
            <ul className="mt-2 flex flex-wrap gap-2">
              {listeActive.map((p) => (
                <li key={p} className="flex items-center gap-1 rounded-full bg-fond-sourd px-3 py-1 text-note text-encre-2">
                  {p}
                  <button aria-label={`Retirer ${p}`} onClick={() => majListe(listeActive.filter((x) => x !== p))} className="text-encre-3">✕</button>
                </li>
              ))}
            </ul>
            {listeActive.length >= 8 && (
              <p className="mt-1 text-legende text-encre-3">8 maximum sur la roue — retire un élément pour en ajouter un autre.</p>
            )}
          </div>
        )}

        {mode === 'restos' && options.length >= 2 && (
          <p className="text-legende text-encre-3">⭐ Les favoris et les tables notées ≥ 4 ont plus de chances de sortir.</p>
        )}
      </div>
    </div>
  )
}
