import { useEffect, useRef, useState } from 'react'
import { fmtDateTime } from '../lib/util'

export interface Shot {
  blob: Blob
  lat: number
  lng: number
  accuracy: number
  capturedAt: Date
}

interface Props {
  title: string
  personName: string
  eventName: string
  defaultFacing?: 'user' | 'environment'
  onDone: (s: Shot) => void
  onCancel: () => void
}

interface Pos { lat: number; lng: number; acc: number }

export default function Camera({ title, personName, eventName, defaultFacing = 'user', onDone, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [facing, setFacing] = useState<'user' | 'environment'>(defaultFacing)
  const [pos, setPos] = useState<Pos | null>(null)
  const [camErr, setCamErr] = useState('')
  const [geoErr, setGeoErr] = useState('')
  const [shot, setShot] = useState<Shot | null>(null)
  const [preview, setPreview] = useState('')

  // Live GPS while the camera is open
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoErr('Location is not available on this device')
      return
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGeoErr('')
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy })
      },
      (e) => setGeoErr(e.message || 'Location permission is needed'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  // Camera stream (restarts when switching front / back)
  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop())
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setCamErr('')
      } catch (e: any) {
        setCamErr(e.message || 'Camera permission is needed')
      }
    }
    if (!shot) start()
    return () => {
      cancelled = true
    }
  }, [facing, shot])

  useEffect(() => {
    return () => streamRef.current?.getTracks().forEach((t) => t.stop())
  }, [])

  function capture() {
    const v = videoRef.current
    if (!v || !pos || !v.videoWidth) return
    const scale = Math.min(1, 1280 / v.videoWidth)
    const cw = Math.round(v.videoWidth * scale)
    const ch = Math.round(v.videoHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(v, 0, 0, cw, ch)

    const now = new Date()
    const lines = [
      `${personName} · ${eventName}`,
      `${fmtDateTime(now)} · ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)} (±${Math.round(pos.acc)} m)`,
    ]
    const fs = Math.max(14, Math.round(cw / 36))
    const pad = fs * 0.6
    const barH = lines.length * fs * 1.3 + pad * 2
    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    ctx.fillRect(0, ch - barH, cw, barH)
    ctx.fillStyle = '#ffffff'
    ctx.font = `600 ${fs}px system-ui, sans-serif`
    lines.forEach((l, i) => ctx.fillText(l, pad, ch - barH + pad + fs * (1.05 + i * 1.3)))

    canvas.toBlob(
      (blob) => {
        if (!blob) return
        setShot({ blob, lat: pos.lat, lng: pos.lng, accuracy: pos.acc, capturedAt: now })
        setPreview(URL.createObjectURL(blob))
      },
      'image/jpeg',
      0.82
    )
  }

  function retake() {
    if (preview) URL.revokeObjectURL(preview)
    setPreview('')
    setShot(null)
  }

  return (
    <div className="camera">
      <div className="camera-head">
        <strong>{title}</strong>
        <button className="link light" onClick={onCancel}>Cancel</button>
      </div>

      {shot ? (
        <>
          <img className="camera-view" src={preview} alt="Captured" />
          <div className="camera-bar">
            <button className="btn" onClick={retake}>Retake</button>
            <button className="btn primary" onClick={() => onDone(shot)}>Use this photo</button>
          </div>
        </>
      ) : (
        <>
          {camErr ? (
            <div className="camera-view center"><p className="error">{camErr}</p></div>
          ) : (
            <video ref={videoRef} className="camera-view" playsInline muted autoPlay />
          )}
          <div className="camera-status">
            {geoErr
              ? <span className="error">Location: {geoErr}</span>
              : pos
                ? <span>Location locked · ±{Math.round(pos.acc)} m{pos.acc > 100 ? ' (weak signal, move to open sky)' : ''}</span>
                : <span>Getting your location…</span>}
          </div>
          <div className="camera-bar">
            <button className="btn" onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')}>Flip</button>
            <button className="btn primary" onClick={capture} disabled={!pos || !!camErr}>Take photo</button>
          </div>
        </>
      )}
    </div>
  )
}
