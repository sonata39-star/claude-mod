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
  },
  dog: {
    call: 'โฮ่ง',
    label: 'หมา',
    flourish: 'โฮ่ง~',
    color: '#d7af87',
    rows: ['   .---.', '  U({L}ᴥ{R})U', '  ฅ( {H} )ฅ', '  (")_(") {T}'],
    mini: 'U({L}ᴥ{R})U',
    tails: ['⌒', '~'],
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
  },
  bird: {
    call: 'จิ๊บ',
    label: 'นก',
    flourish: 'จิ๊บๆ~',
    color: '#87d7ff',
    rows: ['    \\|/', '   ({L}v{R})', '  ʚ( {H} )ɞ', '    ᴧ ᴧ {T}'],
    mini: 'ʚ({L}v{R})ɞ',
    tails: ['♪', ' '],
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
  },
  fish: {
    call: 'ปลาน้อย',
    label: 'ปลา',
    flourish: 'บุ๋งๆ~',
    color: '#ffaf5f',
    rows: ['        o', '       ° {H}', '  {T}((({L}>', ' ~~~~~~~~~~'],
    mini: '><((({L}>',
    tails: ['><', '>-'],
  },
  whale: {
    call: 'วาฬ',
    label: 'ปลาวาฬ',
    flourish: 'ฟู่ว~',
    color: '#5f87ff',
    rows: ['     {T}', '  .-~~~~~-.', ' (  {L}  {H}  )=<', '  `-.___.-´'],
    mini: '( {L} )=<',
    tails: [',:,', '.:.'],
  },
  shark: {
    call: 'ฉลาม',
    label: 'ฉลาม',
    flourish: 'งับๆ~',
    color: '#87afaf',
    rows: ['      /|', '  ___/_|___', ' /{L}  {H}  ≡ \\{T}', ' \\vvvv_____/'],
    mini: '/({L}≡)>',
    tails: ['<', '/'],
  },
  elephant: {
    call: 'ช้างน้อย',
    label: 'ช้าง',
    flourish: 'แป๋น~',
    color: '#b2b2b2',
    rows: ['   _.-._', ' (( {L}ʃ{R} ))', '  ∩( {H} )∩', '  (_)─(_) {T}'],
    mini: '(({L}ʃ{R}))',
    tails: ['~', 'ʃ'],
  },
  horse: {
    call: 'ม้า',
    label: 'ม้า',
    flourish: 'ฮี้~',
    color: '#af875f',
    rows: ['   /\\ /\\', '  /({L}ᴗ{R})\\', '  ∩( {H} )∩', '  (_)─(_) {T}'],
    mini: '/({L}ᴗ{R})\\',
    tails: ['ʃ', '~'],
  },
  cow: {
    call: 'วัว',
    label: 'วัว',
    flourish: 'มอ~',
    rows: ['   ^____^', '  ({L}(oo){R})', '  ∩( {H} )∩', '  (_)─(_) {T}'],
    mini: '^({L}(oo){R})^',
    tails: ['~', 'ʃ'],
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
