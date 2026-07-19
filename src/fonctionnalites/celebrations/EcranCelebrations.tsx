// Anniversaires & coffre à idées. Les idées sont invisibles au rôle enfant — RLS.
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { lireAvecRepli } from '@/lib/lecture'
import { utiliserSession } from '@/etat/session'
import { differenceInCalendarDays, maintenantLocal } from '@/lib/dates'
import type { LigneCelebration, LigneIdeeCadeau } from '@/lib/basedonnees.types'
import { Bouton } from '@/design/composants/Bouton'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { EtatVide } from '@/design/composants/EtatVide'
import { Coche } from '@/design/composants/Coche'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { notifierLesAutres } from '@/lib/notifications'
import { chercherVisuels } from '@/lib/images'
import { ChoixVisuel } from '@/design/composants/ChoixVisuel'

function prochaineOccurrence(dateIso: string): Date {
  const date = new Date(dateIso)
  const maintenant = maintenantLocal()
  const prochaine = new Date(maintenant.getFullYear(), date.getMonth(), date.getDate())
  if (prochaine < new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate())) {
    prochaine.setFullYear(prochaine.getFullYear() + 1)
  }
  return prochaine
}

/** « www.amazon.fr/dp/… » → « amazon.fr » */
function nomDuSite(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export function EcranCelebrations() {
  const { membre, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const [creation, setCreation] = useState(false)
  const [ouverte, setOuverte] = useState<LigneCelebration | null>(null)

  const celebrations = useQuery({
    queryKey: ['celebrations', 'toutes'],
    queryFn: () =>
      lireAvecRepli<LigneCelebration>('celebrations', async () => {
        const { data, error } = await supabase.from('celebrations').select('*')
        if (error) throw error
        return data
      }),
  })

  const triees = [...(celebrations.data ?? [])].sort(
    (a, b) => prochaineOccurrence(a.date).getTime() - prochaineOccurrence(b.date).getTime(),
  )

  const rafraichir = () => clientRequetes.invalidateQueries({ queryKey: ['celebrations'] })

  return (
    <div className="px-5 pt-3">
      <BarreRetour vers="/nous" />
      <div className="flex items-center justify-between gap-3 pb-3">
        <h2 className="text-titre-3 text-encre">Célébrations</h2>
        {membre?.role === 'adult' && (
          <Bouton variante="discret" onClick={() => setCreation(true)} etiquette="Nouvelle célébration">+</Bouton>
        )}
      </div>

      {triees.length === 0 && !celebrations.isLoading && (
        <EtatVide titre="Personne à fêter ?" message="Ajoute les anniversaires — l’app rappelle à J-21, J-7, J-1 et le jour J." />
      )}

      <ul className="flex flex-col gap-1">
        {triees.map((c) => {
          const dans = differenceInCalendarDays(prochaineOccurrence(c.date), maintenantLocal())
          return (
            <li key={c.id}>
              <button
                onClick={() => setOuverte(c)}
                className="flex min-h-sur-tactile w-full items-center gap-3 rounded-md bg-fond-eleve px-3 py-2 text-left shadow-carte"
              >
                <div className="flex-1">
                  <p className="text-corps text-encre">{c.nom}</p>
                  <p className="text-legende text-encre-3">{c.relation ?? ''}</p>
                </div>
                <span className={`chiffres text-note ${dans <= 7 ? 'font-[590] text-ambre' : 'text-encre-3'}`}>
                  {dans === 0 ? 'aujourd’hui' : `J-${dans}`}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <Feuille ouverte={creation} onFermer={() => setCreation(false)} titre="Nouvelle célébration">
        {foyer && (
          <FormCelebration
            surCreation={async (brouillon) => {
              const id = crypto.randomUUID()
              await muter({
                table: 'celebrations', type: 'insert', cible_id: id,
                charge: { id, foyer_id: foyer.id, rappels: [21, 7, 1, 0], magie: false, membre_id: null, ...brouillon },
              })
              notifierLesAutres(
                '🎂 Nouvelle célébration',
                `${membre?.prenom ?? 'Quelqu’un'} a ajouté ${brouillon.nom} — ${new Date(brouillon.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.`,
                '/nous/celebrations',
              )
              await rafraichir()
              setCreation(false)
            }}
          />
        )}
      </Feuille>

      <Feuille ouverte={ouverte !== null} onFermer={() => setOuverte(null)} titre={ouverte?.nom ?? ''}>
        {ouverte && membre?.role === 'adult' && (
          <CoffreAIdees
            celebration={ouverte}
            surSuppression={() => {
              setOuverte(null)
              void rafraichir()
            }}
          />
        )}
      </Feuille>
    </div>
  )
}

function FormCelebration({
  surCreation,
}: {
  surCreation: (b: { nom: string; date: string; relation: string | null }) => Promise<void>
}) {
  const [nom, setNom] = useState('')
  const [date, setDate] = useState('')
  const [relation, setRelation] = useState('')
  return (
    <div className="flex flex-col gap-3">
      <ChampTexte etiquette="Qui ?" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Mamie Jacqueline" />
      <ChampTexte etiquette="Date (l’année sert à calculer l’âge)" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <ChampTexte etiquette="Relation (facultatif)" value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="grand-mère, copain d’école…" />
      <Bouton pleineLargeur onClick={() => { if (nom.trim() && date) void surCreation({ nom: nom.trim(), date, relation: relation.trim() || null }) }}>
        Ajouter
      </Bouton>
    </div>
  )
}

/** Toute l'année on note ce que la personne évoque. En novembre, on n'est pas démuni. */
function CoffreAIdees({
  celebration,
  surSuppression,
}: {
  celebration: LigneCelebration
  surSuppression: () => void
}) {
  const { foyer, membre } = utiliserSession()
  const clientRequetes = useQueryClient()
  const [idee, setIdee] = useState('')
  const [lien, setLien] = useState('')
  const [analyseEnCours, setAnalyseEnCours] = useState(false)
  const [majEnCours, setMajEnCours] = useState(false)
  const [majUnitaire, setMajUnitaire] = useState<string | null>(null)
  const [depliee, setDepliee] = useState<string | null>(null)
  const [confirmeSuppr, setConfirmeSuppr] = useState<string | null>(null)
  const [confirmeSupprCeleb, setConfirmeSupprCeleb] = useState(false)
  const [noteBrouillon, setNoteBrouillon] = useState('')
  const [erreurAjout, setErreurAjout] = useState<string | null>(null)
  const [visuelsEnCours, setVisuelsEnCours] = useState(false)
  const [choixVisuelPour, setChoixVisuelPour] = useState<LigneIdeeCadeau | null>(null)
  const dejaReleve = useRef(false)

  const analyserLien = async (url: string): Promise<{ titre: string | null; image: string | null; prix: number | null }> => {
    const { data: session } = await supabase.auth.getSession()
    const reponse = await fetch('/api/analyser-lien', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ url }),
    })
    const donnees = (await reponse.json()) as { produit?: { titre: string | null; image: string | null; prix: number | null } }
    return donnees.produit ?? { titre: null, image: null, prix: null }
  }

  const rafraichir = () => clientRequetes.invalidateQueries({ queryKey: ['idees', celebration.id] })

  const ajouterDepuisLien = async () => {
    const url = lien.trim()
    if (!url || !foyer || !membre) return
    setAnalyseEnCours(true)
    try {
      const produit = await analyserLien(url)
      const id = crypto.randomUUID()
      const jour = new Date().toISOString().slice(0, 10)
      await muter({
        table: 'idees_cadeaux', type: 'insert', cible_id: id,
        charge: {
          id, foyer_id: foyer.id, celebration_id: celebration.id,
          libelle: produit.titre ?? url.replace(/^https?:\/\//, '').slice(0, 60),
          note: null, prix: produit.prix, url, image_url: produit.image,
          historique_prix: produit.prix !== null ? [{ date: jour, prix: produit.prix }] : [],
          offert: false, offert_le: null, cree_par: membre.id, cree_le: new Date().toISOString(),
        },
      })
      setLien('')
      setErreurAjout(null)
      notifierLesAutres(
        '🎁 Nouvelle idée cadeau',
        `${membre.prenom} a ajouté « ${(produit.titre ?? url).slice(0, 60)} » pour ${celebration.nom}.`,
        '/nous/celebrations',
        true, // adultes seulement — verrou Père Noël
      )
      await rafraichir()
    } catch {
      setErreurAjout('Impossible d’ajouter ce lien — vérifie l’adresse et le réseau, puis réessaie.')
    } finally {
      setAnalyseEnCours(false)
    }
  }

  /** Relit la page du produit et ajoute le point du jour à la courbe. */
  const releverPrix = async (i: LigneIdeeCadeau): Promise<void> => {
    if (!i.url) return
    const produit = await analyserLien(i.url)
    if (produit.prix === null) return
    const jour = new Date().toISOString().slice(0, 10)
    const historique = [...(i.historique_prix ?? [])]
    const dernier = historique[historique.length - 1]
    if (dernier?.date === jour) {
      historique[historique.length - 1] = { date: jour, prix: produit.prix }
    } else {
      historique.push({ date: jour, prix: produit.prix })
    }
    await muter({
      table: 'idees_cadeaux', type: 'update', cible_id: i.id,
      charge: { prix: produit.prix, historique_prix: historique.slice(-90) },
    })
  }

  const actualiserPrix = async () => {
    setMajEnCours(true)
    try {
      for (const i of (idees.data ?? []).filter((x) => x.url && !x.offert)) {
        await releverPrix(i)
      }
      await rafraichir()
    } finally {
      setMajEnCours(false)
    }
  }

  const actualiserUnPrix = async (i: LigneIdeeCadeau) => {
    setMajUnitaire(i.id)
    try {
      await releverPrix(i)
      await rafraichir()
    } finally {
      setMajUnitaire(null)
    }
  }

  const supprimerIdee = async (id: string) => {
    await muter({ table: 'idees_cadeaux', type: 'delete', cible_id: id, charge: {} })
    setConfirmeSuppr(null)
    setDepliee(null)
    await rafraichir()
  }

  const idees = useQuery({
    queryKey: ['idees', celebration.id],
    queryFn: async () => {
      const lignes = await lireAvecRepli<LigneIdeeCadeau>('idees_cadeaux', async () => {
        const { data, error } = await supabase
          .from('idees_cadeaux')
          .select('*')
          .eq('celebration_id', celebration.id)
        if (error) throw error
        return data
      })
      return lignes
        .filter((i) => i.celebration_id === celebration.id)
        .sort((a, b) => {
          if (a.offert !== b.offert) return a.offert ? 1 : -1
          return (b.cree_le ?? '').localeCompare(a.cree_le ?? '')
        })
    },
  })

  // À l'ouverture du coffre : on relève automatiquement les prix pas encore
  // vérifiés aujourd'hui — la courbe se construit toute seule, jour après jour.
  useEffect(() => {
    if (dejaReleve.current) return
    const liste = idees.data
    if (!liste) return
    dejaReleve.current = true
    const jour = new Date().toISOString().slice(0, 10)
    const enRetard = liste
      .filter((i) => i.url && !i.offert)
      .filter((i) => {
        const h = i.historique_prix ?? []
        return h[h.length - 1]?.date !== jour
      })
      .slice(0, 8)
    if (enRetard.length === 0) return
    void (async () => {
      setMajEnCours(true)
      try {
        for (const i of enRetard) {
          try {
            await releverPrix(i)
          } catch {
            // page injoignable — on retentera au prochain passage
          }
        }
        await rafraichir()
      } finally {
        setMajEnCours(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idees.data])

  return (
    <div className="flex flex-col gap-3">
      <p className="text-note text-encre-3">
        Le coffre à idées — invisible pour Gabriel, verrouillé au niveau de la base.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!idee.trim() || !foyer || !membre) return
          const id = crypto.randomUUID()
          const libelleIdee = idee.trim()
          // Visuel automatique en arrière-plan, comme pour les courses.
          void chercherVisuels([libelleIdee])
            .then((images) => {
              const image = images[libelleIdee]
              if (image) return muter({ table: 'idees_cadeaux', type: 'update', cible_id: id, charge: { image_url: image } }).then(rafraichir)
            })
            .catch(() => undefined)
          void muter({
            table: 'idees_cadeaux', type: 'insert', cible_id: id,
            charge: {
              id, foyer_id: foyer.id, celebration_id: celebration.id, libelle: idee.trim(),
              note: null, prix: null, offert: false, offert_le: null,
              cree_par: membre.id, cree_le: new Date().toISOString(),
            },
          })
            .then(() => {
              setErreurAjout(null)
              notifierLesAutres(
                '🎁 Nouvelle idée cadeau',
                `${membre.prenom} a noté « ${idee.trim().slice(0, 60)} » pour ${celebration.nom}.`,
                '/nous/celebrations',
                true, // adultes seulement — verrou Père Noël
              )
              return rafraichir()
            })
            .catch(() => setErreurAjout('L’idée n’a pas pu être enregistrée — réessaie dans un instant.'))
          setIdee('')
        }}
      >
        <input
          value={idee}
          onChange={(e) => setIdee(e.target.value)}
          placeholder="✏️ Noter une idée : « il/elle a parlé de… »"
          aria-label="Nouvelle idée cadeau"
          className="min-h-sur-tactile w-full min-w-0 flex-1 rounded-md border border-trait bg-fond-eleve px-3 text-corps"
        />
        <Bouton type="submit" variante="discret" desactive={!idee.trim()}>Ajouter</Bouton>
      </form>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void ajouterDepuisLien()
        }}
      >
        <input
          value={lien}
          onChange={(e) => setLien(e.target.value)}
          placeholder="🔗 Coller le lien du produit (Amazon, Fnac…)"
          aria-label="Lien du produit"
          inputMode="url"
          className="min-h-sur-tactile w-full min-w-0 flex-1 rounded-md border border-trait bg-fond-eleve px-3 text-corps-2"
        />
        <Bouton type="submit" variante="valider" desactive={analyseEnCours || !lien.trim()}>
          {analyseEnCours ? '…' : 'OK'}
        </Bouton>
      </form>
      {erreurAjout && <p className="-mt-1 text-legende text-urgent">{erreurAjout}</p>}
      {(idees.data ?? []).some((i) => i.url) && (
        <>
          <Bouton variante="discret" pleineLargeur desactive={majEnCours} onClick={() => void actualiserPrix()}>
            {majEnCours ? 'Mise à jour des prix…' : '🔄 Actualiser tous les prix'}
          </Bouton>
          <p className="-mt-1 text-legende text-encre-3">
            Prix relevé à l’ajout, à chaque ouverture du coffre et chaque nuit — 💸 notification dès qu’il baisse.
          </p>
        </>
      )}
      {(idees.data ?? []).some((i) => !i.image_url) && (
        <Bouton
          variante="discret"
          pleineLargeur
          desactive={visuelsEnCours}
          onClick={() => {
            void (async () => {
              const sansImage = (idees.data ?? []).filter((i) => !i.image_url).slice(0, 25)
              if (sansImage.length === 0) return
              setVisuelsEnCours(true)
              try {
                const images = await chercherVisuels(sansImage.map((i) => i.libelle))
                for (const idee of sansImage) {
                  const image = images[idee.libelle]
                  if (!image) continue
                  await muter({ table: 'idees_cadeaux', type: 'update', cible_id: idee.id, charge: { image_url: image } })
                }
                await rafraichir()
              } finally {
                setVisuelsEnCours(false)
              }
            })()
          }}
        >
          {visuelsEnCours ? 'Recherche des visuels…' : '🖼 Chercher les visuels manquants'}
        </Bouton>
      )}

      <ul className="flex flex-col gap-2">
        {(idees.data ?? []).map((i) => {
          const site = nomDuSite(i.url)
          const historique = i.historique_prix ?? []
          const valeurs = historique.map((h) => h.prix)
          const plusHaut = valeurs.length > 0 ? Math.max(...valeurs) : null
          const baissePct =
            plusHaut !== null && plusHaut > 0 && i.prix !== null && plusHaut - i.prix > 0.01
              ? Math.round(((plusHaut - i.prix) / plusHaut) * 100)
              : null
          const estDepliee = depliee === i.id
          return (
            <li key={i.id} className="overflow-hidden rounded-md bg-fond-sourd">
              <div className="flex items-center gap-2 px-2 py-2">
                <Coche
                  cochee={i.offert}
                  onBascule={() =>
                    void muter({
                      table: 'idees_cadeaux', type: 'update', cible_id: i.id,
                      charge: { offert: !i.offert, offert_le: i.offert ? null : new Date().toISOString().slice(0, 10) },
                    }).then(rafraichir)
                  }
                  etiquette={`Marquer « ${i.libelle} » comme offert`}
                />
                {i.image_url && (
                  <img src={i.image_url} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
                )}
                <button
                  onClick={() => {
                    setConfirmeSuppr(null)
                    setNoteBrouillon(i.note ?? '')
                    setDepliee(estDepliee ? null : i.id)
                  }}
                  aria-expanded={estDepliee}
                  className="flex min-h-sur-tactile min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block text-corps-2 ${i.offert ? 'text-encre-3 line-through' : 'text-encre'}`}>
                      {i.libelle}
                    </span>
                    {(site || i.note) && (
                      <span className="block text-legende text-encre-3">
                        {site}
                        {site && i.note ? ' · ' : ''}
                        {i.note ? '📝' : ''}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    {i.prix !== null ? (
                      <span className="chiffres block text-corps font-[590] text-encre">{i.prix.toFixed(2)} €</span>
                    ) : i.url ? (
                      <span className="block text-legende text-encre-3">prix à venir</span>
                    ) : null}
                    {baissePct !== null && (
                      <span className="block text-legende font-[590] text-fait">↓ −{baissePct} %</span>
                    )}
                  </span>
                  <span aria-hidden="true" className={`shrink-0 text-encre-3 transition-transform ${estDepliee ? 'rotate-90' : ''}`}>
                    ›
                  </span>
                </button>
              </div>

              {estDepliee && (
                <div className="flex flex-col gap-3 border-t border-trait px-3 py-3">
                  {historique.length >= 2 ? (
                    <GrandeCourbe historique={historique} site={site} />
                  ) : i.url ? (
                    <p className="text-legende text-encre-3">
                      La courbe se dessinera au fil des relevés — le prix est vérifié chaque nuit
                      {site ? ` sur ${site}` : ''}.
                    </p>
                  ) : (
                    <p className="text-legende text-encre-3">
                      Idée notée à la main — colle le lien du produit pour suivre son prix.
                    </p>
                  )}

                  <div>
                    <label htmlFor={`note-${i.id}`} className="mb-1 block text-legende font-[590] text-encre-3">
                      📝 Note
                    </label>
                    <textarea
                      id={`note-${i.id}`}
                      value={noteBrouillon}
                      onChange={(e) => setNoteBrouillon(e.target.value)}
                      rows={2}
                      placeholder="taille, couleur, où l’acheter, qui offre quoi…"
                      className="w-full rounded-md border border-trait bg-fond-eleve px-3 py-2 text-corps-2 text-encre"
                    />
                    {noteBrouillon.trim() !== (i.note ?? '').trim() && (
                      <Bouton
                        variante="valider"
                        onClick={() =>
                          void muter({
                            table: 'idees_cadeaux', type: 'update', cible_id: i.id,
                            charge: { note: noteBrouillon.trim() || null },
                          }).then(rafraichir)
                        }
                      >
                        Enregistrer la note
                      </Bouton>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {i.url && (
                      <a
                        href={i.url}
                        target="_blank"
                        rel="noopener"
                        className="btn-3d btn-ardoise min-h-sur-tactile inline-flex items-center justify-center px-4 py-2.5 text-center text-corps-2 leading-tight"
                      >
                        Voir {site ?? 'le site'} ↗
                      </a>
                    )}
                    {i.libelle.length > 3 && (
                      <a
                        href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(i.libelle)}`}
                        target="_blank"
                        rel="noopener"
                        className="btn-3d btn-clair min-h-sur-tactile inline-flex items-center justify-center px-4 py-2.5 text-center text-corps-2 leading-tight"
                      >
                        Comparer les prix
                      </a>
                    )}
                    {i.url && (
                      <Bouton
                        variante="discret"
                        desactive={majUnitaire === i.id}
                        onClick={() => void actualiserUnPrix(i)}
                      >
                        {majUnitaire === i.id ? 'Relevé…' : '🔄 Relever le prix'}
                      </Bouton>
                    )}
                    <Bouton variante="discret" onClick={() => setChoixVisuelPour(i)}>
                      🖼 {i.image_url ? 'Changer le visuel' : 'Choisir un visuel'}
                    </Bouton>
                    <Bouton
                      variante={confirmeSuppr === i.id ? 'urgent' : 'discret'}
                      onClick={() => {
                        if (confirmeSuppr === i.id) void supprimerIdee(i.id)
                        else setConfirmeSuppr(i.id)
                      }}
                    >
                      {confirmeSuppr === i.id ? 'Confirmer ?' : '🗑 Supprimer'}
                    </Bouton>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {(idees.data?.length ?? 0) > 0 && (
        <p className="text-legende text-encre-3">Coché = offert. Touche une idée pour la courbe et les actions.</p>
      )}

      <ChoixVisuel
        ouverte={choixVisuelPour !== null}
        nomInitial={choixVisuelPour?.libelle ?? ''}
        onFermer={() => setChoixVisuelPour(null)}
        onChoix={(image, nom) => {
          const idee = choixVisuelPour
          setChoixVisuelPour(null)
          if (!idee) return
          void muter({
            table: 'idees_cadeaux', type: 'update', cible_id: idee.id,
            charge: { image_url: image, ...(nom && nom !== idee.libelle ? { libelle: nom } : {}) },
          }).then(rafraichir)
        }}
      />

      <div className="mt-2 border-t border-trait pt-3">
        <Bouton
          pleineLargeur
          variante={confirmeSupprCeleb ? 'urgent' : 'discret'}
          onClick={() => {
            if (confirmeSupprCeleb) {
              void muter({ table: 'celebrations', type: 'delete', cible_id: celebration.id, charge: {} }).then(surSuppression)
            } else {
              setConfirmeSupprCeleb(true)
            }
          }}
        >
          {confirmeSupprCeleb ? 'Confirmer la suppression ?' : 'Supprimer cette célébration'}
        </Bouton>
        {confirmeSupprCeleb && (
          <p className="mt-1 text-legende text-encre-3">Les idées de cadeaux associées seront supprimées aussi.</p>
        )}
      </div>
    </div>
  )
}

/** Courbe de prix pleine largeur : min, max, premier et dernier relevé, site. */
function GrandeCourbe({ historique, site }: { historique: { date: string; prix: number }[]; site: string | null }) {
  const valeurs = historique.map((h) => h.prix)
  const min = Math.min(...valeurs)
  const max = Math.max(...valeurs)
  const plage = max - min || 1
  const L = 320
  const H = 72
  const marge = 6
  const points = valeurs
    .map((v, idx) => {
      const x = marge + (idx / Math.max(1, valeurs.length - 1)) * (L - marge * 2)
      const y = marge + (1 - (v - min) / plage) * (H - marge * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const dernier = valeurs[valeurs.length - 1] ?? 0
  const premier = valeurs[0] ?? 0
  const enBaisse = dernier < premier
  const couleur = enBaisse ? 'var(--fait)' : 'var(--ardoise)'
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  const premierJour = historique[0]?.date
  const dernierJour = historique[historique.length - 1]?.date
  return (
    <figure className="m-0">
      <figcaption className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-legende text-encre-3">
          Prix{site ? ` sur ${site}` : ''} — {historique.length} relevé{historique.length > 1 ? 's' : ''}
        </span>
        <span className={`text-legende font-[590] ${enBaisse ? 'text-fait' : 'text-encre-2'}`}>
          {enBaisse ? `↓ ${premier.toFixed(2)} € → ${dernier.toFixed(2)} €` : `${dernier.toFixed(2)} €`}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${L} ${H}`}
        className="w-full rounded-md bg-fond-eleve"
        role="img"
        aria-label="Évolution du prix"
      >
        <polyline
          points={`${points} ${L - marge},${H - marge} ${marge},${H - marge}`}
          fill={couleur}
          opacity="0.12"
          stroke="none"
        />
        <polyline
          points={points}
          fill="none"
          stroke={couleur}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="mt-1 flex justify-between text-legende text-encre-3">
        <span>{premierJour ? formatDate(premierJour) : ''}</span>
        <span className="chiffres">
          plus bas {min.toFixed(2)} € · plus haut {max.toFixed(2)} €
        </span>
        <span>{dernierJour ? formatDate(dernierJour) : ''}</span>
      </div>
    </figure>
  )
}
