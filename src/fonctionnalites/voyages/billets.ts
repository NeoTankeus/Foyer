// Billets scannés : décodage QR / code-barres / Aztec (billets SNCF) depuis une
// photo, et régénération d'un QR net pour le portillon. Libs chargées à la demande.

export interface BilletDecode {
  texte: string
  format: string
}

/** Tente de lire le code d'une photo de billet. null si illisible (on garde la photo). */
export async function decoderBillet(imageDataUri: string): Promise<BilletDecode | null> {
  try {
    const { BrowserMultiFormatReader } = await import('@zxing/browser')
    const lecteur = new BrowserMultiFormatReader()
    const resultat = await lecteur.decodeFromImageUrl(imageDataUri)
    return { texte: resultat.getText(), format: String(resultat.getBarcodeFormat()) }
  } catch {
    return null
  }
}

/** Régénère un QR net et lumineux à partir du texte décodé (pour les QR d'origine). */
export async function genererQr(texte: string): Promise<string | null> {
  try {
    const QRCode = await import('qrcode')
    return await QRCode.toDataURL(texte, { width: 480, margin: 2 })
  } catch {
    return null
  }
}
