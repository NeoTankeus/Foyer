// 🔍 Vérifie le CLASSEMENT de la recherche du menu : ce qu'on tape doit sortir
// la fonction dont le TITRE correspond, seule et en premier.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { chromium } from 'playwright-core'

const DOSSIER = new URL('../dist-essai/', import.meta.url).pathname
const serveur = createServer(async (rq, rp) => {
  const chemin = decodeURIComponent((rq.url ?? '/').split('?')[0])
  for (const c of [join(DOSSIER, chemin), join(DOSSIER, 'index.html')]) {
    try {
      const t = await readFile(c)
      const type = extname(c) === '.js' ? 'text/javascript' : extname(c) === '.css' ? 'text/css' : 'text/html; charset=utf-8'
      rp.writeHead(200, { 'content-type': type })
      rp.end(t)
      return
    } catch {}
  }
  rp.writeHead(404).end('x')
})
await new Promise((r) => serveur.listen(0, r))
const port = serveur.address().port
const version = JSON.parse(await readFile(join(DOSSIER, 'version.json'), 'utf8')).version

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] })
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'fr-FR' })
await ctx.addInitScript((v) => {
  try {
    localStorage.setItem('sb-essai-auth-token', JSON.stringify({ access_token: 'x', expires_at: Math.floor(Date.now() / 1000) + 99999, refresh_token: 'y', user: { id: 'user-essai', aud: 'authenticated', role: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {}, created_at: '2024-01-01T00:00:00Z' } }))
    localStorage.setItem('stg-profil', JSON.stringify({ membre: { id: 'm', foyer_id: 'f', auth_user_id: 'user-essai', prenom: 'S', role: 'adult', couleur: 'sauge', points: 0, modules_autorises: [], cree_le: '2024-01-01' }, membres: [], foyer: { id: 'f', nom: 'F', fuseau: 'Europe/Paris', reglages: {}, cree_le: '2024-01-01' } }))
    localStorage.setItem('foyer-version-vue', v)
  } catch {}
}, version)
await ctx.route('**/*', (r) => (r.request().url().includes(`127.0.0.1:${port}`) ? r.continue() : r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })))

const page = await ctx.newPage()
await page.goto(`http://127.0.0.1:${port}/nous`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)

for (const saisie of ['voy', 'met', 'bouchon', 'bonne adr', 'gabriel', 'resto', 'essence', 'frigo', 'anniv', 'tra']) {
  await page.getByLabel('Chercher une fonction', { exact: false }).first().click().catch(async () => {
    await page.locator('button[aria-label="Chercher une fonction"]').click()
  })
  await page.waitForTimeout(300)
  const champ = page.locator('input[aria-label="Chercher une fonction"]')
  await champ.fill(saisie)
  await page.waitForTimeout(400)
  const texte = await page.locator('body').innerText()
  const apres = texte.split('fonction')[0]
  const lignes = (await page.locator('nav[aria-label="Résultats de la recherche"] button').allInnerTexts()).map((t) => t.split('\n').filter((x) => x.trim() && x.trim().length > 2)[0] ?? t)
  const autres = (await page.locator('nav[aria-label="Autres résultats"] button').allInnerTexts()).map((t) => t.split('\n').filter((x) => x.trim() && x.trim().length > 2)[0] ?? t)
  console.log(`« ${saisie} »\n   principaux : ${lignes.filter((l) => l && l !== '☆' && l !== '★').join(' | ') || '—'}\n   ensuite    : ${autres.filter((l) => l && l !== '☆' && l !== '★').slice(0, 6).join(' | ') || '—'}`)
  void apres
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
}
await nav.close()
serveur.close()
