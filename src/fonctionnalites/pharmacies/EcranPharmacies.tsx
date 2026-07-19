// 💊 Pharmacies : les plus proches de toi avec téléphone, horaires et
// itinéraire — et le réflexe officiel « de garde » (3237) pour le dimanche
// soir où tout est fermé.
import { useState } from 'react'
import { chercherLieux, type LieuAutour } from '@/lib/lieux'
import { BarreRetour } from '@/design/composants/BarreRetour'
import { Bouton } from '@/design/composants/Bouton'
import { Carte } from '@/design/composants/Carte'
import { EtatVide } from '@/design/composants/EtatVide'

export function EcranPharmacies() {
  const [etat, setEtat] = useState<'attente' | 'cherche' | 'pret' | 'erreur'>('attente')
  const [pharmacies, setPharmacies] = useState<LieuAutour[]>([])
  const [erreur, setErreur] = useState('')

  const lancer = () => {
    setEtat('cherche')
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        chercherLieux(pos.coords.latitude, pos.coords.longitude, 5000, 'pharmacy', 'pharmacies')
          .then((liste) => {
            setPharmacies(liste)
            setEtat('pret')
          })
          .catch((e: unknown) => {
            setErreur(String(e instanceof Error ? e.message : e))
            setEtat('erreur')
          })
      },
      () => {
        setErreur('Position refusée — autorise la localisation (comme pour les restaurants).')
        setEtat('erreur')
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    )
  }

  const dimancheOuSoir = (() => {
    const maintenant = new Date()
    return maintenant.getDay() === 0 || maintenant.getHours() >= 20 || maintenant.getHours() < 8
  })()

  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <BarreRetour />
        <h1 className="text-titre-2 text-encre">💊 Pharmacies</h1>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-3">
        <Carte>
          <p className="text-corps-2 font-[590] text-encre">🌙 Besoin d'une pharmacie DE GARDE (nuit, dimanche, férié) ?</p>
          <p className="mt-1 text-corps-2 text-encre-2">
            Le service officiel, partout en France : appelle le <strong>32 37</strong> (0,35 €/min) — il te donne LA
            pharmacie de garde du moment, information que seules les autorités connaissent en temps réel.
          </p>
          <a
            href="tel:3237"
            className={`btn-3d btn-clair mt-2 inline-flex min-h-sur-tactile items-center justify-center px-4 py-2.5 text-corps-2 ${dimancheOuSoir ? 'font-[700]' : ''}`}
          >
            📞 Appeler le 32 37
          </a>
        </Carte>

        {etat === 'attente' && (
          <Bouton pleineLargeur variante="primaire" onClick={lancer}>
            📍 Les pharmacies autour de moi
          </Bouton>
        )}
        {etat === 'cherche' && <p className="py-6 text-center text-corps-2 text-encre-3">💊 Recherche des pharmacies…</p>}
        {etat === 'erreur' && (
          <div className="flex flex-col gap-2">
            <p className="text-corps-2 text-encre-2">{erreur}</p>
            <Bouton pleineLargeur variante="primaire" onClick={lancer}>Réessayer</Bouton>
          </div>
        )}
        {etat === 'pret' && pharmacies.length === 0 && (
          <EtatVide titre="Aucune pharmacie à moins de 5 km" message="Le 32 37 reste ton meilleur allié." />
        )}

        <ul className="flex flex-col gap-2">
          {pharmacies.slice(0, 12).map((p) => (
            <li key={p.id} className="rounded-xl bg-fond-eleve p-3 shadow-carte">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-corps-2 font-[590] leading-snug text-encre">{p.nom}</p>
                  <p className="text-legende text-encre-3">
                    {p.distanceM < 1000 ? `${p.distanceM} m` : `${(p.distanceM / 1000).toFixed(1)} km`}
                    {p.horaires ? ` · ${p.horaires.slice(0, 60)}` : ''}
                  </p>
                </div>
                {p.telephone && (
                  <a
                    href={`tel:${p.telephone.replace(/[\s.-]/g, '')}`}
                    aria-label={`Appeler ${p.nom}`}
                    className="flex min-h-sur-tactile min-w-sur-tactile items-center justify-center rounded-full bg-fond-sourd text-[16px]"
                  >
                    📞
                  </a>
                )}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}&travelmode=driving`}
                  target="_blank"
                  rel="noopener"
                  aria-label={`Itinéraire vers ${p.nom}`}
                  className="flex min-h-sur-tactile min-w-sur-tactile items-center justify-center rounded-full bg-fond-sourd text-[16px]"
                >
                  🧭
                </a>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
