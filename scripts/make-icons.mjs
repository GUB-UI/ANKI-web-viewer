// Rasterizes public/icons/icon-512.svg into the PNG sizes iOS needs.
// Uses the Chromium that Playwright already provides, so no extra dependency.
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const root = path.resolve(import.meta.dirname, '..')
const source = path.join(root, 'public/icons/icon-512.svg')
const targets = [180, 192, 512]

const svg = fs.readFileSync(source, 'utf8')
const browser = await chromium.launch()

try {
  for (const size of targets) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    })
    await page.setContent(
      `<!doctype html><html><body style="margin:0">
       <div style="width:${size}px;height:${size}px">${svg}</div>
       </body></html>`,
    )
    const out = path.join(root, `public/icons/icon-${size}.png`)
    await page.screenshot({ path: out, omitBackground: true })
    await page.close()
    console.log('wrote', path.relative(root, out))
  }
} finally {
  await browser.close()
}
