import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Droplets,
  GripVertical,
  ListMusic,
  Music2,
  Music4,
  Pause,
  Play,
  Plus,
  SlidersHorizontal,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import './App.css'
import { DropVisualizer } from './DropVisualizer'
import type {
  VisualMode,
  VisualPerformanceStats,
  VisualQualityMode,
} from './DropVisualizer'
import { useMetronome } from './useMetronome'
import { DEFAULT_TRACKS, METERS } from './types'
import type { Track } from './types'

type SubdivisionMode = 'off' | 'eighth' | 'sixteenth' | 'both'

type SyncSettings = {
  enabled: boolean
  delayMs: number
}

type VisualSettings = {
  mode: VisualMode
  quality: VisualQualityMode
  showStats: boolean
}

type AudioSettings = {
  muted: boolean
  muteFadeOutSeconds: number
}

type FileShareData = {
  files?: File[]
  text?: string
  title?: string
}

type FileShareNavigator = Navigator & {
  canShare?: (data: FileShareData) => boolean
  share?: (data: FileShareData) => Promise<void>
}

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: Array<{
      accept: Record<string, string[]>
      description: string
    }>
  }) => Promise<{
    createWritable: () => Promise<{
      close: () => Promise<void>
      write: (data: Blob) => Promise<void>
    }>
  }>
}

type GotaMediaPlugin = {
  update: (options: {
    bpm: number
    isPlaying: boolean
    meter: string
    muted: boolean
    title: string
  }) => Promise<void>
  stop: () => Promise<void>
}

const GotaMedia = registerPlugin<GotaMediaPlugin>('GotaMedia')

const TRACKS_STORAGE_KEY = 'gota.tracks'
const TRACKS_STORAGE_VERSION_KEY = 'gota.tracks.version'
const TRACKS_STORAGE_VERSION = 'setlist-volver-max-brightness-2026-04-29'

function App() {
  const [tracks, setTracks] = useState<Track[]>(() => readStoredTracks())
  const [syncSettings, setSyncSettings] = useState<SyncSettings>(() =>
    readStoredSyncSettings(),
  )
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() =>
    readStoredAudioSettings(),
  )
  const [visualSettings, setVisualSettings] = useState<VisualSettings>(() =>
    readStoredVisualSettings(),
  )
  const [liveModeEnabled, setLiveModeEnabled] = useState(() =>
    readStoredLiveMode(),
  )
  const [performanceStats, setPerformanceStats] =
    useState<VisualPerformanceStats | null>(null)
  const [currentTrackId, setCurrentTrackId] = useState(() => tracks[0]?.id ?? '')
  const [showSongs, setShowSongs] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [setlistMessage, setSetlistMessage] = useState('')
  const [bpmDraft, setBpmDraft] = useState(() => ({
    trackId: tracks[0]?.id ?? '',
    value: String(tracks[0]?.bpm ?? 120),
  }))
  const [draggingTrackId, setDraggingTrackId] = useState<string | null>(null)
  const liveMuteTimerRef = useRef<number | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const currentIndex = Math.max(
    0,
    tracks.findIndex((track) => track.id === currentTrackId),
  )
  const currentTrack = tracks[currentIndex] ?? tracks[0]
  const subdivisionMode = getSubdivisionMode(currentTrack)
  const effectiveVisualDelayMs = syncSettings.enabled ? syncSettings.delayMs : 0
  const bpmInputValue =
    bpmDraft.trackId === currentTrack.id
      ? bpmDraft.value
      : String(currentTrack.bpm)

  const clearPendingLiveMute = () => {
    if (liveMuteTimerRef.current === null) {
      return
    }

    window.clearTimeout(liveMuteTimerRef.current)
    liveMuteTimerRef.current = null
  }

  const metronome = useMetronome(
    currentTrack,
    effectiveVisualDelayMs,
    audioSettings.muted,
    audioSettings.muteFadeOutSeconds,
  )
  useScreenWakeLock(metronome.isPlaying)
  useNativeMediaSession({
    currentTrack,
    isPlaying: metronome.isPlaying,
    muted: audioSettings.muted,
  })

  useEffect(() => {
    window.localStorage.setItem(TRACKS_STORAGE_KEY, JSON.stringify(tracks))
    window.localStorage.setItem(TRACKS_STORAGE_VERSION_KEY, TRACKS_STORAGE_VERSION)
  }, [tracks])

  useEffect(() => {
    window.localStorage.setItem('gota.sync', JSON.stringify(syncSettings))
  }, [syncSettings])

  useEffect(() => {
    window.localStorage.setItem('gota.audio', JSON.stringify(audioSettings))
  }, [audioSettings])

  useEffect(() => {
    window.localStorage.setItem('gota.visual', JSON.stringify(visualSettings))
  }, [visualSettings])

  useEffect(() => {
    window.localStorage.setItem('gota.liveMode', JSON.stringify(liveModeEnabled))
  }, [liveModeEnabled])

  useEffect(() => {
    return () => {
      if (liveMuteTimerRef.current !== null) {
        window.clearTimeout(liveMuteTimerRef.current)
      }
    }
  }, [])

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

  const updateBpm = (value: number) => {
    const bpm = clampBpm(value)
    updateCurrentTrack({ bpm })
    setBpmDraft({
      trackId: currentTrack.id,
      value: String(bpm),
    })
  }

  const updateBpmDraft = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 3)
    setBpmDraft({
      trackId: currentTrack.id,
      value: digits,
    })

    if (digits === '') {
      return
    }

    const bpm = Number(digits)
    if (bpm >= 40 && bpm <= 240) {
      updateCurrentTrack({ bpm })
    }
  }

  const commitBpmDraft = () => {
    if (bpmInputValue === '') {
      setBpmDraft({
        trackId: currentTrack.id,
        value: String(currentTrack.bpm),
      })
      return
    }

    updateBpm(Number(bpmInputValue))
  }

  const updateSubdivisionMode = (nextMode: SubdivisionMode) => {
    updateCurrentTrack({
      subdivisions: getSubdivisionsForMode(nextMode),
    })
  }

  const unmuteAudio = () => {
    setAudioSettings((settings) =>
      settings.muted ? { ...settings, muted: false } : settings,
    )
  }

  const startLiveModeMuteFade = () => {
    clearPendingLiveMute()
    setAudioSettings((settings) =>
      settings.muted ? { ...settings, muted: false } : settings,
    )

    liveMuteTimerRef.current = window.setTimeout(() => {
      liveMuteTimerRef.current = null
      setAudioSettings((settings) =>
        settings.muted ? settings : { ...settings, muted: true },
      )
    }, 0)
  }

  const prepareTrackChangeAudio = () => {
    if (liveModeEnabled) {
      startLiveModeMuteFade()
      return
    }

    clearPendingLiveMute()
    unmuteAudio()
  }

  const selectTrack = (trackId: string) => {
    if (trackId !== currentTrackId) {
      prepareTrackChangeAudio()
    }

    setCurrentTrackId(trackId)
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
    selectTrack(newTrack.id)
  }

  const exportTracks = async () => {
    const exportData = {
      app: 'Gota',
      type: 'setlist',
      version: 1,
      exportedAt: new Date().toISOString(),
      tracks,
    }
    const json = JSON.stringify(exportData, null, 2)
    const fileName = `gota-lista-${formatDateForFile(new Date())}.json`
    const file = new File([json], fileName, {
      type: 'application/json',
    })

    try {
      if (Capacitor.isNativePlatform()) {
        const shareNavigator = navigator as FileShareNavigator
        const shareData = {
          files: [file],
          text: 'Lista de temas de Gota',
          title: 'Lista Gota',
        }

        if (shareNavigator.share && shareNavigator.canShare?.(shareData)) {
          try {
            await shareNavigator.share(shareData)
            setSetlistMessage('Lista exportada.')
            return
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
              setSetlistMessage('Exportacion cancelada.')
              return
            }
          }
        }
      }

      const savedWithPicker = await saveFileWithPicker(file, fileName)
      if (!savedWithPicker) {
        downloadFile(file, fileName)
      }
      setSetlistMessage('Lista exportada. Revisa Descargas si no se abrio ningun dialogo.')
    } catch {
      try {
        await navigator.clipboard.writeText(json)
        setSetlistMessage('No pude guardar el archivo; copie el JSON al portapapeles.')
      } catch {
        window.alert('No pude exportar la lista desde este navegador.')
      }
    }
  }

  const saveFileWithPicker = async (file: File, fileName: string) => {
    const showSaveFilePicker = (window as SaveFilePickerWindow).showSaveFilePicker
    if (!showSaveFilePicker) {
      return false
    }

    try {
      const fileHandle = await showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            accept: {
              'application/json': ['.json'],
            },
            description: 'Lista Gota',
          },
        ],
      })
      const writable = await fileHandle.createWritable()
      await writable.write(file)
      await writable.close()
      return true
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setSetlistMessage('Exportacion cancelada.')
        return true
      }

      throw error
    }
  }

  const openImportPicker = () => {
    setSetlistMessage('')
    importInputRef.current?.click()
  }

  const importTracks = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''

    if (!file) {
      return
    }

    try {
      const parsed = JSON.parse(await file.text()) as unknown
      const importedTracks = getImportedTracks(parsed)

      if (importedTracks.length === 0) {
        throw new Error('empty-setlist')
      }

      const normalizedTracks = normalizeTracks(importedTracks)
      clearPendingLiveMute()
      setTracks(normalizedTracks)
      setCurrentTrackId(normalizedTracks[0]?.id ?? '')
      unmuteAudio()
      setSetlistMessage('Lista importada.')
    } catch {
      window.alert('No pude importar esa lista. Probá con un JSON exportado desde Gota.')
    }
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
      selectTrack(nextTracks[nextIndex].id)
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
    selectTrack(tracks[nextIndex].id)
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

  const toggleMute = () => {
    clearPendingLiveMute()
    setAudioSettings((settings) => ({
      ...settings,
      muted: !settings.muted,
    }))
  }

  const toggleLiveMode = () => {
    clearPendingLiveMute()
    setLiveModeEnabled((value) => !value)
  }

  const updateMuteFadeOut = (fadeOutSeconds: number) => {
    setAudioSettings((settings) => ({
      ...settings,
      muteFadeOutSeconds: clampMuteFadeOut(fadeOutSeconds),
    }))
  }

  const updateVisualMode = (mode: VisualMode) => {
    setVisualSettings((settings) => ({
      ...settings,
      mode,
    }))
  }

  const updateVisualQuality = (quality: VisualQualityMode) => {
    setVisualSettings((settings) => ({
      ...settings,
      quality,
    }))
  }

  const togglePerformanceStats = () => {
    if (visualSettings.showStats) {
      setPerformanceStats(null)
    }

    setVisualSettings((settings) => ({
      ...settings,
      showStats: !settings.showStats,
    }))
  }

  useMediaSessionControls({
    currentTrack,
    goToTrack,
    isPlaying: metronome.isPlaying,
    toggleMute,
  })
  useNativeMediaKeyControls({
    goToTrack,
    toggleMute,
  })

  return (
    <div
      className={`app-shell quality-${visualSettings.quality} visual-${visualSettings.mode}`}
    >
      <DropVisualizer
        color={currentTrack.color}
        isPlaying={metronome.isPlaying}
        onPerformanceStats={setPerformanceStats}
        pulse={metronome.pulse}
        showPerformanceStats={visualSettings.showStats}
        track={currentTrack}
        visualDelayMs={effectiveVisualDelayMs}
        visualMode={visualSettings.mode}
        visualQuality={visualSettings.quality}
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
          <button
            type="button"
            className={`live-mode-toggle ${
              liveModeEnabled ? 'is-active' : ''
            }`}
            aria-pressed={liveModeEnabled}
            onClick={toggleLiveMode}
          >
            MODO VIVO
          </button>
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

      {visualSettings.showStats && performanceStats && (
        <div className="perf-overlay" aria-live="polite">
          <strong>{performanceStats.fps} FPS</strong>
          <span>{performanceStats.renderMs} ms</span>
          <small>
            DPR {performanceStats.pixelRatio} - {performanceStats.canvasWidth}x
            {performanceStats.canvasHeight} -{' '}
            {performanceStats.quality === 'performance' ? '60fps' : 'alta'}
          </small>
        </div>
      )}

      <footer className="control-dock">
        <button
          type="button"
          className={`transport-button mute-button ${
            audioSettings.muted ? 'is-muted' : ''
          }`}
          aria-label={audioSettings.muted ? 'Activar sonido' : 'Silenciar'}
          title={audioSettings.muted ? 'Activar sonido' : 'Silenciar'}
          onClick={toggleMute}
        >
          {audioSettings.muted ? <VolumeX size={25} /> : <Volume2 size={25} />}
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
                  onClick={() => selectTrack(track.id)}
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
            <div className="setlist-actions">
              <button
                type="button"
                className="panel-command"
                onClick={() => void exportTracks()}
              >
                <Download size={17} />
                Exportar lista
              </button>
              <button
                type="button"
                className="panel-command"
                onClick={openImportPicker}
              >
                <Upload size={17} />
                Importar lista
              </button>
            </div>
            <input
              ref={importInputRef}
              className="file-import"
              type="file"
              accept="application/json,.json"
              onChange={importTracks}
            />
            {setlistMessage && (
              <div className="setlist-message" role="status">
                {setlistMessage}
              </div>
            )}
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
                onChange={(event) => updateBpm(Number(event.currentTarget.value))}
              />
              <input
                className="number-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={bpmInputValue}
                onBlur={commitBpmDraft}
                onChange={(event) => updateBpmDraft(event.currentTarget.value)}
                onFocus={(event) => {
                  setBpmDraft({
                    trackId: currentTrack.id,
                    value: bpmInputValue,
                  })
                  event.currentTarget.select()
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur()
                  }
                }}
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

          <label className="field">
            <span>Visualizacion</span>
            <select
              value={visualSettings.mode}
              onChange={(event) =>
                updateVisualMode(event.currentTarget.value as VisualMode)
              }
            >
              <option value="drop">Gota</option>
              <option value="bounce">Pelota</option>
            </select>
          </label>

          <div className="field">
            <span>Subdivisión</span>
            <div className="subdivision-setting" role="group" aria-label="Subdivisión">
              {subdivisionModes.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`subdivision-option mode-${mode} ${
                    subdivisionMode === mode ? 'is-active' : ''
                  }`}
                  onClick={() => updateSubdivisionMode(mode)}
                >
                  {renderSubdivisionIcon(mode)}
                  <span>{getSubdivisionLabel(mode)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field global-field">
            <span>Fade al silenciar</span>
            <div className="field-row">
              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={audioSettings.muteFadeOutSeconds}
                onChange={(event) =>
                  updateMuteFadeOut(Number(event.currentTarget.value))
                }
              />
              <output className="number-output">
                {formatSeconds(audioSettings.muteFadeOutSeconds)}
              </output>
            </div>
          </div>

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

          <div className="field global-field">
            <span>Rendimiento visual</span>
            <select
              value={visualSettings.quality}
              onChange={(event) =>
                updateVisualQuality(event.currentTarget.value as VisualQualityMode)
              }
            >
              <option value="auto">Auto</option>
              <option value="performance">60 FPS</option>
              <option value="high">Alta calidad</option>
            </select>
            <div className="sync-row">
              <button
                type="button"
                className={`switch-button ${
                  visualSettings.showStats ? 'is-enabled' : ''
                }`}
                aria-pressed={visualSettings.showStats}
                onClick={togglePerformanceStats}
              >
                Monitor FPS
              </button>
              <output className="number-output">
                {performanceStats ? `${performanceStats.fps} FPS` : '--'}
              </output>
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}

function readStoredTracks() {
  const rawTracks = window.localStorage.getItem(TRACKS_STORAGE_KEY)
  if (!rawTracks) {
    window.localStorage.setItem(TRACKS_STORAGE_VERSION_KEY, TRACKS_STORAGE_VERSION)
    return DEFAULT_TRACKS
  }

  try {
    const storedVersion = window.localStorage.getItem(TRACKS_STORAGE_VERSION_KEY)
    const parsed = JSON.parse(rawTracks) as Partial<Track>[]
    const normalizedTracks = parsed.length > 0 ? normalizeTracks(parsed) : DEFAULT_TRACKS

    if (storedVersion !== TRACKS_STORAGE_VERSION) {
      const migratedTracks = normalizedTracks.map((track) => ({
        ...track,
        flashIntensity: 2,
      }))
      window.localStorage.setItem(TRACKS_STORAGE_KEY, JSON.stringify(migratedTracks))
      window.localStorage.setItem(TRACKS_STORAGE_VERSION_KEY, TRACKS_STORAGE_VERSION)
      return migratedTracks
    }

    return normalizedTracks
  } catch {
    window.localStorage.setItem(TRACKS_STORAGE_VERSION_KEY, TRACKS_STORAGE_VERSION)
    return DEFAULT_TRACKS
  }
}

type ScreenWakeLockSentinel = EventTarget & {
  released: boolean
  release: () => Promise<void>
  type: 'screen'
}

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<ScreenWakeLockSentinel>
  }
}

type MediaSessionControlsOptions = {
  currentTrack: Track
  goToTrack: (direction: -1 | 1) => void
  isPlaying: boolean
  toggleMute: () => void
}

function useMediaSessionControls({
  currentTrack,
  goToTrack,
  isPlaying,
  toggleMute,
}: MediaSessionControlsOptions) {
  useEffect(() => {
    if (!('mediaSession' in navigator)) {
      return
    }

    const mediaSession = navigator.mediaSession

    if (typeof MediaMetadata !== 'undefined') {
      mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: `Gota - ${currentTrack.bpm} BPM - ${currentTrack.meter.label}`,
        album: 'Metronomo visual',
        artwork: [
          {
            src: `${import.meta.env.BASE_URL}icon-192.png`,
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: `${import.meta.env.BASE_URL}icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      })
    }

    mediaSession.playbackState = isPlaying ? 'playing' : 'paused'

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', toggleMute],
      ['pause', toggleMute],
      ['previoustrack', () => goToTrack(-1)],
      ['nexttrack', () => goToTrack(1)],
      ['seekbackward', () => goToTrack(-1)],
      ['seekforward', () => goToTrack(1)],
    ]

    handlers.forEach(([action, handler]) => {
      setMediaSessionActionHandler(mediaSession, action, handler)
    })

    return () => {
      handlers.forEach(([action]) => {
        setMediaSessionActionHandler(mediaSession, action, null)
      })
    }
  }, [
    currentTrack,
    goToTrack,
    isPlaying,
    toggleMute,
  ])
}

function setMediaSessionActionHandler(
  mediaSession: MediaSession,
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null,
) {
  try {
    mediaSession.setActionHandler(action, handler)
  } catch {
    // Some browsers expose Media Session but do not support every action.
  }
}

type NativeMediaKeyControlsOptions = {
  goToTrack: (direction: -1 | 1) => void
  toggleMute: () => void
}

type NativeMediaSessionOptions = {
  currentTrack: Track
  isPlaying: boolean
  muted: boolean
}

function useNativeMediaSession({
  currentTrack,
  isPlaying,
  muted,
}: NativeMediaSessionOptions) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return
    }

    void GotaMedia.update({
      bpm: currentTrack.bpm,
      isPlaying,
      meter: currentTrack.meter.label,
      muted,
      title: currentTrack.title,
    }).catch(() => undefined)
  }, [
    currentTrack.bpm,
    currentTrack.meter.label,
    currentTrack.title,
    isPlaying,
    muted,
  ])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return
    }

    return () => {
      void GotaMedia.stop().catch(() => undefined)
    }
  }, [])
}

function useNativeMediaKeyControls({
  goToTrack,
  toggleMute,
}: NativeMediaKeyControlsOptions) {
  useEffect(() => {
    const handlePrevious = () => goToTrack(-1)
    const handleNext = () => goToTrack(1)

    window.addEventListener('gotaNativePreviousTrack', handlePrevious)
    window.addEventListener('gotaNativeNextTrack', handleNext)
    window.addEventListener('gotaNativeToggleMute', toggleMute)

    return () => {
      window.removeEventListener('gotaNativePreviousTrack', handlePrevious)
      window.removeEventListener('gotaNativeNextTrack', handleNext)
      window.removeEventListener('gotaNativeToggleMute', toggleMute)
    }
  }, [goToTrack, toggleMute])
}

function useScreenWakeLock(isActive: boolean) {
  const sentinelRef = useRef<ScreenWakeLockSentinel | null>(null)
  const isActiveRef = useRef(isActive)

  useEffect(() => {
    isActiveRef.current = isActive
  }, [isActive])

  useEffect(() => {
    let disposed = false

    const releaseWakeLock = async () => {
      const sentinel = sentinelRef.current
      sentinelRef.current = null

      if (!sentinel || sentinel.released) {
        return
      }

      try {
        await sentinel.release()
      } catch {
        // Some browsers reject release when the lock was already revoked.
      }
    }

    const requestWakeLock = async () => {
      if (
        !isActiveRef.current ||
        document.visibilityState !== 'visible' ||
        sentinelRef.current
      ) {
        return
      }

      const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock
      if (!wakeLock) {
        return
      }

      try {
        const sentinel = await wakeLock.request('screen')

        if (
          disposed ||
          !isActiveRef.current ||
          document.visibilityState !== 'visible'
        ) {
          await sentinel.release()
          return
        }

        sentinelRef.current = sentinel
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null
          }
        })
      } catch {
        sentinelRef.current = null
      }
    }

    const syncWakeLock = () => {
      if (isActiveRef.current && document.visibilityState === 'visible') {
        void requestWakeLock()
      } else {
        void releaseWakeLock()
      }
    }

    syncWakeLock()
    document.addEventListener('visibilitychange', syncWakeLock)

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', syncWakeLock)
      void releaseWakeLock()
    }
  }, [isActive])
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

function readStoredAudioSettings(): AudioSettings {
  const rawSettings = window.localStorage.getItem('gota.audio')
  if (!rawSettings) {
    return {
      muted: false,
      muteFadeOutSeconds: 5,
    }
  }

  try {
    const parsed = JSON.parse(rawSettings) as Partial<AudioSettings>
    return {
      muted: Boolean(parsed.muted),
      muteFadeOutSeconds: clampMuteFadeOut(parsed.muteFadeOutSeconds ?? 5),
    }
  } catch {
    return {
      muted: false,
      muteFadeOutSeconds: 5,
    }
  }
}

function readStoredVisualSettings(): VisualSettings {
  const rawSettings = window.localStorage.getItem('gota.visual')
  if (!rawSettings) {
    return {
      mode: 'drop',
      quality: 'auto',
      showStats: false,
    }
  }

  try {
    const parsed = JSON.parse(rawSettings) as Partial<VisualSettings>
    return {
      mode: isVisualMode(parsed.mode) ? parsed.mode : 'drop',
      quality: isVisualQualityMode(parsed.quality) ? parsed.quality : 'auto',
      showStats: Boolean(parsed.showStats),
    }
  } catch {
    return {
      mode: 'drop',
      quality: 'auto',
      showStats: false,
    }
  }
}

function readStoredLiveMode() {
  const rawSettings = window.localStorage.getItem('gota.liveMode')
  if (!rawSettings) {
    return false
  }

  try {
    return Boolean(JSON.parse(rawSettings))
  } catch {
    return false
  }
}

function getImportedTracks(data: unknown): Partial<Track>[] {
  const rawTracks =
    Array.isArray(data)
      ? data
      : isPlainRecord(data) && Array.isArray(data.tracks)
        ? data.tracks
        : []

  return rawTracks.filter(isTrackImportCandidate)
}

function downloadFile(file: File, fileName: string) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function isTrackImportCandidate(value: unknown): value is Partial<Track> {
  return isPlainRecord(value)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

const subdivisionModes: SubdivisionMode[] = ['off', 'eighth', 'sixteenth', 'both']

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

function clampMuteFadeOut(value: number) {
  if (Number.isNaN(value)) {
    return 5
  }

  return Math.min(10, Math.max(0, Math.round(value * 2) / 2))
}

function formatSeconds(value: number) {
  return `${value.toLocaleString('es-AR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
  })}s`
}

function formatDateForFile(date: Date) {
  return date.toISOString().slice(0, 10)
}

function isVisualQualityMode(value: unknown): value is VisualQualityMode {
  return value === 'auto' || value === 'performance' || value === 'high'
}

function isVisualMode(value: unknown): value is VisualMode {
  return value === 'drop' || value === 'bounce'
}

function clampBpm(value: number) {
  if (Number.isNaN(value)) {
    return 120
  }

  return Math.min(240, Math.max(40, Math.round(value)))
}

export default App
