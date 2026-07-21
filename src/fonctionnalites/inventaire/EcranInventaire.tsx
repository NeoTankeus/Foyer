// L'inventaire du foyer : congélo, frigo, placard. On scanne à l'entrée,
// on décompte à la sortie, les DLC proches remontent — anti-gaspi réel.
import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { lireAvecRepli } from '@/lib/lecture'
import { utiliserSession } from '@/etat/session'
import { decoderBillet } from '@/fonctionnalites/voyages/billets'
import { ficheParCodeBarres } from '@/lib/openfoodfacts'
import type { LigneInventaire } from '@/lib/basedonnees.types'
import { ScannerYuka } from '@/fonctionnalites/courses/ScannerYuka'
import { Bouton } from '@/design/composants/Bouton'
import { BoutonEnvoi } from '@/design/composants/BoutonEnvoi'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { Feuille } from '@/design/composants/Feuille'
import { EtatVide } from '@/design/composants/EtatVide'
import { BarreRetour } from '@/design/composants/BarreRetour'

const ZONES: { cle: string; libelle: string }[] = [
  { cle: 'congelo', libelle: '🧊 Congélo' },
  { cle: 'frigo', libelle: '❄️ Frigo' },
  { cle: 'placard', libelle: '🥫 Placard' },
]

export function EcranInventaire() {
  const { foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const [zone, setZone] = useState('congelo')
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  const [scannerOuvert, setScannerOuvert] = useState(false)
  const [scanEnCours, setScanEnCours] = useState(false)
  const [nom, setNom] = useState('')
  const [dlc, setDlc] = useState('')
  const [imagePrete, setImagePrete] = useState<string | null>(null)
  const [codePret, setCodePret] = useState<string | null>(null)
  const [enEdition, setEnEdition] = useState<LigneInventaire | null>(null)
  const [confirmeSuppr, setConfirmeSuppr] = useState<string | null>(null)
  const fichierRef = useRef<HTMLInputElement>(null)

  const inventaire = useQuery({
    queryKey: ['inventaire'],
    queryFn: () =>
      lireAvecRepli<LigneInventaire>('inventaire', async () => {
        const { data, error } = await supabase.from('inventaire').select('*')
        if (error) throw error
        return data
      }),
  })

  const rafraichir = () => clientRequetes.invalidateQueries({ queryKey: ['inventaire'] })

  const scanner = async (fichier: File) => {
    setScanEnCours(true)
    try {
      const decode = await decoderBillet(fichier)
      if (!decode) return
      setCodePret(decode.texte)
      const fiche = await ficheParCodeBarres(decode.texte)
      if (fiche?.nom) {
        setNom([fiche.marque, fiche.nom, fiche.quantite].filter(Boolean).join(' '))
        setImagePrete(fiche.image)
      }
    } finally {
      setScanEnCours(false)
    }
  }

  const ajouter = async () => {
    if (!nom.trim() || !foyer) return
    const id = crypto.randomUUID()
    await muter({
      table: 'inventaire', type: 'insert', cible_id: id,
      charge: {
        id, foyer_id: foyer.id, zone, libelle: nom.trim().slice(0, 120),
        code_barres: codePret, image_url: imagePrete, quantite: 1,
        dlc: dlc || null, cree_le: new Date().toISOString(),
      },
    })
    setNom('')
    setDlc('')
    setImagePrete(null)
    setCodePret(null)
    setAjoutOuvert(false)
    await rafraichir()
  }

  const changerQuantite = async (ligne: LigneInventaire, delta: number) => {
    const quantite = ligne.quantite + delta
    if (quantite <= 0) {
      await muter({ table: 'inventaire', type: 'delete', cible_id: ligne.id, charge: {} })
    } else {
      await muter({ table: 'inventaire', type: 'update', cible_id: ligne.id, charge: { quantite } })
    }
    await rafraichir()
  }

  const aujourdHui = new Date().toISOString().slice(0, 10)
  const bientot = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  const lignes = (inventaire.data ?? [])
    .filter((l) => l.zone === zone)
    .sort((a, b) => (a.dlc ?? '9999').localeCompare(b.dlc ?? '9999') || a.libelle.localeCompare(b.libelle))

  return (
    <div className="px-5 pb-6 pt-3">
      <BarreRetour vers="/nous" />
      <div className="flex items-center justify-between gap-2 pb-1">
        <h2 className="min-w-0 flex-1 truncate text-titre-3 text-encre">🧊 Placards & congélo</h2>
        <Bouton variante="primaire" onClick={() => setScannerOuvert(true)} etiquette="Scanner un produit">📷</Bouton>
        <Bouton variante="valider" onClick={() => setAjoutOuvert(true)} etiquette="Ajouter un produit">+</Bouton>
      </div>

      <ScannerYuka ouverte={scannerOuvert} onFermer={() => setScannerOuvert(false)} onAjout={() => void rafraichir()} />
      <p className="pb-3 text-note text-encre-3">
        Scanne à l’entrée, décompte à la sortie — les DLC proches remontent toutes seules.
      </p>

      <div className="mb-3 flex gap-1 rounded-lg bg-fond-sourd p-1">
        {ZONES.map((z) => (
          <button
            key={z.cle}
            onClick={() => setZone(z.cle)}
            aria-pressed={zone === z.cle}
            className={`min-h-sur-tactile flex-1 rounded-md text-note font-[590]
              ${zone === z.cle ? 'bg-fond-eleve text-encre shadow-carte' : 'text-encre-3'}`}
          >
            {z.libelle}
          </button>
        ))}
      </div>

      {lignes.length === 0 && !inventaire.isLoading && (
        <EtatVide titre="Zone vide" message="Ajoute un produit : scanne son code-barres, sa fiche se remplit toute seule." />
      )}

      <ul className="flex flex-col gap-1">
        {lignes.map((l) => {
          const perime = l.dlc !== null && l.dlc < aujourdHui
          const urgent = !perime && l.dlc !== null && l.dlc <= bientot
          return (
            <li key={l.id} className="flex items-center gap-2 rounded-md bg-fond-eleve px-2 py-1.5 shadow-carte">
              {l.image_url ? (
                <img src={l.image_url} alt="" className="h-10 w-10 shrink-0 rounded-md object-contain" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-fond-sourd">🥫</span>
              )}
              <button
                onClick={() => setEnEdition(l)}
                aria-label={`Modifier ${l.libelle}`}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-corps-2 text-encre">{l.libelle}</p>
                {l.dlc && (
                  <p className={`text-legende ${perime ? 'font-[700] text-urgent' : urgent ? 'font-[590] text-ambre' : 'text-encre-3'}`}>
                    {perime ? '⚠️ Périmé — ' : urgent ? '⏳ Vite — ' : ''}DLC{' '}
                    {new Date(`${l.dlc}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </p>
                )}
              </button>
              <button
                onClick={() => void changerQuantite(l, -1)}
                aria-label={`Retirer un ${l.libelle}`}
                className="flex min-h-sur-tactile min-w-[40px] items-center justify-center rounded-md bg-fond-sourd text-titre-3 text-encre-2"
              >
                −
              </button>
              <span className="chiffres w-6 text-center text-corps font-[590] text-encre">{l.quantite}</span>
              <button
                onClick={() => void changerQuantite(l, 1)}
                aria-label={`Ajouter un ${l.libelle}`}
                className="flex min-h-sur-tactile min-w-[40px] items-center justify-center rounded-md bg-fond-sourd text-titre-3 text-encre-2"
              >
                +
              </button>
            </li>
          )
        })}
      </ul>

      <Feuille ouverte={ajoutOuvert} onFermer={() => setAjoutOuvert(false)} titre="Ajouter un produit">
        <div className="flex flex-col gap-3">
          <BoutonEnvoi
            variante="discret" pleineLargeur enCours={scanEnCours}
            onClick={() => fichierRef.current?.click()} enfantsPendant="Lecture…"
          >
            📷 Scanner le code-barres
          </BoutonEnvoi>
          <input
            ref={fichierRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            aria-hidden="true"
            onChange={(e) => {
              const fichier = e.target.files?.[0]
              if (fichier) void scanner(fichier)
              e.target.value = ''
            }}
          />
          {imagePrete && <img src={imagePrete} alt="" className="mx-auto h-24 rounded-md object-contain" />}
          <ChampTexte etiquette="Produit" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Steaks hachés x4" />
          <ChampTexte etiquette="DLC (facultatif)" type="date" value={dlc} onChange={(e) => setDlc(e.target.value)} />
          <div className="flex gap-1 rounded-lg bg-fond-sourd p-1">
            {ZONES.map((z) => (
              <button
                key={z.cle}
                onClick={() => setZone(z.cle)}
                aria-pressed={zone === z.cle}
                className={`min-h-sur-tactile flex-1 rounded-md text-note font-[590]
                  ${zone === z.cle ? 'bg-fond-eleve text-encre shadow-carte' : 'text-encre-3'}`}
              >
                {z.libelle}
              </button>
            ))}
          </div>
          <BoutonEnvoi pleineLargeur variante="valider" desactive={!nom.trim()} onEnvoi={ajouter} enfantsPendant="Ajout…">
            Ajouter au {ZONES.find((z) => z.cle === zone)?.libelle.split(' ')[1] ?? 'stock'}
          </BoutonEnvoi>
        </div>
      </Feuille>

      {/* Corriger un produit : libellé, DLC, zone — ou le supprimer franchement. */}
      <Feuille
        ouverte={enEdition !== null}
        onFermer={() => {
          setEnEdition(null)
          setConfirmeSuppr(null)
        }}
        titre="Modifier le produit"
      >
        {enEdition && (
          <FormProduit
            initiale={enEdition}
            surEnregistrement={async (valeurs) => {
              await muter({ table: 'inventaire', type: 'update', cible_id: enEdition.id, charge: valeurs })
              await rafraichir()
              setEnEdition(null)
            }}
            surSuppression={async () => {
              if (confirmeSuppr !== enEdition.id) {
                setConfirmeSuppr(enEdition.id)
                return
              }
              await muter({ table: 'inventaire', type: 'delete', cible_id: enEdition.id, charge: {} })
              setConfirmeSuppr(null)
              await rafraichir()
              setEnEdition(null)
            }}
            confirme={confirmeSuppr === enEdition.id}
          />
        )}
      </Feuille>
    </div>
  )
}

function FormProduit({
  initiale,
  surEnregistrement,
  surSuppression,
  confirme,
}: {
  initiale: LigneInventaire
  surEnregistrement: (v: { libelle: string; dlc: string | null; zone: string }) => Promise<void>
  surSuppression: () => Promise<void>
  confirme: boolean
}) {
  const [libelle, setLibelle] = useState(initiale.libelle)
  const [dlc, setDlc] = useState(initiale.dlc ?? '')
  const [zone, setZone] = useState(initiale.zone)
  return (
    <div className="flex flex-col gap-3">
      <ChampTexte etiquette="Produit" value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Steaks hachés x4" />
      <ChampTexte etiquette="DLC (facultatif)" type="date" value={dlc} onChange={(e) => setDlc(e.target.value)} />
      <div className="flex gap-1 rounded-lg bg-fond-sourd p-1">
        {ZONES.map((z) => (
          <button
            key={z.cle}
            onClick={() => setZone(z.cle)}
            aria-pressed={zone === z.cle}
            className={`min-h-sur-tactile flex-1 rounded-md text-note font-[590]
              ${zone === z.cle ? 'bg-fond-eleve text-encre shadow-carte' : 'text-encre-3'}`}
          >
            {z.libelle}
          </button>
        ))}
      </div>
      <Bouton
        pleineLargeur
        variante="valider"
        desactive={!libelle.trim()}
        onClick={() => void surEnregistrement({ libelle: libelle.trim().slice(0, 120), dlc: dlc || null, zone })}
      >
        Enregistrer
      </Bouton>
      <Bouton pleineLargeur variante={confirme ? 'urgent' : 'discret'} onClick={() => void surSuppression()}>
        {confirme ? 'Confirmer la suppression ?' : 'Supprimer ce produit'}
      </Bouton>
    </div>
  )
}
