// Un voyage : compte à rebours, météo, valises par personne, checklist maison, réservations.
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import type { LigneDepense, LigneReservation } from '@/lib/basedonnees.types'
import { compresserImage } from '@/fonctionnalites/souvenirs/donnees'
import { demanderAStiga } from '@/lib/stiga'
import { decoderBillet, genererCodeVisuel } from './billets'
import { Coche } from '@/design/composants/Coche'
import { couleurMembre } from '@/lib/couleurs'
import { PastilleMembre } from '@/design/composants/PastilleMembre'
import { Bouton } from '@/design/composants/Bouton'
import { BoutonEnvoi } from '@/design/composants/BoutonEnvoi'
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
  const [billetOuvert, setBilletOuvert] = useState<LigneReservation | null>(null)
  const [qrRegenere, setQrRegenere] = useState<string | null>(null)
  const [scanEnCours, setScanEnCours] = useState(false)
  const champBillet = useRef<HTMLInputElement>(null)
  const champTicket = useRef<HTMLInputElement>(null)
  const champPhotoResa = useRef<HTMLInputElement>(null)
  const [resaPourPhoto, setResaPourPhoto] = useState<string | null>(null)
  const [photoResaEnCours, setPhotoResaEnCours] = useState(false)
  const [nouvelArticleValise, setNouvelArticleValise] = useState('')
  const [nouvelleTacheMaison, setNouvelleTacheMaison] = useState('')
  const [depenseManuelle, setDepenseManuelle] = useState<Partial<LigneDepense> | null>(null)
  const [ticketEnCours, setTicketEnCours] = useState(false)
  const [valiseIA, setValiseIA] = useState(false)
  const [checklistIA, setChecklistIA] = useState(false)
  const { foyer } = utiliserSession()

  const depenses = useQuery({
    queryKey: ['depenses', id],
    queryFn: async (): Promise<LigneDepense[]> => {
      const { data, error } = await supabase.from('depenses').select('*').eq('voyage_id', id ?? '')
      if (error) return []
      return data
    },
    enabled: membre?.role === 'adult',
  })

  const scannerTicket = async (fichiers: FileList | null) => {
    const fichier = fichiers?.[0]
    if (!fichier || !voyage || !foyer) return
    setTicketEnCours(true)
    try {
      const image = await compresserImage(fichier)
      const { data: session } = await supabase.auth.getSession()
      const reponse = await fetch('/api/analyser-ticket', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ image }),
      })
      const donnees = (await reponse.json()) as {
        ticket?: { commercant: string | null; montant: number | null; date: string | null; categorie: string | null }
      }
      const ticket = donnees.ticket
      if (ticket?.montant) {
        const did = crypto.randomUUID()
        await muter({
          table: 'depenses', type: 'insert', cible_id: did,
          charge: {
            id: did, foyer_id: foyer.id, voyage_id: voyage.id,
            libelle: ticket.commercant ?? 'Ticket', montant: ticket.montant,
            categorie: ticket.categorie ?? 'autre', date_depense: ticket.date,
            image_donnees: image,
          },
        })
        await clientRequetes.invalidateQueries({ queryKey: ['depenses', voyage.id] })
      } else {
        // montant illisible : on garde la photo et on demande juste le chiffre
        setDepenseManuelle({
          libelle: ticket?.commercant ?? '', categorie: ticket?.categorie ?? 'restaurant',
          date_depense: ticket?.date ?? null, image_donnees: image,
        })
      }
    } finally {
      setTicketEnCours(false)
    }
  }

  const scannerBillet = async (fichiers: FileList | null) => {
    const fichier = fichiers?.[0]
    if (!fichier || !voyage) return
    setScanEnCours(true)
    try {
      const image = await compresserImage(fichier)
      const decode = await decoderBillet(fichier)
      const rid = crypto.randomUUID()
      await muter({
        table: 'reservations', type: 'insert', cible_id: rid,
        charge: {
          id: rid, voyage_id: voyage.id, type: 'activite',
          fournisseur: decode ? `🎫 Billet (${decode.format})` : '🎫 Billet (photo)',
          reference: null, debut_a: null, fin_a: null, adresse: null, prix: null,
          codes_acces: decode?.texte ?? null, doc_path: image, email_brut: null,
        },
      })
      await clientRequetes.invalidateQueries({ queryKey: ['reservations', voyage.id] })
    } finally {
      setScanEnCours(false)
    }
  }

  const ouvrirBillet = async (r: LigneReservation) => {
    setBilletOuvert(r)
    setQrRegenere(null)
    // On ne régénère un QR net que si le code d'origine était bien un QR —
    // un Aztec SNCF régénéré en QR ne passerait pas le portillon.
    const format = /\(([A-Z0-9_]+)\)/.exec(r.fournisseur ?? '')?.[1]
    if (r.codes_acces && format) {
      setQrRegenere(await genererCodeVisuel(r.codes_acces, format))
    }
  }

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

  const ajouterArticleValise = async () => {
    const libelle = nouvelArticleValise.trim()
    if (!libelle || !voyage) return
    const vid = crypto.randomUUID()
    await muter({
      table: 'valise', type: 'insert', cible_id: vid,
      charge: {
        id: vid, voyage_id: voyage.id, membre_id: membreActif, libelle,
        categorie: 'divers', position: 999, coche: false,
      },
    })
    setNouvelArticleValise('')
    await clientRequetes.invalidateQueries({ queryKey: ['valise', voyage.id] })
  }

  const ajouterTacheMaison = async () => {
    const libelle = nouvelleTacheMaison.trim()
    if (!libelle || !voyage) return
    await muter({
      table: 'voyages', type: 'update', cible_id: voyage.id,
      charge: { checklist_maison: [...voyage.checklist_maison, { libelle, coche: false }] },
    })
    setNouvelleTacheMaison('')
    await clientRequetes.invalidateQueries({ queryKey: ['voyages'] })
  }

  // « Une liste par ligne » renvoyée par STG → éléments propres et dédupliqués.
  const lignesDeListe = (texte: string, dejaLa: string[]): string[] => {
    const connus = new Set(dejaLa.map((x) => x.toLowerCase()))
    return texte
      .split('\n')
      .map((l) => l.replace(/^[\s•\-–*\d.)]+/, '').trim())
      .filter((l) => l.length > 1 && l.length < 60 && !/[:!?]$/.test(l))
      .filter((l) => !connus.has(l.toLowerCase()))
      .slice(0, 20)
  }

  // ✨ STG remplit la valise du membre actif selon la destination et la météo.
  const remplirValiseIA = async () => {
    if (!voyage) return
    setValiseIA(true)
    try {
      const proprietaire = filants.find((m) => m.id === membreActif)
      const ciel = (meteo ?? [])
        .map((j) => `${j.date} ${Math.round(j.tMin)}–${Math.round(j.tMax)}°${j.pluieMm > 1 ? ' pluie' : ''}`)
        .join(' · ')
      const nuits =
        voyage.debut && voyage.fin
          ? differenceInCalendarDays(new Date(`${voyage.fin}T12:00:00`), new Date(`${voyage.debut}T12:00:00`))
          : null
      const reponse = await demanderAStiga(
        `Prépare la valise de ${proprietaire?.prenom ?? 'un membre'}` +
          `${proprietaire?.role === 'child' ? ' (enfant de 7 ans)' : ' (adulte)'} pour ${voyage.destination ?? voyage.titre}` +
          `${nuits ? `, ${nuits} nuit${nuits > 1 ? 's' : ''}` : ''}. ` +
          `Météo sur place : ${ciel || 'inconnue — prévois large'}. ` +
          `Déjà dans la valise : ${affaires.map((a) => a.libelle).join(', ') || 'rien'}. ` +
          `Donne UNIQUEMENT la liste des affaires à ajouter, une par ligne, sans catégories ni commentaires, 15 éléments max.`,
      )
      const nouveaux = lignesDeListe(reponse, affaires.map((a) => a.libelle))
      for (const libelle of nouveaux) {
        const vid = crypto.randomUUID()
        await muter({
          table: 'valise', type: 'insert', cible_id: vid,
          charge: { id: vid, voyage_id: voyage.id, membre_id: membreActif, libelle, categorie: 'divers', position: 999, coche: false },
        })
      }
      await clientRequetes.invalidateQueries({ queryKey: ['valise', voyage.id] })
    } finally {
      setValiseIA(false)
    }
  }

  // ✨ STG propose la checklist avant-départ (maison + anti-gaspi frigo).
  const proposerChecklistIA = async () => {
    if (!voyage) return
    setChecklistIA(true)
    try {
      const reponse = await demanderAStiga(
        `On part ${voyage.destination ? `à ${voyage.destination}` : 'en voyage'}` +
          `${voyage.debut ? ` le ${voyage.debut}` : ''}${voyage.fin ? ` jusqu'au ${voyage.fin}` : ''}. ` +
          `Fais la checklist avant de quitter la maison (fermer l'eau, frigo à vider — pense anti-gaspi la semaine d'avant —, ` +
          `poubelles, courrier, plantes, chauffage, clés…). ` +
          `Déjà listé : ${voyage.checklist_maison.map((c) => c.libelle).join(', ') || 'rien'}. ` +
          `Donne UNIQUEMENT les éléments à ajouter, un par ligne, sans commentaires, 12 max.`,
      )
      const nouveaux = lignesDeListe(reponse, voyage.checklist_maison.map((c) => c.libelle))
      if (nouveaux.length > 0) {
        await muter({
          table: 'voyages', type: 'update', cible_id: voyage.id,
          charge: { checklist_maison: [...voyage.checklist_maison, ...nouveaux.map((libelle) => ({ libelle, coche: false }))] },
        })
        await clientRequetes.invalidateQueries({ queryKey: ['voyages'] })
      }
    } finally {
      setChecklistIA(false)
    }
  }

  const attacherPhotoResa = async (fichiers: FileList | null) => {
    const fichier = fichiers?.[0]
    if (!fichier || !resaPourPhoto || !voyage) return
    setPhotoResaEnCours(true)
    try {
      const image = await compresserImage(fichier)
      await muter({ table: 'reservations', type: 'update', cible_id: resaPourPhoto, charge: { doc_path: image } })
      await clientRequetes.invalidateQueries({ queryKey: ['reservations', voyage.id] })
    } finally {
      setPhotoResaEnCours(false)
      setResaPourPhoto(null)
    }
  }

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
        <div className="flex items-center justify-between gap-3">
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
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void ajouterArticleValise()
          }}
        >
          <input
            value={nouvelArticleValise}
            onChange={(e) => setNouvelArticleValise(e.target.value)}
            placeholder="Ajouter à cette valise…"
            aria-label="Ajouter un élément à la valise"
            className="min-h-sur-tactile flex-1 rounded-full border border-trait bg-fond-eleve px-4 text-corps-2"
          />
          <Bouton type="submit" variante="discret">OK</Bouton>
        </form>
        <div className="mt-2">
          <Bouton pleineLargeur variante="soleil" desactive={valiseIA} onClick={() => void remplirValiseIA()}>
            {valiseIA
              ? 'STG fait la valise…'
              : `✨ STG remplit la valise de ${filants.find((m) => m.id === membreActif)?.prenom ?? ''} (selon la météo)`}
          </Bouton>
        </div>
      </section>

      {/* Réservations */}
      <section className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-titre-3 text-encre">Réservations</h3>
          {membre?.role === 'adult' && (
            <div className="flex gap-1">
              <Bouton variante="soleil" onClick={() => setCollerEmail(true)}>
                📧 Email
              </Bouton>
              <BoutonEnvoi variante="valider" enCours={scanEnCours} onClick={() => champBillet.current?.click()} enfantsPendant="…">
                🎫 Scanner
              </BoutonEnvoi>
              <Bouton variante="discret" onClick={() => setAjoutResa(true)} etiquette="Ajouter une réservation">+</Bouton>
            </div>
          )}
          <input
            ref={champBillet} type="file" accept="image/*" capture="environment" hidden
            aria-hidden="true"
            onChange={(e) => {
              void scannerBillet(e.target.files)
              e.target.value = '' // pour pouvoir reprendre le même billet
            }}
          />
        </div>
        {(reservations.data?.length ?? 0) === 0 ? (
          <p className="mt-1 text-corps-2 text-encre-3">
            Rien pour l’instant. Ajoute train, logement, location — les adresses seront tapables.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {(reservations.data ?? []).map((r) => (
              <li
                key={r.id}
                className="rounded-md bg-fond-eleve p-3 shadow-carte"
                onClick={() => {
                  if (r.doc_path || r.codes_acces) void ouvrirBillet(r)
                }}
                style={r.doc_path || r.codes_acces ? { cursor: 'pointer' } : undefined}
              >
                <div className="flex items-start gap-3">
                  {r.doc_path && (
                    <img src={r.doc_path} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
                  )}
                  <div className="flex-1">
                    <p className="text-corps text-encre">
                      {r.fournisseur ?? r.type}
                      {r.reference && <span className="chiffres ml-2 text-note text-encre-3">{r.reference}</span>}
                      {(r.doc_path || r.codes_acces) && (
                        <span className="ml-2 text-note text-ardoise">— ouvrir ›</span>
                      )}
                    </p>
                  </div>
                  {membre?.role === 'adult' && !r.doc_path && (
                    // Le span coupe la propagation : ne pas ouvrir le billet en même temps.
                    <span onClick={(e) => e.stopPropagation()}>
                      <BoutonEnvoi
                        variante="discret"
                        etiquette="Ajouter une photo (chambre, hôtel…)"
                        enCours={photoResaEnCours && resaPourPhoto === r.id}
                        onClick={() => {
                          setResaPourPhoto(r.id)
                          champPhotoResa.current?.click()
                        }}
                      >
                        📷
                      </BoutonEnvoi>
                    </span>
                  )}
                </div>
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

      {/* Budget du séjour — adultes uniquement (RLS) */}
      {membre?.role === 'adult' && (
        <section className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-titre-3 text-encre">💶 Budget du séjour</h3>
            <div className="flex gap-1">
              <BoutonEnvoi variante="soleil" enCours={ticketEnCours} onClick={() => champTicket.current?.click()} enfantsPendant="Lecture…">
                🧾 Ticket
              </BoutonEnvoi>
              <Bouton variante="discret" onClick={() => setDepenseManuelle({})} etiquette="Dépense manuelle">+</Bouton>
            </div>
          </div>
          <input
            ref={champTicket} type="file" accept="image/*" capture="environment" hidden
            aria-hidden="true"
            onChange={(e) => {
              void scannerTicket(e.target.files)
              e.target.value = '' // pour pouvoir reprendre le même ticket
            }}
          />
          {(() => {
            const totalResas = (reservations.data ?? []).reduce((somme, r) => somme + (r.prix ?? 0), 0)
            const totalSurPlace = (depenses.data ?? []).reduce((somme, d) => somme + d.montant, 0)
            return (
              <div className="mt-2 rounded-xl bg-fond-eleve p-4 shadow-carte">
                <p className="chiffres text-titre-2 text-encre">{(totalResas + totalSurPlace).toFixed(2)} €</p>
                <p className="chiffres text-note text-encre-3">
                  Réservations {totalResas.toFixed(2)} € · Sur place {totalSurPlace.toFixed(2)} €
                </p>
                {(depenses.data ?? []).length > 0 && (
                  <ul className="mt-2 border-t border-trait pt-2">
                    {(depenses.data ?? []).map((d) => (
                      <li key={d.id} className="flex items-center gap-2 py-0.5">
                        <span className="flex-1 text-corps-2 text-encre">{d.libelle}</span>
                        <span className="text-legende text-encre-3">{d.categorie}</span>
                        <span className="chiffres text-corps-2 font-[590] text-encre">{d.montant.toFixed(2)} €</span>
                        <button
                          aria-label={`Supprimer ${d.libelle}`}
                          className="min-h-[32px] min-w-[32px] text-note text-encre-3"
                          onClick={() =>
                            void muter({ table: 'depenses', type: 'delete', cible_id: d.id, charge: {} }).then(() =>
                              clientRequetes.invalidateQueries({ queryKey: ['depenses', voyage.id] }),
                            )
                          }
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-legende text-encre-3">
                  Le prix des réservations (hôtel, train…) compte automatiquement. Scanne les tickets sur place —
                  à la fin du séjour, le total est là.
                </p>
              </div>
            )
          })()}
        </section>
      )}

      <input
        ref={champPhotoResa} type="file" accept="image/*" hidden aria-hidden="true"
        onChange={(e) => {
          void attacherPhotoResa(e.target.files)
          e.target.value = '' // pour pouvoir rechoisir la même photo
        }}
      />

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
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void ajouterTacheMaison()
          }}
        >
          <input
            value={nouvelleTacheMaison}
            onChange={(e) => setNouvelleTacheMaison(e.target.value)}
            placeholder="Ajouter à la checklist…"
            aria-label="Ajouter à la checklist maison"
            className="min-h-sur-tactile flex-1 rounded-full border border-trait bg-fond-eleve px-4 text-corps-2"
          />
          <Bouton type="submit" variante="discret">OK</Bouton>
        </form>
        <div className="mt-2">
          <Bouton pleineLargeur variante="soleil" desactive={checklistIA} onClick={() => void proposerChecklistIA()}>
            {checklistIA ? 'STG fait le tour de la maison…' : '✨ STG propose la checklist avant-départ'}
          </Bouton>
        </div>
      </section>

      <Feuille ouverte={depenseManuelle !== null} onFermer={() => setDepenseManuelle(null)} titre="Dépense du séjour">
        {depenseManuelle && foyer && (
          <FormDepense
            initial={depenseManuelle}
            surCreation={async (v) => {
              const did = crypto.randomUUID()
              await muter({
                table: 'depenses', type: 'insert', cible_id: did,
                charge: {
                  id: did, foyer_id: foyer.id, voyage_id: voyage.id,
                  image_donnees: depenseManuelle.image_donnees ?? null, ...v,
                },
              })
              await clientRequetes.invalidateQueries({ queryKey: ['depenses', voyage.id] })
              setDepenseManuelle(null)
            }}
          />
        )}
      </Feuille>

      <Feuille ouverte={billetOuvert !== null} onFermer={() => setBilletOuvert(null)} titre="🎫 Billet">
        {billetOuvert && (
          <div className="flex flex-col items-center gap-3">
            {qrRegenere ? (
              <>
                <img src={qrRegenere} alt="QR code du billet" className="w-64 rounded-md bg-white p-2" />
                <p className="text-legende text-encre-3">QR régénéré net — monte la luminosité à l’entrée.</p>
              </>
            ) : billetOuvert.doc_path ? (
              <img src={billetOuvert.doc_path} alt="Billet scanné" className="w-full rounded-md" />
            ) : null}
            {billetOuvert.codes_acces && (
              <p className="chiffres w-full break-all rounded-md bg-fond-sourd p-3 text-legende text-encre-2">
                {billetOuvert.codes_acces.slice(0, 300)}
              </p>
            )}
            <Bouton
              variante="urgent"
              onClick={() => {
                void muter({ table: 'reservations', type: 'delete', cible_id: billetOuvert.id, charge: {} }).then(() =>
                  clientRequetes.invalidateQueries({ queryKey: ['reservations', voyage.id] }),
                )
                setBilletOuvert(null)
              }}
            >
              Supprimer ce billet
            </Bouton>
          </div>
        )}
      </Feuille>

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


const CATEGORIES_DEPENSE = ['restaurant', 'courses', 'transport', 'activite', 'hebergement', 'autre'] as const

function FormDepense({
  initial,
  surCreation,
}: {
  initial: Partial<LigneDepense>
  surCreation: (v: { libelle: string; montant: number; categorie: string; date_depense: string | null }) => Promise<void>
}) {
  const [libelle, setLibelle] = useState(initial.libelle ?? '')
  const [montant, setMontant] = useState('')
  const [categorie, setCategorie] = useState(initial.categorie ?? 'restaurant')
  const [date, setDate] = useState(initial.date_depense ?? '')
  return (
    <div className="flex flex-col gap-3">
      <ChampTexte etiquette="Quoi ?" value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Restaurant du port, hôtel…" />
      <ChampTexte etiquette="Montant (€)" type="number" inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="42.50" />
      <div className="flex flex-wrap gap-1">
        {CATEGORIES_DEPENSE.map((c) => (
          <button
            key={c}
            onClick={() => setCategorie(c)}
            aria-pressed={categorie === c}
            className={`min-h-sur-tactile rounded-full px-3 text-note font-[500]
              ${categorie === c ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
          >
            {c}
          </button>
        ))}
      </div>
      <ChampTexte etiquette="Date (facultatif)" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <Bouton
        pleineLargeur
        variante="valider"
        onClick={() => {
          const valeur = Number(montant.replace(',', '.'))
          if (libelle.trim() && valeur > 0)
            void surCreation({ libelle: libelle.trim(), montant: valeur, categorie, date_depense: date || null })
        }}
      >
        Ajouter au budget
      </Bouton>
    </div>
  )
}
