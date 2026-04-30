import { useEffect, useRef } from 'react'
import type { PulseEvent, PulseKind, Track } from './types'

type DropVisualizerProps = {
  color: string
  isPlaying: boolean
  onPerformanceStats?: (stats: VisualPerformanceStats) => void
  pulse: PulseEvent | null
  showPerformanceStats: boolean
  track: Track
  visualDelayMs: number
  visualMode: VisualMode
  visualQuality: VisualQualityMode
}

export type VisualMode = 'drop' | 'bounce'

export type VisualQualityMode = 'auto' | 'performance' | 'high'

export type VisualPerformanceStats = {
  fps: number
  renderMs: number
  pixelRatio: number
  canvasWidth: number
  canvasHeight: number
  quality: ResolvedVisualQuality
}

type ResolvedVisualQuality = 'performance' | 'high'

type VisualProfile = {
  name: ResolvedVisualQuality
  pixelRatioCap: number
  idleFrameIntervalMs: number
  ambientAlphaScale: number
  waterStep: number
  waterShadowBlur: number
  waterLineWidth: number
  rippleShadowScale: number
  rippleLifeScale: number
  rippleRadiusScale: number
  beatRippleCount: number
  particleScale: number
  particleShadowBlur: number
  maxParticles: number
  dropShadowBlur: number
  crownShadowBlur: number
  flashAlphaScale: number
  flashGradient: boolean
}

type StatsBucket = {
  frames: number
  lastSampleAt: number
  renderMsTotal: number
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
  onPerformanceStats,
  pulse,
  showPerformanceStats,
  track,
  visualDelayMs,
  visualMode,
  visualQuality,
}: DropVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationRef = useRef<number | null>(null)
  const ripplesRef = useRef<Ripple[]>([])
  const particlesRef = useRef<SplashParticle[]>([])
  const flashesRef = useRef<ScreenFlash[]>([])
  const statsBucketRef = useRef<StatsBucket>({
    frames: 0,
    lastSampleAt: 0,
    renderMsTotal: 0,
  })
  const lastDrawAtRef = useRef(0)
  const pixelRatioRef = useRef(1)
  const resizeRef = useRef<(() => void) | null>(null)
  const lastBeatAtRef = useRef(0)
  const trackRef = useRef(track)
  const colorRef = useRef(color)
  const isPlayingRef = useRef(isPlaying)
  const onPerformanceStatsRef = useRef(onPerformanceStats)
  const showPerformanceStatsRef = useRef(showPerformanceStats)
  const visualDelayMsRef = useRef(visualDelayMs)
  const visualModeRef = useRef(visualMode)
  const visualQualityRef = useRef(visualQuality)

  useEffect(() => {
    trackRef.current = track
    colorRef.current = color
    if (lastBeatAtRef.current === 0) {
      lastBeatAtRef.current = performance.now()
    }
  }, [color, track])

  useEffect(() => {
    visualDelayMsRef.current = visualDelayMs
  }, [visualDelayMs])

  useEffect(() => {
    visualModeRef.current = visualMode
  }, [visualMode])

  useEffect(() => {
    visualQualityRef.current = visualQuality
    resizeRef.current?.()
  }, [visualQuality])

  useEffect(() => {
    showPerformanceStatsRef.current = showPerformanceStats
    if (!showPerformanceStats) {
      statsBucketRef.current = {
        frames: 0,
        lastSampleAt: 0,
        renderMsTotal: 0,
      }
    }
  }, [showPerformanceStats])

  useEffect(() => {
    onPerformanceStatsRef.current = onPerformanceStats
  }, [onPerformanceStats])

  useEffect(() => {
    isPlayingRef.current = isPlaying
    if (isPlaying) {
      lastBeatAtRef.current = performance.now() + visualDelayMsRef.current
    }
  }, [isPlaying, visualDelayMs])

  useEffect(() => {
    if (!pulse) {
      return
    }

    const canvas = canvasRef.current
    const width = canvas?.clientWidth ?? window.innerWidth
    const height = canvas?.clientHeight ?? window.innerHeight
    const now = performance.now()
    const profile = getVisualProfile(visualQualityRef.current)

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

    if (visualModeRef.current === 'drop') {
      addSplashParticles(
        particlesRef.current,
        pulse.kind,
        pulse.accent,
        width / 2,
        height * 0.62,
        now,
        profile.particleScale,
        profile.maxParticles,
      )
    }
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
      const profile = getVisualProfile(visualQualityRef.current)
      const pixelRatio = Math.min(window.devicePixelRatio || 1, profile.pixelRatioCap)
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      canvas.width = Math.floor(width * pixelRatio)
      canvas.height = Math.floor(height * pixelRatio)
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      pixelRatioRef.current = pixelRatio
    }

    const draw = (now: number) => {
      const profile = getVisualProfile(visualQualityRef.current)
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const shouldDraw =
        isPlayingRef.current ||
        hasActiveVisualMemory(
          ripplesRef.current,
          particlesRef.current,
          flashesRef.current,
          now,
          profile,
        ) ||
        now - lastDrawAtRef.current >= profile.idleFrameIntervalMs

      if (shouldDraw) {
        const renderStartedAt = performance.now()
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
          profile,
          ripples: ripplesRef.current,
          track: trackRef.current,
          visualMode: visualModeRef.current,
        })
        const renderMs = performance.now() - renderStartedAt
        lastDrawAtRef.current = now

        updatePerformanceStats(
          statsBucketRef.current,
          now,
          renderMs,
          pixelRatioRef.current,
          width,
          height,
          profile.name,
          showPerformanceStatsRef.current,
          onPerformanceStatsRef.current,
        )
      }

      animationRef.current = window.requestAnimationFrame(draw)
    }

    resize()
    resizeRef.current = resize
    animationRef.current = window.requestAnimationFrame(draw)
    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      resizeRef.current = null
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
  profile: VisualProfile
  ripples: Ripple[]
  track: Track
  visualMode: VisualMode
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
  profile,
  ripples,
  track,
  visualMode,
}: DrawSceneOptions) {
  const surfaceY = height * 0.62
  const centerX = width / 2
  const beatMs = 60000 / track.bpm
  const beatAge = Math.max(0, now - lastBeatAt)
  const beatProgress = isPlaying ? (beatAge % beatMs) / beatMs : 0.18

  context.clearRect(0, 0, width, height)
  context.fillStyle = '#000000'
  context.fillRect(0, 0, width, height)

  drawAmbientField(context, width, height, surfaceY, color, profile)

  if (visualMode === 'bounce') {
    drawHardSurface(context, width, surfaceY, color, profile)
    drawSurfaceImpacts(context, ripples, now, centerX, surfaceY, width, color, profile)
  } else {
    drawWaterSurface(context, width, surfaceY, now, color, profile)
    drawRipples(context, ripples, now, centerX, surfaceY, width, color, profile)
    drawSplashParticles(context, particles, now, color, profile)
  }

  if (isPlaying) {
    if (visualMode === 'bounce') {
      drawBouncingBall(context, centerX, surfaceY, width, height, beatProgress, color, profile)
    } else {
      drawFallingDrop(
        context,
        centerX,
        surfaceY,
        width,
        height,
        beatProgress,
        now,
        color,
        profile,
      )
    }
  }

  if (visualMode === 'bounce') {
    drawBounceContactGlow(context, centerX, surfaceY, beatAge, width, color, profile)
  } else {
    drawImpactCrown(context, centerX, surfaceY, beatAge, color, profile)
  }
  drawScreenFlashes(
    context,
    flashes,
    now,
    width,
    height,
    centerX,
    surfaceY,
    color,
    track.flashIntensity,
    profile,
  )
  pruneVisualMemory(ripples, particles, flashes, now, profile)
}

function drawAmbientField(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  waterY: number,
  color: string,
  profile: VisualProfile,
) {
  const radius = Math.max(width, height) * 0.76
  const glow = context.createRadialGradient(width / 2, waterY, 24, width / 2, waterY, radius)
  glow.addColorStop(0, withAlpha(color, 0.18 * profile.ambientAlphaScale))
  glow.addColorStop(0.38, withAlpha(color, 0.055 * profile.ambientAlphaScale))
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
  profile: VisualProfile,
) {
  context.save()
  context.globalCompositeOperation = 'lighter'
  if (profile.waterShadowBlur > 0) {
    context.shadowColor = withAlpha(color, 0.8)
    context.shadowBlur = profile.waterShadowBlur
  }
  context.lineWidth = profile.waterLineWidth
  context.strokeStyle = withAlpha(color, 0.72)
  context.beginPath()

  for (let x = 0; x <= width; x += profile.waterStep) {
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

function drawHardSurface(
  context: CanvasRenderingContext2D,
  width: number,
  surfaceY: number,
  color: string,
  profile: VisualProfile,
) {
  context.save()
  context.globalCompositeOperation = 'lighter'

  const glow = context.createLinearGradient(0, surfaceY - 58, 0, surfaceY + 82)
  glow.addColorStop(0, withAlpha(color, 0))
  glow.addColorStop(0.46, withAlpha(color, 0.16 * profile.ambientAlphaScale))
  glow.addColorStop(0.5, withAlpha(color, 0.46 * profile.ambientAlphaScale))
  glow.addColorStop(0.58, withAlpha(color, 0.12 * profile.ambientAlphaScale))
  glow.addColorStop(1, withAlpha(color, 0))
  context.fillStyle = glow
  context.fillRect(0, surfaceY - 58, width, 140)

  if (profile.waterShadowBlur > 0) {
    context.shadowColor = withAlpha(color, 0.82)
    context.shadowBlur = profile.waterShadowBlur * 1.2
  }

  context.strokeStyle = withAlpha(color, 0.86)
  context.lineWidth = Math.max(2, profile.waterLineWidth * 2.1)
  context.beginPath()
  context.moveTo(0, surfaceY)
  context.lineTo(width, surfaceY)
  context.stroke()

  context.strokeStyle = withAlpha(color, 0.22)
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(0, surfaceY + 10)
  context.lineTo(width, surfaceY + 10)
  context.stroke()
  context.restore()
}

function drawSurfaceImpacts(
  context: CanvasRenderingContext2D,
  ripples: Ripple[],
  now: number,
  centerX: number,
  surfaceY: number,
  width: number,
  color: string,
  profile: VisualProfile,
) {
  context.save()
  context.globalCompositeOperation = 'lighter'

  ripples.forEach((ripple) => {
    const maxAge = getRippleMaxAge(ripple.kind, profile) * 0.64
    const age = now - ripple.createdAt
    if (age < 0 || age > maxAge) {
      return
    }

    const progress = age / maxAge
    const intensity = ripple.kind === 'beat' ? (ripple.accent ? 1 : 0.76) : 0.28
    const alpha = (1 - progress) ** 2 * intensity
    const spread = easeOutCubic(progress) * width * 0.46
    const height = 10 + progress * 34

    if (profile.rippleShadowScale > 0) {
      context.shadowBlur = 18 * profile.rippleShadowScale
      context.shadowColor = withAlpha(color, alpha)
    }

    context.strokeStyle = withAlpha(color, alpha)
    context.lineWidth = Math.max(1, 3.4 - progress * 2)
    context.beginPath()
    context.ellipse(centerX, surfaceY + 1, spread, height, 0, 0, Math.PI * 2)
    context.stroke()

    context.strokeStyle = withAlpha(color, alpha * 0.56)
    context.beginPath()
    context.moveTo(centerX - spread * 0.72, surfaceY)
    context.lineTo(centerX + spread * 0.72, surfaceY)
    context.stroke()
  })

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
  profile: VisualProfile,
) {
  context.save()
  context.globalCompositeOperation = 'lighter'

  ripples.forEach((ripple) => {
    const maxAge = getRippleMaxAge(ripple.kind, profile)
    const age = now - ripple.createdAt
    if (age < 0 || age > maxAge) {
      return
    }

    const progress = age / maxAge
    const rippleCount = ripple.kind === 'beat' ? profile.beatRippleCount : 1
    const intensity = ripple.kind === 'beat' ? (ripple.accent ? 1 : 0.74) : 0.34

    for (let index = 0; index < rippleCount; index += 1) {
      const offset = index * 34
      const radius = (easeOutCubic(progress) * width * 0.48 + offset) * profile.rippleRadiusScale
      const alpha = (1 - progress) ** 1.8 * intensity * (1 - index * 0.22)
      const wobble = Math.sin(progress * 8 + ripple.seed * 10 + index) * 4

      context.lineWidth = Math.max(1, 3.2 - index * 0.7)
      if (profile.rippleShadowScale > 0) {
        context.shadowBlur = (ripple.kind === 'beat' ? 22 : 12) * profile.rippleShadowScale
        context.shadowColor = withAlpha(color, alpha)
      }
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
  profile: VisualProfile,
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
    if (profile.particleShadowBlur > 0) {
      context.shadowColor = withAlpha(color, alpha)
      context.shadowBlur = profile.particleShadowBlur
    }
    context.beginPath()
    context.arc(x, y, particle.size * (1 - progress * 0.25), 0, Math.PI * 2)
    context.fill()
  })

  context.restore()
}

function drawBouncingBall(
  context: CanvasRenderingContext2D,
  centerX: number,
  surfaceY: number,
  width: number,
  height: number,
  beatProgress: number,
  color: string,
  profile: VisualProfile,
) {
  const radius = clamp(width * 0.066, 34, 78)
  const topMargin = Math.max(36, height * 0.07)
  const maxBounceHeight = Math.max(170, surfaceY - radius * 2 - topMargin)
  const bounceHeight = Math.min(maxBounceHeight, Math.max(190, height * 0.48))
  const arcHeight = Math.sin(beatProgress * Math.PI) * bounceHeight
  const y = surfaceY - radius - arcHeight
  const impactAmount = Math.max(
    1 - clamp(beatProgress / 0.1, 0, 1),
    1 - clamp((1 - beatProgress) / 0.1, 0, 1),
  )
  const fallStretch =
    smoothstep(0.52, 0.88, beatProgress) * (1 - smoothstep(0.88, 1, beatProgress))
  const scaleX = 1 + impactAmount * 0.28 - fallStretch * 0.1
  const scaleY = 1 - impactAmount * 0.24 + fallStretch * 0.18
  const contactShadowWidth = radius * (1.8 + Math.sin(beatProgress * Math.PI) * 1.05)
  const contactShadowAlpha = 0.18 + impactAmount * 0.36

  context.save()
  context.globalCompositeOperation = 'lighter'
  context.fillStyle = withAlpha(color, contactShadowAlpha)
  if (profile.crownShadowBlur > 0) {
    context.shadowColor = withAlpha(color, contactShadowAlpha)
    context.shadowBlur = profile.crownShadowBlur * 0.8
  }
  context.beginPath()
  context.ellipse(centerX, surfaceY + 4, contactShadowWidth, radius * 0.16, 0, 0, Math.PI * 2)
  context.fill()
  context.restore()

  context.save()
  context.translate(centerX, y)
  context.scale(scaleX, scaleY)
  context.globalCompositeOperation = 'lighter'
  if (profile.dropShadowBlur > 0) {
    context.shadowColor = withAlpha(color, 0.92)
    context.shadowBlur = profile.dropShadowBlur * 1.15
  }

  context.fillStyle = color
  context.beginPath()
  context.arc(0, 0, radius, 0, Math.PI * 2)
  context.fill()

  const shine = context.createRadialGradient(-radius * 0.32, -radius * 0.36, 1, 0, 0, radius)
  shine.addColorStop(0, 'rgba(255, 255, 255, 0.34)')
  shine.addColorStop(0.28, 'rgba(255, 255, 255, 0.08)')
  shine.addColorStop(1, 'rgba(255, 255, 255, 0)')
  context.fillStyle = shine
  context.beginPath()
  context.arc(0, 0, radius, 0, Math.PI * 2)
  context.fill()
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
  profile: VisualProfile,
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

  drawDropShape(context, centerX + sway, y, radius, alpha, color, profile)
}

function drawDropShape(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
  color: string,
  profile: VisualProfile,
) {
  context.save()
  context.translate(x, y)
  context.globalCompositeOperation = 'lighter'
  if (profile.dropShadowBlur > 0) {
    context.shadowColor = withAlpha(color, alpha)
    context.shadowBlur = profile.dropShadowBlur
  }

  const gradient = context.createRadialGradient(-radius * 0.32, -radius * 0.2, 1, 0, 0, radius * 1.7)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.86)')
  gradient.addColorStop(0.35, withAlpha(color, alpha))
  gradient.addColorStop(1, withAlpha(color, 0.05))

  context.fillStyle = gradient
  context.beginPath()
  context.moveTo(0, -radius * 1.75)
  context.bezierCurveTo(radius * 0.82, -radius * 0.98, radius * 1.18, -radius * 0.18, radius * 1.08, radius * 0.42)
  context.bezierCurveTo(radius * 0.96, radius * 1.18, radius * 0.44, radius * 1.56, 0, radius * 1.56)
  context.bezierCurveTo(-radius * 0.44, radius * 1.56, -radius * 0.96, radius * 1.18, -radius * 1.08, radius * 0.42)
  context.bezierCurveTo(-radius * 1.18, -radius * 0.18, -radius * 0.82, -radius * 0.98, 0, -radius * 1.75)
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
  profile: VisualProfile,
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
  if (profile.crownShadowBlur > 0) {
    context.shadowColor = withAlpha(color, alpha)
    context.shadowBlur = profile.crownShadowBlur
  }
  context.lineWidth = 2
  context.beginPath()
  context.ellipse(centerX, waterY - 2, radius, radius * 0.16, 0, 0, Math.PI * 2)
  context.stroke()
  context.restore()
}

function drawBounceContactGlow(
  context: CanvasRenderingContext2D,
  centerX: number,
  surfaceY: number,
  beatAge: number,
  width: number,
  color: string,
  profile: VisualProfile,
) {
  if (beatAge > 260) {
    return
  }

  const progress = beatAge / 260
  const alpha = (1 - progress) ** 1.8
  const radius = 42 + progress * width * 0.18

  context.save()
  context.globalCompositeOperation = 'lighter'
  if (profile.crownShadowBlur > 0) {
    context.shadowColor = withAlpha(color, alpha)
    context.shadowBlur = profile.crownShadowBlur * 1.2
  }

  context.fillStyle = withAlpha(color, alpha * 0.28)
  context.beginPath()
  context.ellipse(centerX, surfaceY + 2, radius, 18 + progress * 20, 0, 0, Math.PI * 2)
  context.fill()

  context.strokeStyle = withAlpha(color, alpha * 0.9)
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(centerX - radius * 0.82, surfaceY)
  context.lineTo(centerX + radius * 0.82, surfaceY)
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
  intensity: number,
  profile: VisualProfile,
) {
  context.save()

  const normalizedIntensity = clamp(intensity, 0, 2)

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
    const alpha = baseAlpha * fade * normalizedIntensity * profile.flashAlphaScale

    context.globalCompositeOperation = 'source-over'
    context.fillStyle = withAlpha(color, alpha)
    context.fillRect(0, 0, width, height)

    if (!profile.flashGradient) {
      return
    }

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
  particleScale: number,
  maxParticles: number,
) {
  if (particleScale <= 0) {
    return
  }

  const baseCount = kind === 'beat' ? (accent ? 20 : 14) : kind === 'eighth' ? 6 : 3
  const count = Math.max(1, Math.round(baseCount * particleScale))
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
      size:
        (kind === 'beat' ? 1.8 + Math.random() * 2.4 : 1.2 + Math.random() * 1.4) *
        clamp(0.72 + particleScale * 0.28, 0.72, 1),
    })
  }

  if (particles.length > maxParticles) {
    particles.splice(0, particles.length - maxParticles)
  }
}

function pruneVisualMemory(
  ripples: Ripple[],
  particles: SplashParticle[],
  flashes: ScreenFlash[],
  now: number,
  profile: VisualProfile,
) {
  const activeRipples = ripples.filter(
    (ripple) => now - ripple.createdAt < getRippleMaxAge(ripple.kind, profile) + 80,
  )
  const activeParticles = particles.filter((particle) => now - particle.createdAt < particle.life)
  const activeFlashes = flashes.filter((flash) => now - flash.createdAt < getFlashDuration(flash.kind))

  ripples.splice(0, ripples.length, ...activeRipples)
  particles.splice(0, particles.length, ...activeParticles)
  flashes.splice(0, flashes.length, ...activeFlashes)
}

function hasActiveVisualMemory(
  ripples: Ripple[],
  particles: SplashParticle[],
  flashes: ScreenFlash[],
  now: number,
  profile: VisualProfile,
) {
  return (
    ripples.some((ripple) => now - ripple.createdAt < getRippleMaxAge(ripple.kind, profile)) ||
    particles.some((particle) => now - particle.createdAt < particle.life) ||
    flashes.some((flash) => now - flash.createdAt < getFlashDuration(flash.kind))
  )
}

function updatePerformanceStats(
  bucket: StatsBucket,
  now: number,
  renderMs: number,
  pixelRatio: number,
  width: number,
  height: number,
  quality: ResolvedVisualQuality,
  enabled: boolean,
  onStats?: (stats: VisualPerformanceStats) => void,
) {
  if (!enabled || !onStats) {
    return
  }

  if (bucket.lastSampleAt === 0) {
    bucket.lastSampleAt = now
  }

  bucket.frames += 1
  bucket.renderMsTotal += renderMs

  const elapsedMs = now - bucket.lastSampleAt
  if (elapsedMs < 700) {
    return
  }

  onStats({
    fps: Math.round((bucket.frames * 1000) / elapsedMs),
    renderMs: Number((bucket.renderMsTotal / bucket.frames).toFixed(1)),
    pixelRatio: Number(pixelRatio.toFixed(2)),
    canvasWidth: Math.round(width * pixelRatio),
    canvasHeight: Math.round(height * pixelRatio),
    quality,
  })

  bucket.frames = 0
  bucket.lastSampleAt = now
  bucket.renderMsTotal = 0
}

function getVisualProfile(mode: VisualQualityMode): VisualProfile {
  const resolvedMode = mode === 'auto' ? resolveAutoQuality() : mode

  if (resolvedMode === 'performance') {
    return performanceProfile
  }

  return highProfile
}

function resolveAutoQuality(): ResolvedVisualQuality {
  const userAgent = navigator.userAgent
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const mobileUserAgent = /Android|iPhone|iPad|iPod/i.test(userAgent)

  return coarsePointer || mobileUserAgent ? 'performance' : 'high'
}

function getRippleMaxAge(kind: PulseKind, profile: VisualProfile) {
  const baseAge = kind === 'beat' ? 2100 : kind === 'eighth' ? 1100 : 720
  return baseAge * profile.rippleLifeScale
}

function getFlashDuration(kind: PulseKind) {
  return kind === 'beat' ? 760 : kind === 'eighth' ? 360 : 190
}

const highProfile: VisualProfile = {
  name: 'high',
  pixelRatioCap: 2,
  idleFrameIntervalMs: 260,
  ambientAlphaScale: 1,
  waterStep: 8,
  waterShadowBlur: 18,
  waterLineWidth: 1.4,
  rippleShadowScale: 1,
  rippleLifeScale: 1,
  rippleRadiusScale: 1,
  beatRippleCount: 3,
  particleScale: 1,
  particleShadowBlur: 12,
  maxParticles: 90,
  dropShadowBlur: 26,
  crownShadowBlur: 18,
  flashAlphaScale: 1,
  flashGradient: true,
}

const performanceProfile: VisualProfile = {
  name: 'performance',
  pixelRatioCap: 1,
  idleFrameIntervalMs: 420,
  ambientAlphaScale: 0.7,
  waterStep: 18,
  waterShadowBlur: 0,
  waterLineWidth: 1.1,
  rippleShadowScale: 0,
  rippleLifeScale: 0.72,
  rippleRadiusScale: 0.88,
  beatRippleCount: 2,
  particleScale: 0.45,
  particleShadowBlur: 0,
  maxParticles: 26,
  dropShadowBlur: 8,
  crownShadowBlur: 0,
  flashAlphaScale: 0.92,
  flashGradient: false,
}

const colorChannelCache = new Map<string, { red: number; green: number; blue: number }>()

function withAlpha(hex: string, alpha: number) {
  const { red, green, blue } = getColorChannels(hex)

  return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1)})`
}

function getColorChannels(hex: string) {
  const cached = colorChannelCache.get(hex)
  if (cached) {
    return cached
  }

  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((item) => item + item)
          .join('')
      : normalized
  const value = Number.parseInt(full, 16)
  const channels = {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  }

  colorChannelCache.set(hex, channels)
  return channels
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

function smoothstep(edge0: number, edge1: number, value: number) {
  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return amount * amount * (3 - 2 * amount)
}
