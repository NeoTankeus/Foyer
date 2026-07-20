// 📦 Le Stock fantôme : tes produits qui reviennent toujours (lait, café,
// lessive…) avec leur rythme — STG les ajoute AUX COURSES tout seul avant
// la panne, chaque matin pendant sa tournée. La fin du « ah mince, plus de… ».
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { utiliserSession } from '@/etat/session'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { EtatVide } from '@/design/composants/EtatVide'

export interface ProduitStock {
  libelle: string
  jours: number
  dernier: string // AAAA-MM-JJ du dernier achat
}

const RYTHMES = [
  { jours: 3, libelle: '3 jours' },
  { jours: 7, libelle: '1 semaine' },
  { jours: 14, libelle: '2 semaines' },
  { jours: 30, libelle: '1 mois' },
  { jours: 45, libelle: '6 semaines' },
]

const jourIso = () => new Date().toISOString().slice(0, 10)

export function EcranStock() {
  const { foyer } = utiliserSession()
  const [produits, setProduits] = useState<ProduitStock[]>(() => {
    const brut = foyer?.reglages['stock_fantome']
    return Array.isArray(brut) ? (brut as ProduitStock[]) : []
  })
  const [libelle, setLibelle] = useState('')
  const [jours, setJours] = useState(7)
  const [sauvegarde, setSauvegarde] = useState<'repos' | 'en-cours' | 'erreur'>('repos')

  const enregistrer = async (suivants: ProduitStock[]) => {
    if (!foyer) return
    setProduits(suivants) // affichage immédiat
    setSauvegarde('en-cours')
    // On relit les réglages au moment d'écrire pour ne JAMAIS écraser le reste.
    const { data: frais } = await supabase.from('foyers').select('reglages').eq('id', foyer.id).single()
    const base = (frais?.reglages ?? foyer.reglages) as Record<string, unknown>
    const { error } = await supabase
      .from('foyers')
      .update({ reglages: { ...base, stock_fantome: suivants } })
      .eq('id', foyer.id)
    setSauvegarde(error ? 'erreur' : 'repos')
  }

  const ajouter = () => {
    const propre = libelle.trim()
    if (!propre || produits.some((p) => p.libelle.toLowerCase() === propre.toLowerCase())) return
    void enregistrer([...produits, { libelle: propre, jours, dernier: jourIso() }])
    setLibelle('')
  }

  const prochain = (p: ProduitStock) => {
    const d = new Date(`${p.dernier}T12:00:00`)
    d.setDate(d.getDate() + p.jours)
    return d
  }

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">📦 Le Stock fantôme</h1>
        <p className="text-legende text-encre-3">STG rachète avant la panne — tout seul.</p>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <div className="rounded-xl bg-fond-eleve p-4 shadow-carte">
          <ChampTexte
            etiquette="Le produit qui revient toujours"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder="Lait, café, lessive, couches…"
          />
          <p className="mb-1 mt-2 text-legende text-encre-3">On en rachète environ tous les…</p>
          <div className="flex flex-wrap gap-2">
            {RYTHMES.map((r) => (
              <button
                key={r.jours}
                onClick={() => setJours(r.jours)}
                aria-pressed={jours === r.jours}
                className={`min-h-sur-tactile rounded-full px-3 text-note font-[590]
                  ${jours === r.jours ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
              >
                {r.libelle}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <Bouton pleineLargeur variante="valider" desactive={!libelle.trim()} onClick={ajouter}>
              + Surveiller ce produit
            </Bouton>
          </div>
        </div>

        {sauvegarde === 'erreur' && (
          <p className="text-corps-2 text-urgent">Sauvegarde impossible — vérifie le réseau et réessaie.</p>
        )}

        {produits.length === 0 ? (
          <EtatVide
            titre="Aucun produit surveillé"
            message="Ajoute le lait, le café, la lessive… Chaque matin, STG vérifie et ajoute aux courses ce qui arrive à échéance — avec une notification."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {produits.map((p) => {
              const echeance = prochain(p)
              const dans = Math.ceil((echeance.getTime() - Date.now()) / 86400000)
              return (
                <li key={p.libelle} className="flex items-center gap-3 rounded-xl bg-fond-eleve p-3 shadow-carte">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-corps-2 font-[590] text-encre">{p.libelle}</p>
                    <p className="text-legende text-encre-3">
                      tous les {p.jours} j ·{' '}
                      {dans <= 0
                        ? '🛒 ajout aux courses au prochain passage de STG'
                        : `prochain ajout auto ${echeance.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`}
                    </p>
                  </div>
                  <Bouton
                    variante="discret"
                    onClick={() =>
                      void enregistrer(produits.map((x) => (x.libelle === p.libelle ? { ...x, dernier: jourIso() } : x)))
                    }
                  >
                    Acheté ✓
                  </Bouton>
                  <button
                    aria-label={`Ne plus surveiller ${p.libelle}`}
                    onClick={() => void enregistrer(produits.filter((x) => x.libelle !== p.libelle))}
                    className="min-h-sur-tactile text-encre-3"
                  >
                    ✕
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <p className="text-legende text-encre-3">
          Chaque matin (~7 h), STG regarde cette liste : produit à échéance → il l'ajoute à la liste de courses et
          vous prévient. « Acheté ✓ » remet le compteur à zéro (cocher l'article dans les courses le fait aussi).
        </p>
      </div>
    </div>
  )
}
