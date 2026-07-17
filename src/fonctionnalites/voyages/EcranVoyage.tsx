// Un voyage : compte à rebours, météo, valises par personne, checklist maison, réservations.
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { utiliserSession } from '@/etat/session'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import {
  chargerMeteo,
  utiliserReservations,
  utiliserValise,
  utiliserVoyages,
  type MeteoJour,
} from './donnees'
import { differenceInCalendarDays, maintenantLocal } from '@/lib/dates'
import type { LigneReservation } from '@/lib/basedonnees.types'
import { Coche } from '@/design/composants/Coche'
import { couleurMembre } from '@/lib/couleurs'
import { PastilleMembre } from '@/design/composants/PastilleMembre'
import { Bouton } from '@/design/composants/Bouton'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'

export function EcranVoyage() {
  const { id } = useParams<{ id: string }>()
  const naviguer = useNavigate()
  const { membre, membres } = utiliserSession()
  const clientRequetes = useQueryClient()
  const voyages = utiliserVoyages()
  const valise = utiliserValise(id ?? '')
  const reservations = utiliserReservations(id ?? '')
  const [meteo, setMeteo] = useState<MeteoJour[] | null>(null)
  const [membreValise, setMembreValise] = useState<string | null>(null)
  const [ajoutResa, setAjoutResa] = useState(false)
  const [collerEmail, setCollerEmail] = useState(false)
  const [emailColle, setEmailColle] = useState('')
  const [analyseEnCours, setAnalyseEnCours] = useState(false)
  const [resultatAnalyse, setResultatAnalyse] = useState<string | null>(null)

  const analyserEmail = async () => {
    if (!emailColle.trim() || !voyage) return
    setAnalyseEnCours(true)
    setResultatAnalyse(null)
    try {
      const { data: session } = await supabase.auth.getSession()
      const reponse = await fetch('/api/analyser-reservation', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ texte: emailColle }),
      })
      const donnees = (await reponse.json()) as {
        reservations?: {
          type: LigneReservation['type']
          fournisseur: string | null
          reference: string | null
          debut_a: string | null
          fin_a: string | null
          adresse: string | null
          prix: number | null
          codes_acces: string | null
        }[]
        message?: string
      }
      if (!reponse.ok || !donnees.reservations) {
        setResultatAnalyse(donnees.message ?? 'Analyse impossible — réessaie.')
        return
      }
      if (donnees.reservations.length === 0) {
        setResultatAnalyse('Aucune réservation trouvée dans ce texte.')
        return
      }
      for (const r of donnees.reservations) {
        const rid = crypto.randomUUID()
        await muter({
          table: 'reservations', type: 'insert', cible_id: rid,
          charge: {
            id: rid, voyage_id: voyage.id, doc_path: null,
            email_brut: emailColle.slice(0, 4000), ...r,
          },
        })
      }
      await clientRequetes.invalidateQueries({ queryKey: ['reservations', voyage.id] })
      setResultatAnalyse(`${donnees.reservations.length} réservation(s) créée(s) ✓`)
      setEmailColle('')
      setTimeout(() => {
        setResultatAnalyse(null)
        setCollerEmail(false)
      }, 1500)
    } catch {
      setResultatAnalyse('Pas de réseau — réessaie.')
    } finally {
      setAnalyseEnCours(false)
    }
  }

  const voyage = voyages.data?.find((v) => v.id === id)

  useEffect(() => {
    if (voyage?.destination && voyage.debut && voyage.fin) {
      const dans = differenceInCalendarDays(new Date(`${voyage.debut}T12:00:00`), maintenantLocal())
      if (dans >= 0 && dans <= 15) {
        void chargerMeteo(voyage.destination, voyage.debut, voyage.fin).then(setMeteo)
      }
    }
  }, [voyage?.destination, voyage?.debut, voyage?.fin])

  if (!voyage) return <div className="px-5 pt-3 text-corps-2 text-encre-3">Un instant…</div>

  const dans = voyage.debut
    ? differenceInCalendarDays(new Date(`${voyage.debut}T12:00:00`), maintenantLocal())
    : null
  const filants = membres.filter((m) => m.role !== 'guest')
  const membreActif = membreValise ?? membre?.id ?? filants[0]?.id ?? ''
  const affaires = (valise.data ?? []).filter((v) => v.membre_id === membreActif)
  const restantes = (valise.data ?? []).filter((v) => !v.coche).length

  const basculerMaison = async (index: number) => {
    const liste = voyage.checklist_maison.map((c, i) => (i === index ? { ...c, coche: !c.coche } : c))
    await muter({ table: 'voyages', type: 'update', cible_id: voyage.id, charge: { checklist_maison: liste } })
    await clientRequetes.invalidateQueries({ queryKey: ['voyages'] })
  }

  return (
    <div className="px-5 pt-3">
      <button onClick={() => naviguer('/nous/voyages')} className="min-h-sur-tactile text-corps-2 text-ardoise">
        ‹ Voyages
      </button>
      <div className="flex items-baseline justify-between">
        <h2 className="text-titre-2 text-encre">{voyage.titre}</h2>
        {dans !== null && dans >= 0 && (
          <span className="chiffres text-titre-3 text-ardoise">J-{dans}</span>
        )}
      </div>
      {voyage.destination && (
        <a
          href={`https://maps.apple.com/?q=${encodeURIComponent(voyage.destination)}`}
          className="text-corps-2 text-encre-3 underline"
        >
          {voyage.destination}
        </a>
      )}

      {meteo && meteo.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {meteo.map((j) => (
            <div key={j.date} className="min-w-[72px] rounded-md bg-fond-eleve p-2 text-center shadow-carte">
              <p className="text-legende text-encre-3">
                {new Date(j.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}
              </p>
              <p className="chiffres text-corps-2 text-encre">
                {Math.round(j.tMin)}–{Math.round(j.tMax)}°
              </p>
              {j.pluieMm > 1 && <p className="text-legende text-ardoise">pluie</p>}
            </div>
          ))}
        </div>
      )}

      {/* Valises */}
      <section className="mt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-titre-3 text-encre">Valises</h3>
          <span className="chiffres text-note text-encre-3">
            {restantes === 0 ? 'tout est prêt' : `${restantes} à préparer`}
          </span>
        </div>
        <div className="mt-2 flex gap-1">
          {filants.map((m) => (
            <PastilleMembre
              key={m.id}
              membre={m}
              taille={34}
              estompee={membreActif !== m.id}
              onClick={() => setMembreValise(m.id)}
            />
          ))}
        </div>
        <ul className="mt-2 flex flex-col gap-1">
          {affaires.map((a) => {
            const proprietaire = filants.find((m) => m.id === a.membre_id)
            return (
              <li key={a.id} className="flex items-center rounded-md bg-fond-eleve px-2 shadow-carte">
                <Coche
                  cochee={a.coche}
                  onBascule={() =>
                    void muter({ table: 'valise', type: 'update', cible_id: a.id, charge: { coche: !a.coche } }).then(
                      () => clientRequetes.invalidateQueries({ queryKey: ['valise', voyage.id] }),
                    )
                  }
                  etiquette={`Cocher ${a.libelle}`}
                  couleur={proprietaire ? couleurMembre(proprietaire.couleur) : undefined}
                />
                <span className={`flex-1 py-2 text-corps ${a.coche ? 'text-encre-3 line-through' : 'text-encre'}`}>
                  {a.libelle}
                </span>
                <span className="text-legende text-encre-3">{a.categorie}</span>
              </li>
            )
          })}
        </ul>
      </section>

      {/* Réservations */}
      <section className="mt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-titre-3 text-encre">Réservations</h3>
          {membre?.role === 'adult' && (
            <div className="flex gap-1">
              <Bouton variante="soleil" onClick={() => setCollerEmail(true)}>
                📧 Coller un email
              </Bouton>
              <Bouton variante="discret" onClick={() => setAjoutResa(true)} etiquette="Ajouter une réservation">+</Bouton>
            </div>
          )}
        </div>
        {(reservations.data?.length ?? 0) === 0 ? (
          <p className="mt-1 text-corps-2 text-encre-3">
            Rien pour l’instant. Ajoute train, logement, location — les adresses seront tapables.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {(reservations.data ?? []).map((r) => (
              <li key={r.id} className="rounded-md bg-fond-eleve p-3 shadow-carte">
                <p className="text-corps text-encre">
                  {r.fournisseur ?? r.type}
                  {r.reference && <span className="chiffres ml-2 text-note text-encre-3">{r.reference}</span>}
                </p>
                {r.debut_a && (
                  <p className="chiffres text-note text-encre-3">
                    {new Date(r.debut_a).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
                {r.adresse && (
                  <a href={`https://maps.apple.com/?q=${encodeURIComponent(r.adresse)}`} className="text-note text-ardoise underline">
                    {r.adresse}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Checklist maison */}
      <section className="mb-6 mt-5">
        <h3 className="text-titre-3 text-encre">Avant de partir</h3>
        <ul className="mt-2 flex flex-col gap-1">
          {voyage.checklist_maison.map((c, index) => (
            <li key={c.libelle} className="flex items-center rounded-md bg-fond-eleve px-2 shadow-carte">
              <Coche cochee={c.coche} onBascule={() => void basculerMaison(index)} etiquette={c.libelle} />
              <span className={`flex-1 py-2 text-corps-2 ${c.coche ? 'text-encre-3 line-through' : 'text-encre'}`}>
                {c.libelle}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <Feuille ouverte={collerEmail} onFermer={() => setCollerEmail(false)} titre="Coller une confirmation">
        <div className="flex flex-col gap-3">
          <p className="text-note text-encre-3">
            Copie l’email de confirmation (Booking, Airbnb, SNCF, loueur…) et colle-le ici :
            l’IA en extrait la réservation — dates, référence, adresse, prix, codes.
          </p>
          <textarea
            value={emailColle}
            onChange={(e) => setEmailColle(e.target.value)}
            rows={8}
            placeholder="Colle ici tout le contenu de l’email…"
            aria-label="Email de confirmation"
            className="w-full rounded-md border border-trait bg-fond-eleve px-3 py-2 text-note"
          />
          {resultatAnalyse && (
            <p className={`text-note font-[590] ${resultatAnalyse.includes('✓') ? 'text-fait' : 'text-encre-2'}`}>
              {resultatAnalyse}
            </p>
          )}
          <Bouton pleineLargeur variante="valider" desactive={analyseEnCours || !emailColle.trim()} onClick={() => void analyserEmail()}>
            {analyseEnCours ? 'Lecture en cours…' : 'Analyser et créer'}
          </Bouton>
        </div>
      </Feuille>

      <Feuille ouverte={ajoutResa} onFermer={() => setAjoutResa(false)} titre="Nouvelle réservation">
        <FormReservation
          surCreation={async (brouillon) => {
            const rid = crypto.randomUUID()
            await muter({
              table: 'reservations', type: 'insert', cible_id: rid,
              charge: {
                id: rid, voyage_id: voyage.id, prix: null, codes_acces: null,
                doc_path: null, email_brut: null, fin_a: null, ...brouillon,
              },
            })
            await clientRequetes.invalidateQueries({ queryKey: ['reservations', voyage.id] })
            setAjoutResa(false)
          }}
        />
      </Feuille>
    </div>
  )
}

function FormReservation({
  surCreation,
}: {
  surCreation: (b: {
    type: LigneReservation['type']
    fournisseur: string | null
    reference: string | null
    debut_a: string | null
    adresse: string | null
  }) => Promise<void>
}) {
  const [type, setType] = useState<LigneReservation['type']>('hebergement')
  const [fournisseur, setFournisseur] = useState('')
  const [reference, setReference] = useState('')
  const [quand, setQuand] = useState('')
  const [adresse, setAdresse] = useState('')
  const TYPES: { valeur: LigneReservation['type']; libelle: string }[] = [
    { valeur: 'hebergement', libelle: 'Logement' },
    { valeur: 'transport', libelle: 'Transport' },
    { valeur: 'location', libelle: 'Location' },
    { valeur: 'activite', libelle: 'Activité' },
    { valeur: 'restaurant', libelle: 'Restaurant' },
  ]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1">
        {TYPES.map((t) => (
          <button
            key={t.valeur}
            onClick={() => setType(t.valeur)}
            aria-pressed={type === t.valeur}
            className={`min-h-sur-tactile rounded-full px-4 text-corps-2 font-[500]
              ${type === t.valeur ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
          >
            {t.libelle}
          </button>
        ))}
      </div>
      <ChampTexte etiquette="Fournisseur" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} placeholder="SNCF, Airbnb, Europcar…" />
      <ChampTexte etiquette="Référence (facultatif)" value={reference} onChange={(e) => setReference(e.target.value)} />
      <ChampTexte etiquette="Date et heure (facultatif)" type="datetime-local" value={quand} onChange={(e) => setQuand(e.target.value)} />
      <ChampTexte etiquette="Adresse (facultatif)" value={adresse} onChange={(e) => setAdresse(e.target.value)} />
      <Bouton
        pleineLargeur
        onClick={() =>
          void surCreation({
            type,
            fournisseur: fournisseur.trim() || null,
            reference: reference.trim() || null,
            debut_a: quand ? new Date(quand).toISOString() : null,
            adresse: adresse.trim() || null,
          })
        }
      >
        Ajouter
      </Bouton>
    </div>
  )
}
