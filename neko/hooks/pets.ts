import type { NekoMood, NekoPet } from '../types'

// The companions the band can draw. Each is four rows of a template in which
// {L} and {R} are the eyes, {H} what it holds while Claude works and {T} its
// tail (or spout), swung by the idle animation. Widths are
// counted per cell (cellWidth), so a combining mark takes none.
export type Pet = {
  // Its name in the bubble's title and in what it says.
  call: string
  // What kind of animal it is, for /neko pet.
  label: string
  // How it sometimes ends a line.
  flourish: string
  // The colour of its outline; undefined draws in the terminal's own.
  color?: string
  rows: readonly [string, string, string, string]
  // The row the face is on, where the mood's mark floats; 1 when left out.
  faceRow?: number
  // The one-line face for a narrow band and for /neko answers.
  mini: string
  tails: readonly [string, string]
  // Eyes it draws in place of the shared ones for some moods.
  eyes?: Partial<Record<NekoMood, string>>
  // How it looks in pixels on a terminal.
  sprite: Sprite
}

// A pet in pixels, two to a terminal cell, drawn with ▀ ▄ █ and a background
// colour the way Claude Code's own mascot is.
export type Sprite = {
  // Eight rows: '.' is empty, 'e' an eye (both pixels of one cell), 't' and
  // 'u' the tail on either swing, any other letter a colour of `colors`.
  pixels: readonly [string, string, string, string, string, string, string, string]
  // 'b' is the body. 's' shows round a shut eye and 't' is the tail, both 'b'
  // when left out.
  colors: Readonly<Record<string, string>>
  // The cell [column, row] that shows what it holds while Claude works.
  hold: readonly [number, number]
}

export const PETS: Record<NekoPet, Pet> = {
  cat: {
    call: 'เหมียว',
    label: 'แมว',
    flourish: 'เมี้ยว~',
    color: '#ff8fb8',
    rows: ['   /\\_/\\', '  (={L}ω{R}=)', '  ฅ( {H} )ฅ', '  (")_(") {T}'],
    mini: 'ฅ(={L}ω{R}=)ฅ',
    tails: ['~', 'ʃ'],
    sprite: {
      pixels: [
        '.b.....b......',
        '.ab...ba....t.',
        'bbebbbebb..t.t',
        'bbebbbebb..t..',
        'bbbbabbbb..t..',
        '.bbbbbbb...t..',
        '.bwwwwwbb.t..u',
        'bbwwwwwbbbuuu.',
      ],
      colors: { b: '#ff8fb8', a: '#ff5f87', w: '#ffe0ec' },
      hold: [4, 3],
    },
  },
  dog: {
    call: 'โฮ่ง',
    label: 'หมา',
    flourish: 'โฮ่ง~',
    color: '#d7af87',
    rows: ['   .---.', '  U({L}ᴥ{R})U', '  ฅ( {H} )ฅ', '  (")_(") {T}'],
    mini: 'U({L}ᴥ{R})U',
    tails: ['⌒', '~'],
    sprite: {
      pixels: [
        '.aabbbbbaa....',
        'aabbbbbbbaa...',
        'aabebbbebaa...',
        'a.bebbbeb.a...',
        '..bwwdwwb...t.',
        '..bbwwwbb..t..',
        '.bbwwwwwbbbuu.',
        '.bwwbbbwwb....',
      ],
      colors: { b: '#d7af87', a: '#8a5a3c', w: '#f5e6d3', d: '#3a2a1a' },
      hold: [5, 3],
    },
  },
  wolf: {
    call: 'หมาป่า',
    label: 'หมาป่า',
    flourish: 'อาวู้ว~',
    color: '#a8a8a8',
    // The person's own drawing. The Thaana sukun leading the face row is a
    // combining mark: the space before it gives it something to sit on.
    rows: ['', '    ႔ ႔       ⸝    ,', ' ްᠸ{L} {R}   𐅠   /    {T}', '   |  {H}  \\   ꠹    ʃ'],
    faceRow: 2,
    mini: 'ʌ({L}ᴥ{R})ʌ',
    tails: ['ʃ', '~'],
    eyes: { idle: '-' },
    sprite: {
      pixels: [
        'b.......b.....',
        'bb.....bb.....',
        'babbbbbab..tt.',
        'bebbbbbeb.tt..',
        'bebbbbbeb.tt..',
        'wwbbdbbww.t...',
        '.bwwwwwbbt.uuu',
        '.bwwwwwbbbuuu.',
      ],
      colors: { b: '#a8a8a8', w: '#e8e8e8', d: '#3a3a3a', a: '#6c6c6c' },
      hold: [4, 3],
    },
  },
  bird: {
    call: 'จิ๊บ',
    label: 'นก',
    flourish: 'จิ๊บๆ~',
    color: '#87d7ff',
    rows: ['    \\|/', '   ({L}v{R})', '  ʚ( {H} )ɞ', '    ᴧ ᴧ {T}'],
    mini: 'ʚ({L}v{R})ɞ',
    tails: ['♪', ' '],
    sprite: {
      pixels: [
        '....bb......',
        '..bbbbbb....',
        '.bbebbebb...',
        '.bbebbebb...',
        '.bbbaabbb...',
        'dbbwwwwbbdt.',
        '.bbwwwwbb.tu',
        '..awwwwa..u.',
      ],
      colors: { b: '#87d7ff', a: '#ffaf00', w: '#e4f6ff', d: '#5fafd7' },
      hold: [5, 3],
    },
  },
  owl: {
    call: 'ฮูก',
    label: 'นกฮูก',
    flourish: 'ฮู้ก~',
    color: '#d7875f',
    rows: ['   ,___,', '  ( {L},{R} )', '  /( {H} )\\', '  ──┴─┴── {T}'],
    mini: '({L},{R})',
    tails: [' ', '·'],
    eyes: { idle: 'O', thinking: 'O' },
    sprite: {
      pixels: [
        '.b.......b.',
        '.bbbbbbbbb.',
        '.bwewbwewb.',
        '.bwewbwewb.',
        '.dbbbabbbd.',
        'ddbwwwwwbdd',
        '.dbwwwwwbd.',
        'ggggagagggg',
      ],
      colors: { b: '#d7875f', a: '#ffaf00', w: '#f5deb3', d: '#af5f3f', s: '#f5deb3', g: '#5f3f1f' },
      hold: [5, 3],
    },
  },
  fish: {
    call: 'ปลาน้อย',
    label: 'ปลา',
    flourish: 'บุ๋งๆ~',
    color: '#ffaf5f',
    rows: ['        o', '       ° {H}', '  {T}((({L}>', ' ~~~~~~~~~~'],
    mini: '><((({L}>',
    tails: ['><', '>-'],
    sprite: {
      pixels: [
        '............c.',
        '......aaa..c..',
        'tt..bbwbbebb..',
        '.tbbbbwbbebbb.',
        'uubbbbwbbbbbbb',
        '.tbbbbwbbbbaa.',
        'tt..bbwbbbb...',
        '......aa......',
      ],
      colors: { b: '#ffaf5f', a: '#ff8700', w: '#ffffff', c: '#87d7ff' },
      hold: [7, 2],
    },
  },
  whale: {
    call: 'วาฬ',
    label: 'ปลาวาฬ',
    flourish: 'ฟู่ว~',
    color: '#5f87ff',
    rows: ['     {T}', '  .-~~~~~-.', ' (  {L}  {H}  )=<', '  `-.___.-´'],
    mini: '( {L} )=<',
    tails: [',:,', '.:.'],
    sprite: {
      pixels: [
        '..t.t...........',
        '...t..u.........',
        '..bbbbbbb.......',
        '.bbbbbbbbbb...bb',
        'bbebbbbbbbbbbbb.',
        'bbebbbbbbbbbbb..',
        'wwwwwwwwbbbb....',
        '.wwwwwwww.......',
      ],
      colors: { b: '#5f87ff', w: '#c8d7ff', t: '#87d7ff' },
      hold: [6, 2],
    },
  },
  shark: {
    call: 'ฉลาม',
    label: 'ฉลาม',
    flourish: 'งับๆ~',
    color: '#87afaf',
    rows: ['      /|', '  ___/_|___', ' /{L}  {H}  ≡ \\{T}', ' \\vvvv_____/'],
    mini: '/({L}≡)>',
    tails: ['<', '/'],
    sprite: {
      pixels: [
        '........b......t',
        '.......bb.....tu',
        '...bbbbbbbbb.bb.',
        '.bbbbbbbbbbbbb..',
        'bbebbbbbbbbbbb..',
        'bbebbbbbbbbbbbb.',
        'wdwdwwwwwbbb..tu',
        '.wwwwwwww......t',
      ],
      colors: { b: '#87afaf', w: '#eef4f4', d: '#3a4a4a' },
      hold: [7, 2],
    },
  },
  elephant: {
    call: 'ช้างน้อย',
    label: 'ช้าง',
    flourish: 'แป๋น~',
    color: '#b2b2b2',
    rows: ['   _.-._', ' (( {L}ʃ{R} ))', '  ∩( {H} )∩', '  (_)─(_) {T}'],
    mini: '(({L}ʃ{R}))',
    tails: ['~', 'ʃ'],
    sprite: {
      pixels: [
        '..bbbbbbb.....',
        'bbbbbbbbbbb...',
        'babebbbebab...',
        'babebbbebab...',
        'bab.bbb.bab...',
        '.bb.wbw.bb..t.',
        '....bbbbbbbt.u',
        '...bb..bbbbbuu',
      ],
      colors: { b: '#b2b2b2', a: '#ffafaf', w: '#ffffff' },
      hold: [7, 3],
    },
  },
  horse: {
    call: 'ม้า',
    label: 'ม้า',
    flourish: 'ฮี้~',
    color: '#af875f',
    rows: ['   /\\ /\\', '  /({L}ᴗ{R})\\', '  ∩( {H} )∩', '  (_)─(_) {T}'],
    mini: '/({L}ᴗ{R})\\',
    tails: ['ʃ', '~'],
    sprite: {
      pixels: [
        '..b...........',
        '.bbaa.........',
        'bbebaa........',
        'bbebbaa.....t.',
        'wbb..bbbbbbbt.',
        'ww...bbbbbbbbu',
        '.....bb...bbtu',
        '.....dd...dd..',
      ],
      colors: { b: '#af875f', a: '#5f3f1f', w: '#e0c8a8', d: '#3a2a1a' },
      hold: [8, 2],
    },
  },
  cow: {
    call: 'วัว',
    label: 'วัว',
    flourish: 'มอ~',
    rows: ['   ^____^', '  ({L}(oo){R})', '  ∩( {H} )∩', '  (_)─(_) {T}'],
    mini: '^({L}(oo){R})^',
    tails: ['~', 'ʃ'],
    sprite: {
      pixels: [
        'w.......w....',
        'bbddbbbbbb...',
        'bebdbbbebb...',
        'bebbbbbebb...',
        '.aaaaaaaa..t.',
        '.adaaaada.t.u',
        '.bbddbbbbbuu.',
        '.bb.bb.bb....',
      ],
      colors: { b: '#e4e4e4', a: '#ffafaf', w: '#ffe4b5', d: '#303030' },
      hold: [5, 3],
    },
  },
}

export const PET_IDS = Object.keys(PETS) as NekoPet[]

// The eyes every companion shares, by mood.
export const EYES: Record<NekoMood, string> = {
  idle: '•',
  working: '-',
  happy: '^',
  worried: ';',
  sleepy: 'ᴗ',
  thinking: '•',
}

export const BLINK_EYE = '-'

export function eyeOf(pet: Pet, mood: NekoMood, isBlinking: boolean): string {
  return isBlinking ? BLINK_EYE : (pet.eyes?.[mood] ?? EYES[mood])
}

// A pet named by its id or its Thai label, or undefined.
export function findPet(name: string): NekoPet | undefined {
  const wanted = name.trim().toLowerCase()

  return PET_IDS.find(id => id === wanted || PETS[id].label === wanted || PETS[id].call === wanted)
}

// One piece of a row: the outline's text, or one of its tokens.
export type Piece = { text: string; kind: 'outline' | 'eye' | 'held' | 'tail' }

// A template split into its pieces, tokens filled in.
export function pieces(template: string, eye: string, held: string, tail: string): Piece[] {
  return template
    .split(/(\{[LRHT]\})/)
    .filter(part => part !== '')
    .map(part =>
      part === '{L}' || part === '{R}'
        ? { text: eye, kind: 'eye' }
        : part === '{H}'
          ? { text: held, kind: 'held' }
          : part === '{T}'
            ? { text: tail, kind: 'tail' }
            : { text: part, kind: 'outline' },
    )
}

// Marks that sit on the character before them, and characters two cells wide.
const COMBINING =
  /[\u0300-\u036f\u0483-\u0489\u0591-\u05bd\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0730-\u074a\u07a6-\u07b0\u07eb-\u07f3\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\u1ab0-\u1aff\u1dc0-\u1dff\u200b-\u200f\u20d0-\u20ff\ufe00-\ufe0f\ufe20-\ufe2f]/u
const WIDE =
  /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u{1f300}-\u{1f64f}\u{1f900}-\u{1f9ff}\u{20000}-\u{3fffd}]/u

export function cellWidth(text: string): number {
  let width = 0
  for (const ch of text) {
    width += COMBINING.test(ch) ? 0 : WIDE.test(ch) ? 2 : 1
  }

  return width
}

export function widthOf(parts: readonly Piece[]): number {
  return parts.reduce((sum, part) => sum + cellWidth(part.text), 0)
}

// The widest row the pet draws, with its longest tail.
export function artWidth(pet: Pet): number {
  const tail = Math.max(...pet.tails.map(cellWidth))

  return Math.max(...pet.rows.map(row => widthOf(pieces(row, '•', ' ', ' '.repeat(tail)))))
}

// The one-line face, as plain text.
export function miniFace(pet: Pet, mood: NekoMood): string {
  return pieces(pet.mini, eyeOf(pet, mood, false), ' ', '')
    .map(part => part.text)
    .join('')
}

// The eyes' colour where neither the mood nor the sprite gives one, and the
// colour of what a sprite holds.
export const DARK = '#1c1c1c'

// What the eye glyph a mood draws becomes in pixels: '-' and 'ᴗ' are shut (the
// cell's bottom half), '^' smiles (its top half), the rest stay open.
export type EyeShape = 'open' | 'shut' | 'smile'

export function eyeShape(eye: string): EyeShape {
  return eye === '-' || eye === 'ᴗ' ? 'shut' : eye === '^' ? 'smile' : 'open'
}

// One run of a sprite's row: cells that share their colours.
export type Cell = { text: string; color?: string; backgroundColor?: string; bold?: boolean }

export function spriteWidth(sprite: Sprite): number {
  return Math.max(...sprite.pixels.map(row => row.length))
}

// The terminal row its eyes are on.
export function spriteFaceRow(sprite: Sprite): number {
  return Math.floor(Math.max(0, sprite.pixels.findIndex(row => row.includes('e'))) / 2)
}

// The colour of one pixel, or undefined where it is empty.
function pixel(sprite: Sprite, x: number, y: number, eye: string | undefined, shape: EyeShape, swing: number): string | undefined {
  const { colors } = sprite
  const body = colors.b
  const ch = sprite.pixels[y]?.[x] ?? '.'
  if (ch === '.') {
    return undefined
  }
  if (ch === 't' || ch === 'u') {
    return ch === (swing % 2 === 0 ? 't' : 'u') ? (colors.t ?? body) : undefined
  }
  if (ch === 'e') {
    const isTop = y % 2 === 0
    const isLit = shape === 'open' || (shape === 'shut' ? !isTop : isTop)

    return isLit ? (eye ?? DARK) : (colors.s ?? body)
  }

  return colors[ch] ?? body
}

// Two stacked pixels as one cell: the upper half block in the top's colour
// over the bottom's as background.
function cellOf(top: string | undefined, bottom: string | undefined): Cell {
  if (top === undefined) {
    return bottom === undefined ? { text: ' ' } : { text: '▄', color: bottom }
  }
  if (bottom === undefined) {
    return { text: '▀', color: top }
  }

  return top === bottom ? { text: '█', color: top } : { text: '▀', color: top, backgroundColor: bottom }
}

// The sprite's four terminal rows, each a list of runs. `eye` colours the
// eyes (DARK when undefined), `swing` picks the tail, and `held`, when given,
// shows in the hold cell.
export function spriteRows(sprite: Sprite, eye: string | undefined, shape: EyeShape, swing: number, held?: string): Cell[][] {
  const width = spriteWidth(sprite)
  const [holdX, holdRow] = sprite.hold

  return [0, 1, 2, 3].map(row => {
    const runs: Cell[] = []
    for (let x = 0; x < width; x++) {
      const top = pixel(sprite, x, row * 2, eye, shape, swing)
      const bottom = pixel(sprite, x, row * 2 + 1, eye, shape, swing)
      const cell =
        held !== undefined && x === holdX && row === holdRow
          ? { text: held, color: DARK, backgroundColor: top ?? bottom, bold: true }
          : cellOf(top, bottom)
      const last = runs[runs.length - 1]
      if (
        last !== undefined &&
        last.color === cell.color &&
        last.backgroundColor === cell.backgroundColor &&
        last.bold === cell.bold
      ) {
        last.text += cell.text
      } else {
        runs.push(cell)
      }
    }

    return runs
  })
}
