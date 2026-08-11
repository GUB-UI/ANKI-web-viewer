import fs from 'node:fs'
import path from 'node:path'
import initSqlJs from 'sql.js'
import JSZip from 'jszip'

const outDir = process.argv[2] || 'e2e/fixtures'
fs.mkdirSync(outDir, { recursive: true })

const SQL = await initSqlJs()
const db = new SQL.Database()
db.run(`
CREATE TABLE col (
  id integer primary key, crt integer, mod integer, scm integer, ver integer,
  dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text
);
CREATE TABLE notes (
  id integer primary key, guid text, mid integer, mod integer, usn integer,
  tags text, flds text, sfld text, csum integer, flags integer, data text
);
CREATE TABLE cards (
  id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer,
  type integer, queue integer, due integer, ivl integer, factor integer, reps integer,
  lapses integer, left integer, odue integer, odid integer, flags integer, data text
);
CREATE TABLE revlog (
  id integer primary key, cid integer, usn integer, ease integer, ivl integer,
  lastIvl integer, factor integer, time integer, type integer
);
`)

const models = {
  1: {
    id: 1,
    name: 'Basic',
    type: 0,
    flds: [{ name: 'Front' }, { name: 'Back' }],
    tmpls: [{ name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id=answer>{{Back}}' }],
  },
  2: {
    id: 2,
    name: 'Cloze',
    type: 1,
    flds: [{ name: 'Text' }, { name: 'Back Extra' }],
    tmpls: [{ name: 'Cloze', qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}<br>{{Back Extra}}' }],
  },
}
const decks = {
  1: { id: 1, name: 'Default' },
  100: { id: 100, name: '英語' },
  101: { id: 101, name: '英語::ターゲット' },
  102: { id: 102, name: '英語::ターゲット::Section1' },
}
const dconf = { 1: { id: 1, new: { perDay: 20 } } }
const now = Math.floor(Date.now() / 1000)
const crt = now - 40 * 86400

db.run(`INSERT INTO col VALUES (1,?,?,?,11,0,-1,0,'{}',?,?,?,'')`, [
  crt,
  now,
  now,
  JSON.stringify(models),
  JSON.stringify(decks),
  JSON.stringify(dconf),
])

const basics = [
  ['ubiquitous', '至る所にある'],
  ['abandon', '捨てる'],
  ['precise', '正確な'],
]
basics.forEach(([f, b], i) => {
  const nid = 1000 + i
  const cid = 2000 + i
  db.run(`INSERT INTO notes VALUES (?,?,1,?,?,?,?,?,?,0,'')`, [
    nid,
    `guid${i}`,
    now,
    -1,
    ' vocab ',
    `${f}\x1f${b}`,
    f,
    0,
  ])
  db.run(
    `INSERT INTO cards VALUES (?,?,102,0,?,?,0,0,0,0,2500,0,0,0,0,0,0,'')`,
    [cid, nid, now, -1],
  )
})

// one review card due yesterday
db.run(`INSERT INTO notes VALUES (?,?,1,?,?,?,?,?,?,0,'')`, [
  1100,
  'guid-rev',
  now,
  -1,
  '',
  `legacy\x1f古い`,
  'legacy',
  0,
])
db.run(
  `INSERT INTO cards VALUES (2100,1100,102,0,?,?,2,2,?,10,2500,5,0,0,0,0,0,'')`,
  [now, -1, 39],
)

// cloze note with 2 clozes => 2 cards
const clozeText = 'The capital of Japan is {{c1::Tokyo}} near {{c2::Yokohama}}.'
db.run(`INSERT INTO notes VALUES (?,?,2,?,?,?,?,?,?,0,'')`, [
  1200,
  'guid-cloze',
  now,
  -1,
  '',
  `${clozeText}\x1f`,
  'The capital',
  0,
])
db.run(`INSERT INTO cards VALUES (2200,1200,101,0,?,?,0,0,0,0,2500,0,0,0,0,0,0,'')`, [
  now,
  -1,
])
db.run(`INSERT INTO cards VALUES (2201,1200,101,1,?,?,0,0,0,0,2500,0,0,0,0,0,0,'')`, [
  now,
  -1,
])

// again history for custom study
const againAt = Date.now() - 2 * 86400000
db.run(`INSERT INTO revlog VALUES (?,?, -1, 1, -10, -10, 0, 1000, 0)`, [
  againAt,
  2000,
])

const data = db.export()
const zip = new JSZip()
zip.file('collection.anki2', data)
zip.file('media', '{}')
const buf = await zip.generateAsync({ type: 'nodebuffer' })
const out = path.join(outDir, 'sample.apkg')
fs.writeFileSync(out, buf)
console.log('wrote', out, buf.length)
