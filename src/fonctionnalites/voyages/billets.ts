// Billets : décodage costaud (multi-passes, pleine résolution) et régénération
// du code dans son format d'origine — la carte dématérialisée passe les scanners.

export interface BilletDecode {
  texte: string
  format: string
}

/** Canvas pleine résolution (plafonné à 2400 px) depuis un fichier ou une data-URI. */
async function chargerCanvas(source: File | string): Promise<HTMLCanvasElement> {
  let image: CanvasImageSource
  let largeur: number
  let hauteur: number
  if (typeof source === 'string') {
    const img = new Image()
    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = () => rej(new Error('image'))
      img.src = source
    })
    image = img
    largeur = img.naturalWidth
    hauteur = img.naturalHeight
  } else {
    try {
      const bitmap = await createImageBitmap(source)
      image = bitmap
      largeur = bitmap.width
      hauteur = bitmap.height
    } catch {
      const url = URL.createObjectURL(source)
      try {
        const img = new Image()
        await new Promise<void>((res, rej) => {
          img.onload = () => res()
          img.onerror = () => rej(new Error('image'))
          img.src = url
        })
        image = img
        largeur = img.naturalWidth
        hauteur = img.naturalHeight
      } finally {
        URL.revokeObjectURL(url)
      }
    }
  }
  const ratio = Math.min(1, 2400 / Math.max(largeur, hauteur))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(largeur * ratio)
  canvas.height = Math.round(hauteur * ratio)
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

function decouper(source: HTMLCanvasElement, x: number, y: number, l: number, h: number, zoom: number, filtre?: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(l * zoom)
  canvas.height = Math.round(h * zoom)
  const ctx = canvas.getContext('2d')
  if (!ctx) return source.toDataURL('image/jpeg', 0.92)
  if (filtre) ctx.filter = filtre
  ctx.drawImage(source, x, y, l, h, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.92)
}

// Certains billets impriment le code à la VERTICALE : on tourne de 90°.
function tourner(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = source.height
  canvas.height = source.width
  const ctx = canvas.getContext('2d')
  if (!ctx) return source
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(Math.PI / 2)
  ctx.drawImage(source, -source.width / 2, -source.height / 2)
  return canvas
}

/**
 * Décodage multi-passes : image entière, contraste renforcé, centre zoomé,
 * quatre quadrants — jusqu'à ce qu'un code (QR, Aztec, code-barres…) réponde.
 */
export async function decoderBillet(source: File | string): Promise<BilletDecode | null> {
  const [{ BrowserMultiFormatReader }, { DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ])
  const indices = new Map<import('@zxing/library').DecodeHintType, unknown>()
  indices.set(DecodeHintType.TRY_HARDER, true)
  const lecteur = new BrowserMultiFormatReader(indices as never)

  const plein = await chargerCanvas(source)
  const L = plein.width
  const H = plein.height
  const passes: string[] = [
    plein.toDataURL('image/jpeg', 0.92),
    decouper(plein, 0, 0, L, H, 1, 'grayscale(1) contrast(1.8)'),
    decouper(plein, L * 0.15, H * 0.15, L * 0.7, H * 0.7, 1.8),
    decouper(plein, 0, 0, L / 2, H / 2, 2),
    decouper(plein, L / 2, 0, L / 2, H / 2, 2),
    decouper(plein, 0, H / 2, L / 2, H / 2, 2),
    decouper(plein, L / 2, H / 2, L / 2, H / 2, 2),
    decouper(plein, L * 0.1, H * 0.3, L * 0.8, H * 0.4, 2, 'grayscale(1) contrast(2)'),
    // Les billets PDF placent souvent le code dans un COIN ou une bande :
    // bandeaux haut/milieu/bas, bandes gauche/droite, 4 coins zoomés très fort.
    decouper(plein, 0, 0, L, H * 0.35, 2),
    decouper(plein, 0, H * 0.3, L, H * 0.4, 2),
    decouper(plein, 0, H * 0.65, L, H * 0.35, 2),
    decouper(plein, L * 0.55, 0, L * 0.45, H, 2),
    decouper(plein, 0, 0, L * 0.45, H, 2),
    decouper(plein, L * 0.6, 0, L * 0.4, H * 0.4, 3),
    decouper(plein, 0, 0, L * 0.4, H * 0.4, 3),
    decouper(plein, L * 0.6, H * 0.6, L * 0.4, H * 0.4, 3),
    decouper(plein, 0, H * 0.6, L * 0.4, H * 0.4, 3),
    decouper(plein, L * 0.3, 0, L * 0.4, H * 0.4, 3, 'grayscale(1) contrast(1.8)'),
  ]
  // Codes en « négatif » (clair sur fond sombre) : on essaie l'image inversée.
  passes.push(
    decouper(plein, 0, 0, L, H, 1, 'invert(1)'),
    decouper(plein, 0, 0, L, H, 1, 'invert(1) grayscale(1) contrast(1.8)'),
  )
  // Et les mêmes chances pour un code posé à la VERTICALE (billet tourné).
  const pivote = tourner(plein)
  const Lp = pivote.width
  const Hp = pivote.height
  passes.push(
    pivote.toDataURL('image/jpeg', 0.92),
    decouper(pivote, 0, 0, Lp, Hp, 1, 'grayscale(1) contrast(1.8)'),
    decouper(pivote, 0, 0, Lp, Hp * 0.35, 2),
    decouper(pivote, 0, Hp * 0.65, Lp, Hp * 0.35, 2),
  )

  for (const passe of passes) {
    try {
      const resultat = await lecteur.decodeFromImageUrl(passe)
      return { texte: resultat.getText(), format: String(resultat.getBarcodeFormat()) }
    } catch {
      // passe suivante
    }
  }
  return null
}

const FORMATS_BWIP: Record<string, string> = {
  QR_CODE: 'qrcode',
  AZTEC: 'azteccode',
  DATA_MATRIX: 'datamatrix',
  PDF_417: 'pdf417',
  CODE_128: 'code128',
  CODE_39: 'code39',
  EAN_13: 'ean13',
  EAN_8: 'ean8',
  UPC_A: 'upca',
  ITF: 'interleaved2of5',
}

/**
 * Régénère le code dans SON format d'origine (Aztec SNCF compris) — net,
 * contrasté, taille généreuse : c'est lui qu'on présente au scanner.
 */
export async function genererCodeVisuel(texte: string, formatZxing: string): Promise<string | null> {
  const bcid = FORMATS_BWIP[formatZxing]
  if (!bcid) return null
  try {
    const { default: bwipjs } = await import('bwip-js')
    const canvas = document.createElement('canvas')
    const est2D = ['qrcode', 'azteccode', 'datamatrix', 'pdf417'].includes(bcid)
    bwipjs.toCanvas(canvas, {
      bcid,
      text: texte,
      scale: est2D ? 8 : 3,
      height: est2D ? undefined : 18,
      includetext: false,
      paddingwidth: 6,
      paddingheight: 6,
      backgroundcolor: 'FFFFFF',
    })
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

/** Conservé pour compatibilité : QR simple. */
export async function genererQr(texte: string): Promise<string | null> {
  return genererCodeVisuel(texte, 'QR_CODE')
}
