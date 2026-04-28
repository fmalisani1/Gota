export type PulseKind = 'beat' | 'eighth' | 'sixteenth'

export type SubdivisionState = {
  eighth: boolean
  sixteenth: boolean
}

export type MeterOption = {
  label: string
  beats: number
  unit: number
}

export type Track = {
  id: string
  title: string
  bpm: number
  meter: MeterOption
  color: string
  subdivisions: SubdivisionState
}

export type PulseEvent = {
  id: number
  audioTime: number
  kind: PulseKind
  accent: boolean
  stepIndex: number
  beatInMeasure: number
}

export const METERS: MeterOption[] = [
  { label: '4/4', beats: 4, unit: 4 },
  { label: '3/4', beats: 3, unit: 4 },
  { label: '5/4', beats: 5, unit: 4 },
  { label: '6/8', beats: 6, unit: 8 },
  { label: '7/8', beats: 7, unit: 8 },
]

export const DEFAULT_TRACKS: Track[] = [
  {
    id: 'apertura',
    title: 'Apertura',
    bpm: 92,
    meter: METERS[0],
    color: '#d8ff32',
    subdivisions: {
      eighth: true,
      sixteenth: false,
    },
  },
  {
    id: 'ensayo-lento',
    title: 'Ensayo lento',
    bpm: 74,
    meter: METERS[1],
    color: '#a8ff4a',
    subdivisions: {
      eighth: false,
      sixteenth: false,
    },
  },
  {
    id: 'cierre',
    title: 'Cierre',
    bpm: 128,
    meter: METERS[0],
    color: '#d8ff32',
    subdivisions: {
      eighth: true,
      sixteenth: true,
    },
  },
]
