// 📄 → 🖼 Les billets arrivent souvent en PDF : chaque page est rendue en
// image nette directement sur le téléphone (pdfjs, chargé à la demande),
// puis suit le circuit habituel des billets — QR décodé, rangement, entrée.
export async function pagesEnImages(fichier: File, maxPages = 10): Promise<File[]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker

  const document_ = await pdfjs.getDocument({ data: await fichier.arrayBuffer() }).promise
  const pages: File[] = []
  const nom = fichier.name.replace(/\.pdf$/i, '')
  for (let n = 1; n <= Math.min(document_.numPages, maxPages); n += 1) {
    const page = await document_.getPage(n)
    // Échelle 3 : assez fin pour décoder même un petit code dans un coin.
    const vue = page.getViewport({ scale: 3 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(vue.width)
    canvas.height = Math.ceil(vue.height)
    const contexte = canvas.getContext('2d')
    if (!contexte) continue
    // FOND BLANC obligatoire : beaucoup de PDF ont un fond transparent — sans
    // ça, le JPEG sort tout NOIR et le code-barres devient indétectable.
    contexte.fillStyle = '#ffffff'
    contexte.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: contexte, viewport: vue, background: 'rgba(255,255,255,1)' }).promise
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.92))
    if (blob) pages.push(new File([blob], `${nom}-page${n}.jpg`, { type: 'image/jpeg' }))
  }
  return pages
}

/** Un fichier « pièce jointe » quelconque → une liste d'images exploitables. */
export async function enImages(fichier: File): Promise<File[]> {
  if (fichier.type === 'application/pdf' || /\.pdf$/i.test(fichier.name)) {
    return pagesEnImages(fichier)
  }
  return [fichier]
}
