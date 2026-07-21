// Concerts & sorties — le portefeuille de billets hors voyages.
// Même scan que les voyages : QR, code-barres, Aztec. Compte à rebours J-X.
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { lireAvecRepli } from '@/lib/lecture'
import { utiliserSession } from '@/etat/session'
import { differenceInCalendarDays, maintenantLocal } from '@/lib/dates'
import { ajouterSouvenir, compresserImage } from '@/fonctionnalites/souvenirs/donnees'
import { decoderBillet, genererCodeVisuel } from '@/fonctionnalites/voyages/billets'
import { enImages } from '@/lib/pdf'
import type { LigneConcert } from '@/lib/basedonnees.types'
import { Bouton } from '@/design/composants/Bouton'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { EtatVide } from '@/design/composants/EtatVide'
import { BarreRetour } from '@/design/composants/BarreRetour'

export function EcranConcerts() {
  const { membre, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const [ouvert, setOuvert] = useState<LigneConcert | null>(null)
  const [qrRegenere, setQrRegenere] = useState<string | null>(null)
  const [scanEnCours, setScanEnCours] = useState(false)
  const [aCompleter, setACompleter] = useState<LigneConcert | null>(null)
  const champBillet = useRef<HTMLInputElement>(null)
  const champPhotos = useRef<HTMLInputElement>(null)
  const naviguer = useNavigate()
  const [photosEnCours, setPhotosEnCours] = useState(false)

  const ajouterPhotos = async (fichiers: FileList | null) => {
    if (!fichiers || !membre || !foyer || !ouvert) return
    setPhotosEnCours(true)
    for (const fichier of Array.from(fichiers)) {
      const image = await compresserImage(fichier)
      await ajouterSouvenir(foyer.id, membre.id, image, {
        voyage_id: null, dossier: ouvert.titre, lieu: ouvert.lieu, lat: null, lng: null,
      })
    }
    setPhotosEnCours(false)
  }

  const concerts = useQuery({
    queryKey: ['concerts'],
    queryFn: () =>
      lireAvecRepli<LigneConcert>('concerts', async () => {
        const { data, error } = await supabase.from('concerts').select('*').order('date_evenement', { nullsFirst: false })
        if (error) throw error
        return data
      }),
    retry: false,
  })

  const rafraichir = () => clientRequetes.invalidateQueries({ queryKey: ['concerts'] })
  const estAdulte = membre?.role === 'adult'

  const lireInfos = async (image: string) => {
    try {
      const { data: session } = await supabase.auth.getSession()
      const reponse = await fetch('/api/analyser-photo', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ image }),
      })
      const donnees = (await reponse.json()) as {
        proposition?: { evenement: { titre: string; date: string; heure: string | null; lieu: string | null } | null; resume?: string }
      }
      return donnees.proposition ?? null
    } catch {
      return null
    }
  }

  const scanner = async (fichiers: FileList | null) => {
    if (!fichiers?.length || !foyer) return
    setScanEnCours(true)
    try {
      // Les PDF (e-billets) deviennent une image par page ; chaque image
      // devient un billet à part entière.
      const images = (await Promise.all([...fichiers].map((f) => enImages(f)))).flat()
      let premier: LigneConcert | null = null
      for (const fichier of images) {
        // Le code se décode sur l'image ORIGINALE (pleine résolution, multi-passes) ;
        // la version compressée ne sert qu'au stockage et à la lecture des infos.
        const image = await compresserImage(fichier)
        const [decode, infos] = await Promise.all([decoderBillet(fichier), lireInfos(image)])
        const evenement = infos?.evenement
        const dateEvenement = evenement?.date
          ? new Date(`${evenement.date}T${evenement.heure ?? '20:00'}:00`).toISOString()
          : null
        const id = crypto.randomUUID()
        const nouveau: Record<string, unknown> = {
          id, foyer_id: foyer.id, titre: evenement?.titre ?? 'Nouveau billet',
          lieu: evenement?.lieu ?? null, date_evenement: dateEvenement,
          codes_acces: decode?.texte ?? null, format: decode?.format ?? null,
          image_donnees: image, notes: infos?.resume ?? null,
        }
        await muter({ table: 'concerts', type: 'insert', cible_id: id, charge: nouveau })
        premier ??= nouveau as unknown as LigneConcert
      }
      await rafraichir()
      if (premier) setACompleter(premier)
    } finally {
      setScanEnCours(false)
    }
  }

  const ouvrir = async (c: LigneConcert) => {
    setOuvert(c)
    setQrRegenere(null)
    // Régénération dans le format d'origine : QR, Aztec SNCF, code-barres…
    if (c.codes_acces && c.format) {
      setQrRegenere(await genererCodeVisuel(c.codes_acces, c.format))
    }
  }

  const maintenant = maintenantLocal()
  const aVenir = (concerts.data ?? []).filter(
    (c) => !c.date_evenement || new Date(c.date_evenement) >= new Date(maintenant.getTime() - 12 * 3600 * 1000),
  )
  const passes = (concerts.data ?? []).filter(
    (c) => c.date_evenement && new Date(c.date_evenement) < new Date(maintenant.getTime() - 12 * 3600 * 1000),
  )

  return (
    <div className="px-5 pt-3">
      <BarreRetour vers="/nous" />
      <div className="flex items-center justify-between gap-3 pb-3">
        <h2 className="text-titre-3 text-encre">🎤 Concerts & sorties</h2>
        {estAdulte && (
          <Bouton variante="valider" onClick={() => champBillet.current?.click()} desactive={scanEnCours}>
            {scanEnCours ? '…' : '🎫 Scanner un billet'}
          </Bouton>
        )}
      </div>
      <input
        ref={champBillet} type="file" accept="image/*,application/pdf,.pdf" multiple hidden
        aria-hidden="true" onChange={(e) => { void scanner(e.target.files); e.target.value = '' }}
      />

      {concerts.isError ? (
        <EtatVide
          titre="Une mise à jour de la base est nécessaire"
          message="Colle le fichier « mise-a-jour-concerts.sql » (envoyé dans la conversation) dans Supabase → SQL Editor → Run, puis reviens ici."
        />
      ) : (
        <>
          {aVenir.length === 0 && !concerts.isLoading && (
            <EtatVide
              titre="Aucune sortie prévue"
              message="Scanne une place de concert, de spectacle ou de match — elle t’attendra ici, même sans réseau devant la salle."
            />
          )}

          <ul className="flex flex-col gap-2">
            {aVenir.map((c) => {
              const dans = c.date_evenement
                ? differenceInCalendarDays(new Date(c.date_evenement), maintenant)
                : null
              return (
                <li key={c.id}>
                  <button
                    onClick={() => void ouvrir(c)}
                    className="flex w-full items-center gap-3 rounded-xl bg-fond-eleve p-4 text-left shadow-carte"
                  >
                    <span className="text-[28px]" aria-hidden="true">🎫</span>
                    <div className="flex-1">
                      <p className="text-corps font-[590] text-encre">{c.titre}</p>
                      <p className="text-note text-encre-3">
                        {c.lieu ?? ''}
                        {c.date_evenement
                          ? `${c.lieu ? ' · ' : ''}${new Date(c.date_evenement).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                          : ''}
                      </p>
                    </div>
                    {dans !== null && dans >= 0 && (
                      <span className="chiffres text-note font-[700] text-ardoise">J-{dans}</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>

          {passes.length > 0 && (
            <details className="mt-4">
              <summary className="min-h-sur-tactile text-note text-encre-3">
                Sorties passées ({passes.length})
              </summary>
              <ul className="mt-1 flex flex-col gap-1 opacity-60">
                {passes.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => void ouvrir(c)} className="w-full rounded-md bg-fond-eleve px-3 py-2 text-left text-corps-2 text-encre-2">
                      {c.titre}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {/* Le billet, prêt pour l'entrée */}
      <Feuille ouverte={ouvert !== null} onFermer={() => setOuvert(null)} titre={ouvert?.titre ?? 'Billet'}>
        {ouvert && (
          <div className="flex flex-col items-center gap-3">
            {/* La carte billet — dématérialisée, prête pour le scanner */}
            <div className="w-full overflow-hidden rounded-2xl shadow-carte">
              <div className="degrade-froid p-4 text-white">
                <p className="text-note uppercase tracking-widest opacity-80">Billet</p>
                <p className="text-titre-3 font-[700]">{ouvert.titre}</p>
                <p className="chiffres text-corps-2 opacity-90">
                  {ouvert.date_evenement
                    ? new Date(ouvert.date_evenement).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
                    : 'date à préciser'}
                </p>
                {ouvert.lieu && <p className="text-note opacity-80">📍 {ouvert.lieu}</p>}
              </div>
              <div className="relative border-t-2 border-dashed border-trait bg-white p-4">
                <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-fond" aria-hidden="true" />
                <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-fond" aria-hidden="true" />
                {qrRegenere ? (
                  <div className="flex flex-col items-center gap-1">
                    <img src={qrRegenere} alt="Code du billet, régénéré" className="max-h-64 w-auto max-w-full" />
                    <p className="chiffres text-legende text-encre-3">
                      {ouvert.format} — régénéré net, monte la luminosité à l’entrée
                    </p>
                  </div>
                ) : ouvert.image_donnees ? (
                  <div className="flex flex-col items-center gap-1">
                    <img src={ouvert.image_donnees} alt="Billet scanné" className="w-full rounded-md" />
                    <p className="text-legende text-encre-3">
                      Code non détecté sur la photo — reprends-la bien à plat, sans reflet, le code plein cadre.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex w-full gap-2">
              <Bouton
                variante="soleil"
                pleineLargeur
                desactive={photosEnCours}
                onClick={() => champPhotos.current?.click()}
              >
                {photosEnCours ? 'Ajout…' : '📷 Photos du concert'}
              </Bouton>
              <Bouton
                variante="discret"
                pleineLargeur
                onClick={() => naviguer(`/nous/souvenirs?dossier=${encodeURIComponent(ouvert.titre)}`)}
              >
                Voir l’album
              </Bouton>
            </div>
            <input
              ref={champPhotos} type="file" accept="image/*" multiple hidden aria-hidden="true"
              onChange={(e) => void ajouterPhotos(e.target.files)}
            />
            {estAdulte && (
              <div className="flex w-full gap-2">
                <Bouton variante="discret" pleineLargeur onClick={() => { setACompleter(ouvert); setOuvert(null) }}>
                  Modifier
                </Bouton>
                <Bouton
                  variante="urgent"
                  onClick={() => {
                    void muter({ table: 'concerts', type: 'delete', cible_id: ouvert.id, charge: {} }).then(rafraichir)
                    setOuvert(null)
                  }}
                >
                  Supprimer
                </Bouton>
              </div>
            )}
          </div>
        )}
      </Feuille>

      {/* Compléter les infos après le scan */}
      <Feuille ouverte={aCompleter !== null} onFermer={() => setACompleter(null)} titre="Infos du billet">
        {aCompleter && (
          <FormConcert
            initial={aCompleter}
            surEnregistrement={async (valeurs) => {
              await muter({ table: 'concerts', type: 'update', cible_id: aCompleter.id, charge: valeurs })
              await rafraichir()
              setACompleter(null)
            }}
          />
        )}
      </Feuille>
    </div>
  )
}

function FormConcert({
  initial,
  surEnregistrement,
}: {
  initial: LigneConcert
  surEnregistrement: (v: { titre: string; lieu: string | null; date_evenement: string | null }) => Promise<void>
}) {
  const [titre, setTitre] = useState(initial.titre === 'Nouveau billet' ? '' : initial.titre)
  const [lieu, setLieu] = useState(initial.lieu ?? '')
  const [quand, setQuand] = useState(initial.date_evenement?.slice(0, 16) ?? '')
  return (
    <div className="flex flex-col gap-3">
      <ChampTexte etiquette="Quoi ?" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Concert de…, match, spectacle…" />
      <ChampTexte etiquette="Où ? (facultatif)" value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="Zénith de Nantes" />
      <ChampTexte etiquette="Quand ? (facultatif)" type="datetime-local" value={quand} onChange={(e) => setQuand(e.target.value)} />
      <Bouton
        pleineLargeur
        variante="valider"
        onClick={() => {
          if (!titre.trim()) return
          void surEnregistrement({
            titre: titre.trim(),
            lieu: lieu.trim() || null,
            date_evenement: quand ? new Date(quand).toISOString() : null,
          })
        }}
      >
        Enregistrer
      </Bouton>
    </div>
  )
}
