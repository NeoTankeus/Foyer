// 🔍 La visionneuse plein écran : pincement à deux doigts, glissement,
// double-tap, et boutons − / + — pour zoomer sur le code-barres d'un billet
// et le présenter au scanner de la salle, même si la détection a échoué.
import { useEffect, useRef, useState } from 'react'

interface Props {
  src: string
  alt: string
  ouverte: boolean
  onFermer: () => void
}

export function VisionneuseZoom({ src, alt, ouverte, onFermer }: Props) {
  const [echelle, setEchelle] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const doigts = useRef(new Map<number, { x: number; y: number }>())
  const pince = useRef<{ distance: number; echelle: number } | null>(null)
  const dernierTap = useRef(0)

  // À chaque ouverture, on repart de l'image entière.
  useEffect(() => {
    if (ouverte) {
      setEchelle(1)
      setTx(0)
      setTy(0)
    }
  }, [ouverte])

  if (!ouverte) return null

  const borner = (e: number) => Math.min(10, Math.max(1, e))

  const surPointerDown = (ev: React.PointerEvent) => {
    ev.currentTarget.setPointerCapture(ev.pointerId)
    doigts.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    if (doigts.current.size === 2) {
      const [a, b] = [...doigts.current.values()]
      if (a && b) pince.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), echelle }
    }
    // Double-tap : zoom ×3 sur place, ou retour à l'image entière.
    if (doigts.current.size === 1) {
      const maintenant = Date.now()
      if (maintenant - dernierTap.current < 300) {
        setEchelle((e) => (e > 1.2 ? 1 : 3))
        setTx(0)
        setTy(0)
      }
      dernierTap.current = maintenant
    }
  }

  const surPointerMove = (ev: React.PointerEvent) => {
    const avant = doigts.current.get(ev.pointerId)
    if (!avant) return
    const apres = { x: ev.clientX, y: ev.clientY }
    doigts.current.set(ev.pointerId, apres)
    if (doigts.current.size === 2 && pince.current) {
      // Pincement : l'écart entre les deux doigts pilote l'échelle.
      const [a, b] = [...doigts.current.values()]
      if (a && b) {
        const distance = Math.hypot(a.x - b.x, a.y - b.y)
        setEchelle(borner((pince.current.echelle * distance) / pince.current.distance))
      }
    } else if (doigts.current.size === 1 && echelle > 1) {
      // Un doigt : on déplace l'image zoomée.
      setTx((v) => v + (apres.x - avant.x))
      setTy((v) => v + (apres.y - avant.y))
    }
  }

  const surPointerUp = (ev: React.PointerEvent) => {
    doigts.current.delete(ev.pointerId)
    if (doigts.current.size < 2) pince.current = null
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="calage-fixe fixed inset-0 z-[60] flex flex-col bg-black"
    >
      <div
        className="relative flex-1 overflow-hidden"
        style={{ touchAction: 'none' }}
        onPointerDown={surPointerDown}
        onPointerMove={surPointerMove}
        onPointerUp={surPointerUp}
        onPointerCancel={surPointerUp}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="absolute inset-0 m-auto max-h-full max-w-full select-none"
          style={{ transform: `translate(${tx}px, ${ty}px) scale(${echelle})` }}
        />
      </div>
      <div
        className="flex items-center justify-center gap-3 bg-black/80 px-4 py-3"
        style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={() => setEchelle((e) => borner(e / 1.5))}
          aria-label="Réduire le zoom"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-[22px] font-[700] text-white"
        >
          −
        </button>
        <button
          onClick={() => { setEchelle(1); setTx(0); setTy(0) }}
          aria-label="Image entière"
          className="rounded-full bg-white/15 px-4 py-3 text-[14px] font-[590] text-white"
        >
          {Math.round(echelle * 100)} %
        </button>
        <button
          onClick={() => setEchelle((e) => borner(e * 1.5))}
          aria-label="Agrandir le zoom"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-[22px] font-[700] text-white"
        >
          +
        </button>
        <button
          onClick={onFermer}
          aria-label="Fermer la visionneuse"
          className="ml-4 flex h-12 w-12 items-center justify-center rounded-full bg-white text-[18px] font-[700] text-black"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
