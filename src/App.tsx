import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Droplets,
  GripVertical,
  ListMusic,
  Maximize2,
  Music2,
  Music4,
  Pause,
  Play,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import './App.css'
import { DropVisualizer } from './DropVisualizer'
import { useMetronome } from './useMetronome'
import { DEFAULT_TRACKS, METERS } from './types'
import type { Track } from './types'

type SubdivisionMode = 'off' | 'eighth' | 'sixteenth' | 'both'

type SyncSettings = {
  enabled: boolean
  delayMs: number
}

function App() {
  const [tracks, setTracks] = useState<Track[]>(() => readStoredTracks())
  const [syncSettings, setSyncSettings] = useState<SyncSettings>(() =>
    readStoredSyncSettings(),
  )
  const [currentTrackId, setCurrentTrackId] = useState(() => tracks[0]?.id ?? '')
  const [showSongs, setShowSongs] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [draggingTrackId, setDraggingTrackId] = useState<string | null>(null)

  const currentIndex = Math.max(
    0,
    tracks.findIndex((track) => track.id === currentTrackId),
  )
  const currentTrack = tracks[currentIndex] ?? tracks[0]
  const subdivisionMode = getSubdivisionMode(currentTrack)
  const effectiveVisualDelayMs = syncSettings.enabled ? syncSettings.delayMs : 0
  const metronome = useMetronome(currentTrack, effectiveVisualDelayMs)

  useEffect(() => {
    window.localStorage.setItem('gota.tracks', JSON.stringify(tracks))
  }, [tracks])

  useEffect(() => {
    window.localStorage.setItem('gota.sync', JSON.stringify(syncSettings))
  }, [syncSettings])

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

  const cycleSubdivisionMode = () => {
    const nextMode = getNextSubdivisionMode(subdivisionMode)
    updateCurrentTrack({
      subdivisions: getSubdivisionsForMode(nextMode),
    })
  }

  const addTrack = () => {
    const newTrack: Track = {
      id: createTrackId(),
      title: `Tema ${tracks.length + 1}`,
      bpm: currentTrack.bpm,
      meter: currentTrack.meter,
      color: currentTrack.color,
      flashIntensity: currentTrack.flashIntensity,
      subdivisions: {
        ...currentTrack.subdivisions,
      },
    }

    setTracks((items) => [...items, newTrack])
    setCurrentTrackId(newTrack.id)
  }

  const deleteTrack = (trackId: string) => {
    if (tracks.length <= 1) {
      return
    }

    const deletedIndex = tracks.findIndex((track) => track.id === trackId)
    const nextTracks = tracks.filter((track) => track.id !== trackId)
    setTracks(nextTracks)

    if (currentTrackId === trackId) {
      const nextIndex = Math.min(Math.max(deletedIndex, 0), nextTracks.length - 1)
      setCurrentTrackId(nextTracks[nextIndex].id)
    }
  }

  const moveTrack = (trackId: string, direction: -1 | 1) => {
    const currentPosition = tracks.findIndex((track) => track.id === trackId)
    const nextPosition = currentPosition + direction

    if (currentPosition < 0 || nextPosition < 0 || nextPosition >= tracks.length) {
      return
    }

    setTracks((items) => {
      const reordered = [...items]
      const [movedTrack] = reordered.splice(currentPosition, 1)
      reordered.splice(nextPosition, 0, movedTrack)
      return reordered
    })
  }

  const handleDragStart = (
    event: DragEvent<HTMLDivElement>,
    trackId: string,
  ) => {
    setDraggingTrackId(trackId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', trackId)
  }

  const handleTrackDrop = (
    event: DragEvent<HTMLDivElement>,
    targetTrackId: string,
  ) => {
    event.preventDefault()
    const draggedId = event.dataTransfer.getData('text/plain') || draggingTrackId
    setDraggingTrackId(null)

    if (!draggedId || draggedId === targetTrackId) {
      return
    }

    setTracks((items) => {
      const draggedIndex = items.findIndex((track) => track.id === draggedId)
      const targetIndex = items.findIndex((track) => track.id === targetTrackId)

      if (draggedIndex < 0 || targetIndex < 0) {
        return items
      }

      const reordered = [...items]
      const [draggedTrack] = reordered.splice(draggedIndex, 1)
      const insertAt = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex
      reordered.splice(insertAt, 0, draggedTrack)
      return reordered
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

  const toggleSongs = () => {
    setShowSongs((value) => !value)
    setShowAdvanced(false)
  }

  const toggleAdvanced = () => {
    setShowAdvanced((value) => !value)
    setShowSongs(false)
  }

  const toggleSyncDelay = () => {
    setSyncSettings((settings) => ({
      ...settings,
      enabled: !settings.enabled,
    }))
  }

  const updateSyncDelay = (delayMs: number) => {
    setSyncSettings((settings) => ({
      ...settings,
      delayMs: clampVisualDelay(delayMs),
    }))
  }

  return (
    <div className="app-shell">
      <DropVisualizer
        color={currentTrack.color}
        isPlaying={metronome.isPlaying}
        pulse={metronome.pulse}
        track={currentTrack}
        visualDelayMs={effectiveVisualDelayMs}
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
            className={`icon-button ${showAdvanced ? 'is-active' : ''}`}
            aria-label="Opciones avanzadas"
            title="Opciones avanzadas"
            onClick={toggleAdvanced}
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
          className={`subdivision-button mode-${subdivisionMode} ${
            subdivisionMode !== 'off' ? 'is-active' : ''
          }`}
          aria-label={`Subdivisión: ${getSubdivisionLabel(subdivisionMode)}`}
          title={`Subdivisión: ${getSubdivisionLabel(subdivisionMode)}`}
          onClick={cycleSubdivisionMode}
        >
          {renderSubdivisionIcon(subdivisionMode)}
        </button>
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

        <button
          type="button"
          className={`transport-button playlist-button ${
            showSongs ? 'is-active' : ''
          }`}
          aria-label="Lista de temas"
          title="Lista de temas"
          onClick={toggleSongs}
        >
          <ListMusic size={25} />
        </button>
      </footer>

      {showSongs && (
        <aside className="side-panel song-panel" aria-label="Temas">
          <div className="panel-title">Temas</div>
          <div className="song-list">
            {tracks.map((track, index) => (
              <div
                key={track.id}
                className={`song-row ${
                  track.id === currentTrack.id ? 'is-selected' : ''
                } ${draggingTrackId === track.id ? 'is-dragging' : ''}`}
                draggable
                onDragStart={(event) => handleDragStart(event, track.id)}
                onDragEnd={() => setDraggingTrackId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleTrackDrop(event, track.id)}
              >
                <button
                  type="button"
                  className="song-main"
                  onClick={() => setCurrentTrackId(track.id)}
                >
                  <span>{track.title}</span>
                  <small>
                    {track.bpm} BPM - {track.meter.label}
                  </small>
                </button>
                <div className="song-tools">
                  <span className="song-grip" aria-hidden="true">
                    <GripVertical size={18} />
                  </span>
                  <button
                    type="button"
                    className="song-tool"
                    aria-label={`Subir ${track.title}`}
                    title="Subir"
                    disabled={index === 0}
                    onClick={() => moveTrack(track.id, -1)}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    className="song-tool"
                    aria-label={`Bajar ${track.title}`}
                    title="Bajar"
                    disabled={index === tracks.length - 1}
                    onClick={() => moveTrack(track.id, 1)}
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    type="button"
                    className="song-tool danger"
                    aria-label={`Borrar ${track.title}`}
                    title="Borrar"
                    disabled={tracks.length <= 1}
                    onClick={() => deleteTrack(track.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="add-track-button"
              onClick={addTrack}
            >
              <Plus size={18} />
              Agregar tema
            </button>
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
            <span>Brillo de luz</span>
            <div className="field-row">
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={currentTrack.flashIntensity}
                onChange={(event) =>
                  updateCurrentTrack({
                    flashIntensity: clampFlashIntensity(
                      Number(event.currentTarget.value),
                    ),
                  })
                }
              />
              <output className="number-output">
                {Math.round(currentTrack.flashIntensity * 100)}%
              </output>
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

          <div className="field sync-field">
            <span>Sync Bluetooth</span>
            <div className="sync-row">
              <button
                type="button"
                className={`switch-button ${
                  syncSettings.enabled ? 'is-enabled' : ''
                }`}
                aria-pressed={syncSettings.enabled}
                onClick={toggleSyncDelay}
              >
                {syncSettings.enabled ? 'Activo' : 'Apagado'}
              </button>
              <output className="number-output">{syncSettings.delayMs} ms</output>
            </div>
            <input
              type="range"
              min="0"
              max="350"
              step="5"
              value={syncSettings.delayMs}
              onChange={(event) =>
                updateSyncDelay(Number(event.currentTarget.value))
              }
            />
          </div>

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
    const parsed = JSON.parse(rawTracks) as Partial<Track>[]
    return parsed.length > 0 ? normalizeTracks(parsed) : DEFAULT_TRACKS
  } catch {
    return DEFAULT_TRACKS
  }
}

function readStoredSyncSettings(): SyncSettings {
  const rawSettings = window.localStorage.getItem('gota.sync')
  if (!rawSettings) {
    return {
      enabled: false,
      delayMs: 180,
    }
  }

  try {
    const parsed = JSON.parse(rawSettings) as Partial<SyncSettings>
    return {
      enabled: Boolean(parsed.enabled),
      delayMs: clampVisualDelay(parsed.delayMs ?? 180),
    }
  } catch {
    return {
      enabled: false,
      delayMs: 180,
    }
  }
}

function normalizeTracks(tracks: Partial<Track>[]) {
  return tracks.map((track, index) => {
    const fallback = DEFAULT_TRACKS[index] ?? DEFAULT_TRACKS[0]
    const meter =
      METERS.find((option) => option.label === track.meter?.label) ??
      fallback.meter

    return {
      id: track.id || createTrackId(),
      title: track.title || fallback.title,
      bpm: clampBpm(track.bpm ?? fallback.bpm),
      meter,
      color: track.color || fallback.color,
      flashIntensity: clampFlashIntensity(
        track.flashIntensity ?? fallback.flashIntensity,
      ),
      subdivisions: {
        eighth: track.subdivisions?.eighth ?? fallback.subdivisions.eighth,
        sixteenth:
          track.subdivisions?.sixteenth ?? fallback.subdivisions.sixteenth,
      },
    }
  })
}

function getSubdivisionMode(track: Track): SubdivisionMode {
  if (track.subdivisions.eighth && track.subdivisions.sixteenth) {
    return 'both'
  }

  if (track.subdivisions.eighth) {
    return 'eighth'
  }

  if (track.subdivisions.sixteenth) {
    return 'sixteenth'
  }

  return 'off'
}

function getNextSubdivisionMode(mode: SubdivisionMode): SubdivisionMode {
  switch (mode) {
    case 'off':
      return 'eighth'
    case 'eighth':
      return 'sixteenth'
    case 'sixteenth':
      return 'both'
    case 'both':
      return 'off'
  }
}

function getSubdivisionsForMode(mode: SubdivisionMode) {
  return {
    eighth: mode === 'eighth' || mode === 'both',
    sixteenth: mode === 'sixteenth' || mode === 'both',
  }
}

function getSubdivisionLabel(mode: SubdivisionMode) {
  switch (mode) {
    case 'off':
      return 'apagado'
    case 'eighth':
      return 'corchea'
    case 'sixteenth':
      return 'semicorchea'
    case 'both':
      return 'corchea y semicorchea'
  }
}

function renderSubdivisionIcon(mode: SubdivisionMode) {
  if (mode === 'both') {
    return (
      <span className="subdivision-stack" aria-hidden="true">
        <Music2 size={19} />
        <Music4 size={19} />
      </span>
    )
  }

  if (mode === 'sixteenth') {
    return <Music4 size={25} />
  }

  return <Music2 size={25} />
}

function createTrackId() {
  return window.crypto?.randomUUID?.() ?? `track-${Date.now()}`
}

function clampFlashIntensity(value: number) {
  if (Number.isNaN(value)) {
    return 1
  }

  return Math.min(2, Math.max(0, Number(value.toFixed(2))))
}

function clampVisualDelay(value: number) {
  if (Number.isNaN(value)) {
    return 180
  }

  return Math.min(350, Math.max(0, Math.round(value / 5) * 5))
}

function clampBpm(value: number) {
  if (Number.isNaN(value)) {
    return 120
  }

  return Math.min(240, Math.max(40, Math.round(value)))
}

export default App
