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
  flashIntensity: number
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
  { label: '1/1', beats: 1, unit: 1 },
  { label: '2/2', beats: 2, unit: 2 },
  { label: '3/4', beats: 3, unit: 4 },
  { label: '4/4', beats: 4, unit: 4 },
  { label: '5/4', beats: 5, unit: 4 },
  { label: '6/8', beats: 6, unit: 8 },
  { label: '7/8', beats: 7, unit: 8 },
]

export const DEFAULT_TRACKS: Track[] = [
  {
    id: 'volver',
    title: 'VOLVER',
    bpm: 75,
    meter: METERS[0],
    color: '#d8ff32',
    flashIntensity: 1,
    subdivisions: {
      eighth: false,
      sixteenth: false,
    },
  },
  {
    id: 'el-pibe',
    title: 'EL PIBE',
    bpm: 130,
    meter: METERS[2],
    color: '#d8ff32',
    flashIntensity: 1,
    subdivisions: {
      eighth: true,
      sixteenth: false,
    },
  },
  {
    id: 'la-frontera',
    title: 'LA FRONTERA',
    bpm: 66,
    meter: METERS[0],
    color: '#d8ff32',
    flashIntensity: 1,
    subdivisions: {
      eighth: false,
      sixteenth: false,
    },
  },
  {
    id: 'respirar',
    title: 'RESPIRAR',
    bpm: 74,
    meter: METERS[0],
    color: '#d8ff32',
    flashIntensity: 1,
    subdivisions: {
      eighth: false,
      sixteenth: false,
    },
  },
  {
    id: 'juanito-y-el-lobo',
    title: 'JUANITO Y EL LOBO',
    bpm: 63,
    meter: METERS[0],
    color: '#d8ff32',
    flashIntensity: 1,
    subdivisions: {
      eighth: false,
      sixteenth: false,
    },
  },
  {
    id: 'los-peces-sin-color',
    title: 'LOS PECES SIN COLOR',
    bpm: 75,
    meter: METERS[0],
    color: '#d8ff32',
    flashIntensity: 1,
    subdivisions: {
      eighth: false,
      sixteenth: false,
    },
  },
  {
    id: 'fuego',
    title: 'FUEGO',
    bpm: 95,
    meter: METERS[1],
    color: '#d8ff32',
    flashIntensity: 1,
    subdivisions: {
      eighth: true,
      sixteenth: true,
    },
  },
  {
    id: 'orador',
    title: 'ORADOR',
    bpm: 72,
    meter: METERS[0],
    color: '#d8ff32',
    flashIntensity: 1,
    subdivisions: {
      eighth: false,
      sixteenth: false,
    },
  },
]
