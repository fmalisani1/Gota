import { useEffect, useRef } from 'react'
import type { PulseEvent, PulseKind, Track } from './types'

type DropVisualizerProps = {
  color: string
  isPlaying: boolean
  pulse: PulseEvent | null
  track: Track
}

type Ripple = {
  createdAt: number
  kind: PulseKind
  accent: boolean
  seed: number
}

type SplashParticle = {
  createdAt: number
  life: number
  x: number
  y: number
  vx: number
  vy: number
  size: number
}

type ScreenFlash = {
  createdAt: number
  kind: PulseKind
  accent: boolean
}

export function DropVisualizer({
  color,
  isPlaying,
  pulse,
  track,
}: DropVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationRef = useRef<number | null>(null)
  const ripplesRef = useRef<Ripple[]>([])
  const particlesRef = useRef<SplashParticle[]>([])
  const flashesRef = useRef<ScreenFlash[]>([])
  const lastBeatAtRef = useRef(0)
  const trackRef = useRef(track)
  const colorRef = useRef(color)
  const isPlayingRef = useRef(isPlaying)

  useEffect(() => {
    trackRef.current = track
    colorRef.current = color
    if (lastBeatAtRef.current === 0) {
      lastBeatAtRef.current = performance.now()
    }
  }, [color, track])

  useEffect(() => {
    isPlayingRef.current = isPlaying
    if (isPlaying) {
      lastBeatAtRef.current = performance.now()
    }
  }, [isPlaying])

  useEffect(() => {
    if (!pulse) {
      return
    }

    const canvas = canvasRef.current
    const width = canvas?.clientWidth ?? window.innerWidth
    const height = canvas?.clientHeight ?? window.innerHeight
    const now = performance.now()

    ripplesRef.current.push({
      createdAt: now,
      kind: pulse.kind,
      accent: pulse.accent,
      seed: Math.random(),
    })

    flashesRef.current.push({
      createdAt: now,
      kind: pulse.kind,
      accent: pulse.accent,
    })

    if (pulse.kind === 'beat') {
      lastBeatAtRef.current = now
    }

    addSplashParticles(
      particlesRef.current,
      pulse.kind,
      pulse.accent,
      width / 2,
      height * 0.62,
      now,
    )
  }, [pulse])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      canvas.width = Math.floor(width * pixelRatio)
      canvas.height = Math.floor(height * pixelRatio)
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    }

    const draw = (now: number) => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight

      drawScene({
        context,
        width,
        height,
        now,
        color: colorRef.current,
        isPlaying: isPlayingRef.current,
        lastBeatAt: lastBeatAtRef.current,
        flashes: flashesRef.current,
        particles: particlesRef.current,
        ripples: ripplesRef.current,
        track: trackRef.current,
      })

      animationRef.current = window.requestAnimationFrame(draw)
    }

    resize()
    animationRef.current = window.requestAnimationFrame(draw)
    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  return <canvas className="drop-canvas" ref={canvasRef} aria-hidden="true" />
}

type DrawSceneOptions = {
  context: CanvasRenderingContext2D
  width: number
  height: number
  now: number
  color: string
  isPlaying: boolean
  lastBeatAt: number
  flashes: ScreenFlash[]
  particles: SplashParticle[]
  ripples: Ripple[]
  track: Track
}

function drawScene({
  context,
  width,
  height,
  now,
  color,
  isPlaying,
  lastBeatAt,
  flashes,
  particles,
  ripples,
  track,
}: DrawSceneOptions) {
  const waterY = height * 0.62
  const centerX = width / 2
  const beatMs = 60000 / track.bpm
  const beatAge = Math.max(0, now - lastBeatAt)
  const beatProgress = isPlaying ? (beatAge % beatMs) / beatMs : 0.18

  context.clearRect(0, 0, width, height)
  context.fillStyle = '#000000'
  context.fillRect(0, 0, width, height)

  drawAmbientField(context, width, height, waterY, color)
  drawWaterSurface(context, width, waterY, now, color)
  drawRipples(context, ripples, now, centerX, waterY, width, color)
  drawSplashParticles(context, particles, now, color)

  if (isPlaying) {
    drawFallingDrop(context, centerX, waterY, width, height, beatProgress, now, color)
  } else {
    drawIdleDrop(context, centerX, waterY, width, now, color)
  }

  drawImpactCrown(context, centerX, waterY, beatAge, color)
  drawScreenFlashes(context, flashes, now, width, height, centerX, waterY, color)
  pruneVisualMemory(ripples, particles, flashes, now)
}

function drawAmbientField(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  waterY: number,
  color: string,
) {
  const radius = Math.max(width, height) * 0.76
  const glow = context.createRadialGradient(width / 2, waterY, 24, width / 2, waterY, radius)
  glow.addColorStop(0, withAlpha(color, 0.18))
  glow.addColorStop(0.38, withAlpha(color, 0.055))
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)')

  context.fillStyle = glow
  context.fillRect(0, 0, width, height)
}

function drawWaterSurface(
  context: CanvasRenderingContext2D,
  width: number,
  waterY: number,
  now: number,
  color: string,
) {
  context.save()
  context.globalCompositeOperation = 'lighter'
  context.shadowColor = withAlpha(color, 0.8)
  context.shadowBlur = 18
  context.lineWidth = 1.4
  context.strokeStyle = withAlpha(color, 0.72)
  context.beginPath()

  for (let x = 0; x <= width; x += 8) {
    const drift =
      Math.sin(x * 0.012 + now * 0.0011) * 1.9 +
      Math.sin(x * 0.028 - now * 0.0008) * 0.8
    const y = waterY + drift
    if (x === 0) {
      context.moveTo(x, y)
    } else {
      context.lineTo(x, y)
    }
  }

  context.stroke()
  context.restore()
}

function drawRipples(
  context: CanvasRenderingContext2D,
  ripples: Ripple[],
  now: number,
  centerX: number,
  waterY: number,
  width: number,
  color: string,
) {
  context.save()
  context.globalCompositeOperation = 'lighter'

  ripples.forEach((ripple) => {
    const maxAge = ripple.kind === 'beat' ? 2100 : ripple.kind === 'eighth' ? 1100 : 720
    const age = now - ripple.createdAt
    if (age < 0 || age > maxAge) {
      return
    }

    const progress = age / maxAge
    const rippleCount = ripple.kind === 'beat' ? 3 : 1
    const intensity = ripple.kind === 'beat' ? (ripple.accent ? 1 : 0.74) : 0.34

    for (let index = 0; index < rippleCount; index += 1) {
      const offset = index * 34
      const radius = easeOutCubic(progress) * width * 0.48 + offset
      const alpha = (1 - progress) ** 1.8 * intensity * (1 - index * 0.22)
      const wobble = Math.sin(progress * 8 + ripple.seed * 10 + index) * 4

      context.lineWidth = Math.max(1, 3.2 - index * 0.7)
      context.shadowBlur = ripple.kind === 'beat' ? 22 : 12
      context.shadowColor = withAlpha(color, alpha)
      context.strokeStyle = withAlpha(color, alpha)
      context.beginPath()
      context.ellipse(centerX, waterY + wobble, radius, radius * 0.18, 0, 0, Math.PI * 2)
      context.stroke()
    }
  })

  context.restore()
}

function drawSplashParticles(
  context: CanvasRenderingContext2D,
  particles: SplashParticle[],
  now: number,
  color: string,
) {
  context.save()
  context.globalCompositeOperation = 'lighter'

  particles.forEach((particle) => {
    const age = now - particle.createdAt
    if (age < 0 || age > particle.life) {
      return
    }

    const progress = age / particle.life
    const seconds = age / 1000
    const x = particle.x + particle.vx * seconds
    const y = particle.y + particle.vy * seconds + 680 * seconds * seconds
    const alpha = (1 - progress) ** 1.6

    context.fillStyle = withAlpha(color, alpha * 0.78)
    context.shadowColor = withAlpha(color, alpha)
    context.shadowBlur = 12
    context.beginPath()
    context.arc(x, y, particle.size * (1 - progress * 0.25), 0, Math.PI * 2)
    context.fill()
  })

  context.restore()
}

function drawFallingDrop(
  context: CanvasRenderingContext2D,
  centerX: number,
  waterY: number,
  width: number,
  height: number,
  beatProgress: number,
  now: number,
  color: string,
) {
  const fallProgress = clamp((beatProgress - 0.08) / 0.92, 0, 1)
  if (fallProgress <= 0 || beatProgress > 0.992) {
    return
  }

  const eased = fallProgress ** 2.35
  const startY = Math.max(44, height * 0.08)
  const radius = clamp(width * 0.017, 10, 22)
  const y = lerp(startY, waterY - radius * 1.15, eased)
  const sway = Math.sin(now * 0.0012) * width * 0.006
  const alpha = clamp(fallProgress * 2.8, 0, 1)

  drawDropShape(context, centerX + sway, y, radius, alpha, color)
}

function drawIdleDrop(
  context: CanvasRenderingContext2D,
  centerX: number,
  waterY: number,
  width: number,
  now: number,
  color: string,
) {
  const radius = clamp(width * 0.015, 9, 20)
  const y = waterY - 130 + Math.sin(now * 0.001) * 8
  drawDropShape(context, centerX, y, radius, 0.62, color)
}

function drawDropShape(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
  color: string,
) {
  context.save()
  context.translate(x, y)
  context.globalCompositeOperation = 'lighter'
  context.shadowColor = withAlpha(color, alpha)
  context.shadowBlur = 26

  const gradient = context.createRadialGradient(-radius * 0.32, -radius * 0.2, 1, 0, 0, radius * 1.7)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.86)')
  gradient.addColorStop(0.35, withAlpha(color, alpha))
  gradient.addColorStop(1, withAlpha(color, 0.05))

  context.fillStyle = gradient
  context.beginPath()
  context.moveTo(0, -radius * 1.75)
  context.bezierCurveTo(radius * 0.9, -radius * 0.8, radius * 1.12, radius * 0.2, 0, radius * 1.42)
  context.bezierCurveTo(-radius * 1.12, radius * 0.2, -radius * 0.9, -radius * 0.8, 0, -radius * 1.75)
  context.closePath()
  context.fill()
  context.restore()
}

function drawImpactCrown(
  context: CanvasRenderingContext2D,
  centerX: number,
  waterY: number,
  beatAge: number,
  color: string,
) {
  if (beatAge > 300) {
    return
  }

  const progress = beatAge / 300
  const alpha = (1 - progress) ** 1.7
  const radius = 18 + progress * 54

  context.save()
  context.globalCompositeOperation = 'lighter'
  context.strokeStyle = withAlpha(color, alpha * 0.84)
  context.shadowColor = withAlpha(color, alpha)
  context.shadowBlur = 18
  context.lineWidth = 2
  context.beginPath()
  context.ellipse(centerX, waterY - 2, radius, radius * 0.16, 0, 0, Math.PI * 2)
  context.stroke()
  context.restore()
}

function drawScreenFlashes(
  context: CanvasRenderingContext2D,
  flashes: ScreenFlash[],
  now: number,
  width: number,
  height: number,
  centerX: number,
  waterY: number,
  color: string,
) {
  context.save()

  flashes.forEach((flash) => {
    const age = now - flash.createdAt
    const duration = flash.kind === 'beat' ? 760 : flash.kind === 'eighth' ? 360 : 190
    if (age < 0 || age > duration) {
      return
    }

    const progress = age / duration
    const fade = (1 - progress) ** 2.4
    const baseAlpha =
      flash.kind === 'beat'
        ? flash.accent
          ? 0.82
          : 0.64
        : flash.kind === 'eighth'
          ? 0.3
          : 0.12
    const alpha = baseAlpha * fade

    context.globalCompositeOperation = 'source-over'
    context.fillStyle = withAlpha(color, alpha)
    context.fillRect(0, 0, width, height)

    context.globalCompositeOperation = 'lighter'
    const radius = Math.max(width, height) * (0.18 + progress * 0.9)
    const burst = context.createRadialGradient(centerX, waterY, 0, centerX, waterY, radius)
    burst.addColorStop(0, withAlpha(color, alpha * 2.8))
    burst.addColorStop(0.24, withAlpha(color, alpha * 1.5))
    burst.addColorStop(0.58, withAlpha(color, alpha * 0.42))
    burst.addColorStop(1, withAlpha(color, 0))
    context.fillStyle = burst
    context.fillRect(0, 0, width, height)
  })

  context.restore()
}

function addSplashParticles(
  particles: SplashParticle[],
  kind: PulseKind,
  accent: boolean,
  x: number,
  y: number,
  now: number,
) {
  const count = kind === 'beat' ? (accent ? 20 : 14) : kind === 'eighth' ? 6 : 3
  const speedBase = kind === 'beat' ? (accent ? 300 : 230) : 130

  for (let index = 0; index < count; index += 1) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.35
    const speed = speedBase * (0.45 + Math.random() * 0.75)
    particles.push({
      createdAt: now,
      life: kind === 'beat' ? 780 : 420,
      x: x + (Math.random() - 0.5) * 18,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: kind === 'beat' ? 1.8 + Math.random() * 2.4 : 1.2 + Math.random() * 1.4,
    })
  }
}

function pruneVisualMemory(
  ripples: Ripple[],
  particles: SplashParticle[],
  flashes: ScreenFlash[],
  now: number,
) {
  const activeRipples = ripples.filter((ripple) => now - ripple.createdAt < 2200)
  const activeParticles = particles.filter((particle) => now - particle.createdAt < particle.life)
  const activeFlashes = flashes.filter((flash) => now - flash.createdAt < 540)

  ripples.splice(0, ripples.length, ...activeRipples)
  particles.splice(0, particles.length, ...activeParticles)
  flashes.splice(0, flashes.length, ...activeFlashes)
}

function withAlpha(hex: string, alpha: number) {
  const normalized = hex.replace('#', '')
  const full = normalized.length === 3
    ? normalized
        .split('')
        .map((item) => item + item)
        .join('')
    : normalized
  const value = Number.parseInt(full, 16)
  const red = (value >> 16) & 255
  const green = (value >> 8) & 255
  const blue = value & 255

  return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1)})`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount
}

function easeOutCubic(value: number) {
  return 1 - (1 - value) ** 3
}
