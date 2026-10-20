const TZ = 'Asia/Kolkata'

export function istDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d) // YYYY-MM-DD
}

export function daysAgoIST(n: number): string {
  return istDate(new Date(Date.now() - n * 86400000))
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export function fmtDateTime(d: Date): string {
  return d.toLocaleString('en-IN', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

export function fmtDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  })
}

export function mapLink(lat?: number | null, lng?: number | null): string {
  return `https://www.google.com/maps?q=${lat},${lng}`
}

export function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not available on this device'))
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(new Error(e.message)), {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    })
  })
}

export function displayPhone(p?: string | null): string {
  if (!p) return ''
  return p.startsWith('91') && p.length === 12 ? p.slice(2) : p
}
