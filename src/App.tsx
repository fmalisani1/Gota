import {
  ChevronLeft,
  ChevronRight,
  Droplets,
  ListMusic,
  Maximize2,
  Pause,
  Play,
  SlidersHorizontal,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { DropVisualizer } from './DropVisualizer'
import { useMetronome } from './useMetronome'
import { DEFAULT_TRACKS, METERS } from './types'
import type { Track } from './types'

function App() {
  const [tracks, setTracks] = useState<Track[]>(() => readStoredTracks())
  const [currentTrackId, setCurrentTrackId] = useState(() => tracks[0]?.id ?? '')
  const [showSongs, setShowSongs] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const currentIndex = Math.max(
    0,
    tracks.findIndex((track) => track.id === currentTrackId),
  )
  const currentTrack = tracks[currentIndex] ?? tracks[0]
  const metronome = useMetronome(currentTrack)

  useEffect(() => {
    window.localStorage.setItem('gota.tracks', JSON.stringify(tracks))
  }, [tracks])

  const beatPips = useMemo(() => {
    return Array.from({ length: currentTrack.meter.beats }, (_, index) => index + 1)
  }, [currentTrack.meter.beats])

  const updateCurrentTrack = (patch: Partial<Track>) => {
    setTracks((items) =>
      items.map((track) =>
        track.id === currentTrack.id ? { ...track, ...patch } : track,
      ),
    )
  }

  const updateMeter = (label: string) => {
    const meter = METERS.find((item) => item.label === label)
    if (meter) {
      updateCurrentTrack({ meter })
    }
  }

  const updateSubdivision = (
    key: keyof Track['subdivisions'],
    value: boolean,
  ) => {
    updateCurrentTrack({
      subdivisions: {
        ...currentTrack.subdivisions,
        [key]: value,
      },
    })
  }

  const goToTrack = (direction: -1 | 1) => {
    const nextIndex = (currentIndex + direction + tracks.length) % tracks.length
    setCurrentTrackId(tracks[nextIndex].id)
  }

  const requestFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen()
    } else {
      void document.exitFullscreen()
    }
  }

  return (
    <div className="app-shell">
      <DropVisualizer
        color={currentTrack.color}
        isPlaying={metronome.isPlaying}
        pulse={metronome.pulse}
        track={currentTrack}
      />
      <div className="vignette" />

      <header className="top-bar">
        <div className="track-heading">
          <span className="brand">
            <Droplets size={17} strokeWidth={1.8} />
            Gota
          </span>
          <h1>{currentTrack.title}</h1>
          <div className="track-stats">
            <span>{currentTrack.meter.label}</span>
            <span>Tiempo {metronome.transport.beatInMeasure}</span>
          </div>
        </div>

        <div className="top-actions" aria-label="Paneles">
          <button
            type="button"
            className={`icon-button ${showSongs ? 'is-active' : ''}`}
            aria-label="Lista de temas"
            title="Lista de temas"
            onClick={() => setShowSongs((value) => !value)}
          >
            <ListMusic size={21} />
          </button>
          <button
            type="button"
            className={`icon-button ${showAdvanced ? 'is-active' : ''}`}
            aria-label="Opciones avanzadas"
            title="Opciones avanzadas"
            onClick={() => setShowAdvanced((value) => !value)}
          >
            <SlidersHorizontal size={21} />
          </button>
        </div>
      </header>

      <section className="tempo-readout" aria-live="polite">
        <div className="bpm-number">{currentTrack.bpm}</div>
        <div className="bpm-label">BPM</div>
        <div className="measure-pips" aria-label="Tiempos del compas">
          {beatPips.map((beat) => (
            <span
              key={beat}
              className={
                beat === metronome.transport.beatInMeasure ? 'is-current' : ''
              }
            />
          ))}
        </div>
      </section>

      <footer className="control-dock">
        <button
          type="button"
          className="transport-button"
          aria-label="Tema anterior"
          title="Tema anterior"
          onClick={() => goToTrack(-1)}
        >
          <ChevronLeft size={28} />
        </button>
        <button
          type="button"
          className="transport-button play-button"
          aria-label={metronome.isPlaying ? 'Pausar' : 'Reproducir'}
          title={metronome.isPlaying ? 'Pausar' : 'Reproducir'}
          onClick={metronome.toggle}
        >
          {metronome.isPlaying ? <Pause size={30} /> : <Play size={30} />}
        </button>
        <button
          type="button"
          className="transport-button"
          aria-label="Tema siguiente"
          title="Tema siguiente"
          onClick={() => goToTrack(1)}
        >
          <ChevronRight size={28} />
        </button>

        <div className="subdivision-controls">
          <label
            className={`subdivision-toggle ${
              currentTrack.subdivisions.eighth ? 'is-active' : ''
            }`}
          >
            <input
              type="checkbox"
              checked={currentTrack.subdivisions.eighth}
              onChange={(event) =>
                updateSubdivision('eighth', event.currentTarget.checked)
              }
            />
            Corchea
          </label>
          <label
            className={`subdivision-toggle ${
              currentTrack.subdivisions.sixteenth ? 'is-active' : ''
            }`}
          >
            <input
              type="checkbox"
              checked={currentTrack.subdivisions.sixteenth}
              onChange={(event) =>
                updateSubdivision('sixteenth', event.currentTarget.checked)
              }
            />
            Semicorchea
          </label>
        </div>
      </footer>

      {showSongs && (
        <aside className="side-panel song-panel" aria-label="Temas">
          <div className="panel-title">Temas</div>
          <div className="song-list">
            {tracks.map((track) => (
              <button
                type="button"
                key={track.id}
                className={`song-row ${
                  track.id === currentTrack.id ? 'is-selected' : ''
                }`}
                onClick={() => {
                  setCurrentTrackId(track.id)
                  setShowSongs(false)
                }}
              >
                <span>{track.title}</span>
                <small>
                  {track.bpm} BPM · {track.meter.label}
                </small>
              </button>
            ))}
          </div>
        </aside>
      )}

      {showAdvanced && (
        <aside className="side-panel advanced-panel" aria-label="Opciones">
          <div className="panel-title">Opciones</div>

          <label className="field">
            <span>Tema actual</span>
            <input
              type="text"
              value={currentTrack.title}
              onChange={(event) =>
                updateCurrentTrack({ title: event.currentTarget.value })
              }
            />
          </label>

          <label className="field">
            <span>BPM</span>
            <div className="field-row">
              <input
                type="range"
                min="40"
                max="240"
                value={currentTrack.bpm}
                onChange={(event) =>
                  updateCurrentTrack({
                    bpm: Number(event.currentTarget.value),
                  })
                }
              />
              <input
                className="number-input"
                type="number"
                min="40"
                max="240"
                value={currentTrack.bpm}
                onChange={(event) =>
                  updateCurrentTrack({
                    bpm: clampBpm(Number(event.currentTarget.value)),
                  })
                }
              />
            </div>
          </label>

          <label className="field">
            <span>Compas</span>
            <select
              value={currentTrack.meter.label}
              onChange={(event) => updateMeter(event.currentTarget.value)}
            >
              {METERS.map((meter) => (
                <option key={meter.label} value={meter.label}>
                  {meter.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Color liquido</span>
            <input
              type="color"
              value={currentTrack.color}
              onChange={(event) =>
                updateCurrentTrack({ color: event.currentTarget.value })
              }
            />
          </label>

          <button
            type="button"
            className="panel-command"
            onClick={requestFullscreen}
          >
            <Maximize2 size={18} />
            Pantalla completa
          </button>
        </aside>
      )}
    </div>
  )
}

function readStoredTracks() {
  const rawTracks = window.localStorage.getItem('gota.tracks')
  if (!rawTracks) {
    return DEFAULT_TRACKS
  }

  try {
    const parsed = JSON.parse(rawTracks) as Track[]
    return parsed.length > 0 ? parsed : DEFAULT_TRACKS
  } catch {
    return DEFAULT_TRACKS
  }
}

function clampBpm(value: number) {
  if (Number.isNaN(value)) {
    return 120
  }

  return Math.min(240, Math.max(40, Math.round(value)))
}

export default App
