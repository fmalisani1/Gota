import { useCallback, useEffect, useRef, useState } from 'react'
import type { PulseEvent, PulseKind, Track } from './types'

type TransportState = {
  beatInMeasure: number
  stepInMeasure: number
}

const lookaheadMs = 25
const scheduleAheadSeconds = 0.12

export function useMetronome(
  track: Track,
  visualDelayMs = 0,
  isMuted = false,
  muteFadeOutSeconds = 5,
) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [pulse, setPulse] = useState<PulseEvent | null>(null)
  const [transport, setTransport] = useState<TransportState>({
    beatInMeasure: 1,
    stepInMeasure: 0,
  })

  const audioContextRef = useRef<AudioContext | null>(null)
  const intervalRef = useRef<number | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const nextStepTimeRef = useRef(0)
  const stepIndexRef = useRef(0)
  const pulseIdRef = useRef(0)
  const visualTimersRef = useRef<number[]>([])
  const isMutedRef = useRef(isMuted)
  const muteFadeOutSecondsRef = useRef(muteFadeOutSeconds)
  const trackRef = useRef(track)
  const visualDelayMsRef = useRef(visualDelayMs)

  useEffect(() => {
    trackRef.current = track
  }, [track])

  useEffect(() => {
    visualDelayMsRef.current = visualDelayMs
  }, [visualDelayMs])

  const applyMuteState = useCallback(() => {
    const context = audioContextRef.current
    const masterGain = masterGainRef.current
    if (!context || !masterGain) {
      return
    }

    const now = context.currentTime
    const gain = masterGain.gain
    gain.cancelScheduledValues(now)

    if (!isMutedRef.current) {
      gain.setValueAtTime(1, now)
      return
    }

    const fadeSeconds = muteFadeOutSecondsRef.current
    if (fadeSeconds <= 0) {
      gain.setValueAtTime(0, now)
      return
    }

    gain.setValueAtTime(Math.max(gain.value, 0.0001), now)
    gain.linearRampToValueAtTime(0, now + fadeSeconds)
  }, [])

  useEffect(() => {
    isMutedRef.current = isMuted
    muteFadeOutSecondsRef.current = muteFadeOutSeconds
    applyMuteState()
  }, [applyMuteState, isMuted, muteFadeOutSeconds])

  const clearVisualTimers = useCallback(() => {
    visualTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
    visualTimersRef.current = []
  }, [])

  const getAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ latencyHint: 'interactive' })
    }

    if (!masterGainRef.current) {
      masterGainRef.current = audioContextRef.current.createGain()
      masterGainRef.current.gain.setValueAtTime(
        isMutedRef.current ? 0 : 1,
        audioContextRef.current.currentTime,
      )
      masterGainRef.current.connect(audioContextRef.current.destination)
    }

    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume()
    }

    return audioContextRef.current
  }, [])

  const schedulePulse = useCallback(
    (
      context: AudioContext,
      audioTime: number,
      activeTrack: Track,
      kind: PulseKind,
      stepIndex: number,
    ) => {
      const accent = stepIndex === 0
      const beatInMeasure = Math.floor(stepIndex / 4) + 1
      const destination = masterGainRef.current ?? context.destination

      scheduleDropSound(context, audioTime, kind, accent, destination)

      const delayMs = Math.max(
        0,
        (audioTime - context.currentTime) * 1000 + visualDelayMsRef.current,
      )
      const timerId = window.setTimeout(() => {
        const nextPulse: PulseEvent = {
          id: pulseIdRef.current + 1,
          audioTime,
          kind,
          accent,
          stepIndex,
          beatInMeasure,
        }
        pulseIdRef.current = nextPulse.id
        setPulse(nextPulse)
        setTransport({
          beatInMeasure,
          stepInMeasure: stepIndex,
        })
      }, delayMs)

      visualTimersRef.current.push(timerId)

      if (visualTimersRef.current.length > 96) {
        visualTimersRef.current.splice(0, visualTimersRef.current.length - 96)
      }

      if (activeTrack.bpm <= 0) {
        return
      }
    },
    [],
  )

  const runScheduler = useCallback(() => {
    const context = audioContextRef.current
    if (!context) {
      return
    }

    const activeTrack = trackRef.current
    const stepDuration = 60 / activeTrack.bpm / 4
    const stepsPerMeasure = activeTrack.meter.beats * 4

    while (nextStepTimeRef.current < context.currentTime + scheduleAheadSeconds) {
      const stepIndex = stepIndexRef.current % stepsPerMeasure
      const kind = resolvePulseKind(stepIndex, activeTrack)

      if (kind) {
        schedulePulse(
          context,
          nextStepTimeRef.current,
          activeTrack,
          kind,
          stepIndex,
        )
      }

      nextStepTimeRef.current += stepDuration
      stepIndexRef.current = (stepIndexRef.current + 1) % stepsPerMeasure
    }
  }, [schedulePulse])

  const stop = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    clearVisualTimers()
    setIsPlaying(false)
    setPulse(null)
    setTransport({
      beatInMeasure: 1,
      stepInMeasure: 0,
    })
  }, [clearVisualTimers])

  const start = useCallback(async () => {
    const context = await getAudioContext()

    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current)
    }

    clearVisualTimers()
    nextStepTimeRef.current = context.currentTime + 0.08
    stepIndexRef.current = 0
    runScheduler()
    intervalRef.current = window.setInterval(runScheduler, lookaheadMs)
    setIsPlaying(true)
  }, [clearVisualTimers, getAudioContext, runScheduler])

  const toggle = useCallback(() => {
    if (isPlaying) {
      stop()
      return
    }

    void start()
  }, [isPlaying, start, stop])

  useEffect(() => {
    if (!isPlaying || !audioContextRef.current) {
      return
    }

    clearVisualTimers()
    nextStepTimeRef.current = audioContextRef.current.currentTime + 0.08
    stepIndexRef.current = 0
    runScheduler()
  }, [
    clearVisualTimers,
    isPlaying,
    runScheduler,
    track.bpm,
    track.id,
    track.meter.beats,
    track.meter.unit,
    track.subdivisions.eighth,
    track.subdivisions.sixteenth,
  ])

  useEffect(() => stop, [stop])

  return {
    isPlaying,
    pulse,
    start,
    stop,
    toggle,
    transport,
  }
}

function resolvePulseKind(stepIndex: number, track: Track): PulseKind | null {
  const stepInBeat = stepIndex % 4

  if (stepInBeat === 0) {
    return 'beat'
  }

  if (stepInBeat === 2 && track.subdivisions.eighth) {
    return 'eighth'
  }

  if (track.subdivisions.sixteenth) {
    return 'sixteenth'
  }

  return null
}

function scheduleDropSound(
  context: AudioContext,
  audioTime: number,
  kind: PulseKind,
  accent: boolean,
  destination: AudioNode,
) {
  const oscillator = context.createOscillator()
  const toneGain = context.createGain()
  const toneFilter = context.createBiquadFilter()
  const noise = context.createBufferSource()
  const noiseGain = context.createGain()
  const noiseFilter = context.createBiquadFilter()
  const output = context.createGain()

  const isBeat = kind === 'beat'
  const duration = isBeat ? 0.19 : kind === 'eighth' ? 0.1 : 0.065
  const baseGain = isBeat ? (accent ? 0.34 : 0.25) : kind === 'eighth' ? 0.1 : 0.06
  const startPitch = isBeat ? (accent ? 960 : 780) : kind === 'eighth' ? 620 : 500
  const endPitch = isBeat ? 170 : 260

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(startPitch, audioTime)
  oscillator.frequency.exponentialRampToValueAtTime(endPitch, audioTime + duration)

  toneGain.gain.setValueAtTime(0.0001, audioTime)
  toneGain.gain.linearRampToValueAtTime(baseGain, audioTime + 0.008)
  toneGain.gain.exponentialRampToValueAtTime(0.0001, audioTime + duration)

  toneFilter.type = 'lowpass'
  toneFilter.frequency.setValueAtTime(isBeat ? 1800 : 1200, audioTime)
  toneFilter.Q.setValueAtTime(isBeat ? 7 : 4, audioTime)

  output.gain.setValueAtTime(0.9, audioTime)
  output.gain.exponentialRampToValueAtTime(0.0001, audioTime + duration + 0.03)

  const noiseDuration = isBeat ? 0.11 : 0.045
  const sampleCount = Math.max(1, Math.floor(context.sampleRate * noiseDuration))
  const noiseBuffer = context.createBuffer(1, sampleCount, context.sampleRate)
  const noiseData = noiseBuffer.getChannelData(0)

  for (let index = 0; index < sampleCount; index += 1) {
    const progress = index / sampleCount
    const envelope = (1 - progress) ** 3
    noiseData[index] = (Math.random() * 2 - 1) * envelope
  }

  noise.buffer = noiseBuffer
  noiseFilter.type = 'bandpass'
  noiseFilter.frequency.setValueAtTime(isBeat ? 1400 : 1800, audioTime)
  noiseFilter.Q.setValueAtTime(0.8, audioTime)
  noiseGain.gain.setValueAtTime(isBeat ? baseGain * 0.35 : baseGain * 0.2, audioTime)
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, audioTime + noiseDuration)

  oscillator.connect(toneFilter)
  toneFilter.connect(toneGain)
  toneGain.connect(output)
  noise.connect(noiseFilter)
  noiseFilter.connect(noiseGain)
  noiseGain.connect(output)
  output.connect(destination)

  oscillator.start(audioTime)
  oscillator.stop(audioTime + duration + 0.04)
  noise.start(audioTime)
  noise.stop(audioTime + noiseDuration + 0.02)
}
