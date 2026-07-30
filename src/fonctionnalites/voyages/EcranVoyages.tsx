// Voyages : liste + création. La valise des trois est générée à la création.
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { utiliserSession } from '@/etat/session'
import { muter } from '@/lib/sync'
import type { LigneVoyage } from '@/lib/basedonnees.types'
import { creerVoyage, utiliserVoyages } from './donnees'
import { candidatsLieu, type LieuTrouve } from '@/lib/geo'
import { differenceInCalendarDays, maintenantLocal } from '@/lib/dates'
import { Bouton } from '@/design/composants/Bouton'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { EtatVide } from '@/design/composants/EtatVide'
import { BarreRetour } from '@/design/composants/BarreRetour'

export function EcranVoyages() {
  const { membre, membres, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const naviguer = useNavigate()
  const voyages = utiliserVoyages()
  // Un seul état pour créer ET modifier : 'nouvelle' ou le voyage à retoucher.
  const [enEdition, setEnEdition] = useState<LigneVoyage | 'nouvelle' | null>(null)
  const estAdulte = membre?.role === 'adult'

  // Arrivée depuis la fiche d'un voyage (« ✏️ Modifier ce voyage ») : on ouvre
  // directement son formulaire, puis on nettoie l'adresse.
  const [parametres, setParametres] = useSearchParams()
  const aModifier = parametres.get('modifier')
  useEffect(() => {
    if (!aModifier) return
    const trouve = voyages.data?.find((v) => v.id === aModifier)
    if (!trouve) return
    setEnEdition(trouve)
    setParametres({}, { replace: true })
  }, [aModifier, voyages.data, setParametres])

  return (
    <div className="px-5 pt-3">
      <BarreRetour vers="/nous" />
      <div className="flex items-center justify-between gap-3 pb-3">
        <h2 className="text-titre-3 text-encre">Voyages</h2>
        {estAdulte && (
          <Bouton variante="discret" onClick={() => setEnEdition('nouvelle')} etiquette="Nouveau voyage">+</Bouton>
        )}
      </div>

      {(voyages.data?.length ?? 0) === 0 && !voyages.isLoading && (
        <EtatVide
          titre="Aucun voyage prévu"
          message="Crée-le en 10 secondes : les valises de toute la famille se génèrent toutes seules."
        />
      )}

      <ul className="flex flex-col gap-2">
        {(voyages.data ?? []).map((v) => {
          const dans = v.debut
            ? differenceInCalendarDays(new Date(`${v.debut}T12:00:00`), maintenantLocal())
            : null
          return (
            <li key={v.id} className="flex items-center gap-2">
              <button
                onClick={() => naviguer(`/nous/voyages/${v.id}`)}
                className="min-w-0 flex-1 rounded-lg bg-fond-eleve p-4 text-left shadow-carte"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 break-words text-corps font-[590] text-encre">{v.titre}</p>
                  {dans !== null && dans >= 0 && (
                    <span className="chiffres shrink-0 text-note font-[590] text-ardoise">J-{dans}</span>
                  )}
                </div>
                <p className="text-note text-encre-3">
                  {v.destination ?? ''}
                  {v.debut && v.fin
                    ? ` · du ${new Date(v.debut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} au ${new Date(v.fin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
                    : ''}
                </p>
              </button>
              {estAdulte && (
                <button
                  onClick={() => setEnEdition(v)}
                  aria-label={`Modifier ${v.titre}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fond-eleve text-[16px] shadow-carte"
                >
                  ✏️
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <Feuille
        ouverte={enEdition !== null}
        onFermer={() => setEnEdition(null)}
        titre={enEdition === 'nouvelle' ? 'Nouveau voyage' : `Modifier « ${enEdition?.titre ?? ''} »`}
      >
        {enEdition !== null && foyer && (
          <FormVoyage
            initial={enEdition === 'nouvelle' ? null : enEdition}
            surEnregistrement={async (brouillon) => {
              if (enEdition === 'nouvelle') {
                const id = await creerVoyage(foyer.id, membres, brouillon)
                await clientRequetes.invalidateQueries({ queryKey: ['voyages'] })
                setEnEdition(null)
                naviguer(`/nous/voyages/${id}`)
                return
              }
              // Une destination retouchée invalide les coordonnées mémorisées :
              // la route et la météo se recalculeront sur la nouvelle ville.
              const destinationChangee = brouillon.destination !== enEdition.destination
              const coordonneesVerifiees = brouillon.lat != null && brouillon.lng != null
              await muter({
                table: 'voyages', type: 'update', cible_id: enEdition.id,
                charge: coordonneesVerifiees
                  ? brouillon
                  : destinationChangee
                    ? { ...brouillon, lat: null, lng: null }
                    : brouillon,
              })
              await clientRequetes.invalidateQueries({ queryKey: ['voyages'] })
              setEnEdition(null)
            }}
            surSuppression={
              enEdition === 'nouvelle'
                ? undefined
                : async () => {
                    await muter({ table: 'voyages', type: 'delete', cible_id: enEdition.id, charge: {} })
                    await clientRequetes.invalidateQueries({ queryKey: ['voyages'] })
                    setEnEdition(null)
                  }
            }
          />
        )}
      </Feuille>
    </div>
  )
}

function FormVoyage({
  initial,
  surEnregistrement,
  surSuppression,
}: {
  initial: LigneVoyage | null
  surEnregistrement: (b: {
    titre: string
    destination: string | null
    debut: string | null
    fin: string | null
    lat?: number | null
    lng?: number | null
  }) => Promise<void>
  surSuppression?: () => Promise<void>
}) {
  const [titre, setTitre] = useState(initial?.titre ?? '')
  const [destination, setDestination] = useState(initial?.destination ?? '')
  const [debut, setDebut] = useState(initial?.debut ?? '')
  const [fin, setFin] = useState(initial?.fin ?? '')
  const [enCours, setEnCours] = useState(false)
  const [confirme, setConfirme] = useState(false)
  // 📍 La destination est VÉRIFIÉE sur la carte avant d'enregistrer. C'est ce
  // qui évitait « Marcellus » géocodé aux États-Unis, et une route impossible
  // à calculer sans qu'on comprenne pourquoi.
  const [candidats, setCandidats] = useState<LieuTrouve[]>([])
  const [choisi, setChoisi] = useState<LieuTrouve | null>(null)
  const [verifEnCours, setVerifEnCours] = useState(false)
  const [messageLieu, setMessageLieu] = useState<string | null>(null)

  const verifier = async (nom: string) => {
    const propre = nom.trim()
    setChoisi(null)
    setCandidats([])
    setMessageLieu(null)
    if (propre.length < 2) return
    setVerifEnCours(true)
    try {
      const liste = await candidatsLieu(propre, 8)
      const francais = liste.filter((c) => c.paysCode === 'FR')
      const ordonnes = [...francais, ...liste.filter((c) => c.paysCode !== 'FR')]
      if (ordonnes.length === 0) {
        setMessageLieu(`« ${propre} » est introuvable sur la carte. La route ne pourra pas être calculée.`)
        return
      }
      setChoisi(ordonnes[0] ?? null)
      setCandidats(ordonnes.slice(0, 6))
    } finally {
      setVerifEnCours(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ChampTexte etiquette="Titre" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Pays basque en août" />
      <ChampTexte
        etiquette="Destination (ville)"
        value={destination}
        onChange={(e) => {
          setDestination(e.target.value)
          setChoisi(null)
          setCandidats([])
        }}
        onBlur={() => void verifier(destination)}
        placeholder="Biarritz"
      />
      {verifEnCours && <p className="text-legende text-encre-3">📍 Recherche sur la carte…</p>}
      {messageLieu && <p className="text-corps-2 text-urgent">{messageLieu}</p>}
      {choisi && (
        <div className="rounded-lg bg-fond-sourd p-2">
          <p className="text-corps-2 text-encre">📍 Trouvé : <strong>{choisi.nom}</strong></p>
          {candidats.length > 1 && (
            <>
              <p className="mt-1 text-legende text-encre-3">Ce n’est pas le bon endroit ? Choisis :</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {candidats.map((c) => (
                  <button
                    key={`${c.lat},${c.lon}`}
                    type="button"
                    onClick={() => setChoisi(c)}
                    aria-pressed={choisi.lat === c.lat && choisi.lon === c.lon}
                    className={`min-h-sur-tactile rounded-full px-3 text-note font-[590]
                      ${choisi.lat === c.lat && choisi.lon === c.lon ? 'bg-encre text-fond' : 'bg-fond-eleve text-encre-2'}`}
                  >
                    {c.nom}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <div className="flex gap-3">
        <ChampTexte etiquette="Départ" type="date" value={debut} onChange={(e) => setDebut(e.target.value)} />
        <ChampTexte etiquette="Retour" type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
      </div>
      <Bouton
        pleineLargeur
        variante="valider"
        desactive={enCours || !titre.trim()}
        onClick={() => {
          if (!titre.trim()) return
          setEnCours(true)
          void surEnregistrement({
            titre: titre.trim(),
            destination: destination.trim() || null,
            debut: debut || null,
            fin: fin || null,
            // Les coordonnées vérifiées partent avec le voyage : plus aucun
            // géocodage « au hasard » derrière.
            ...(choisi ? { lat: choisi.lat, lng: choisi.lon } : {}),
          }).finally(() => setEnCours(false))
        }}
      >
        {enCours ? (initial ? 'Enregistrement…' : 'Préparation des valises…') : initial ? 'Enregistrer ✓' : 'Créer le voyage'}
      </Bouton>

      {surSuppression && (
        <Bouton
          pleineLargeur
          variante={confirme ? 'urgent' : 'discret'}
          desactive={enCours}
          onClick={() => {
            if (!confirme) {
              setConfirme(true)
              window.setTimeout(() => setConfirme(false), 4000)
              return
            }
            setEnCours(true)
            void surSuppression().finally(() => setEnCours(false))
          }}
        >
          {confirme ? 'Confirmer : supprimer ce voyage ?' : '🗑 Supprimer ce voyage'}
        </Bouton>
      )}
      {surSuppression && confirme && (
        <p className="text-legende text-urgent">
          Les valises, réservations et dépenses de ce voyage partiront avec lui. Les photos souvenirs,
          elles, sont conservées.
        </p>
      )}

      <p className="text-legende text-encre-3">
        {initial
          ? 'Modifier la destination recalcule la météo et l’état de la route.'
          : 'À la création : une valise par personne (le doudou de Gabriel en tête) et la checklist maison.'}
      </p>
    </div>
  )
}
