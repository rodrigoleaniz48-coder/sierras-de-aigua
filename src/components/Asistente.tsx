import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

interface Mensaje {
  role: 'user' | 'assistant'
  content: string
  audio_base64?: string
  audio_mime?: string
  acciones?: Array<{ tool: string; args: unknown; resultado: unknown }>
}

interface Props {
  abierto: boolean
  onCerrar: () => void
}

const STORAGE_KEY = 'asistente-chat-v1'

function leerHistorial(userId: string): Mensaje[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY + ':' + userId)
    if (!raw) return []
    const arr = JSON.parse(raw) as Mensaje[]
    return Array.isArray(arr) ? arr.slice(-40) : []
  } catch { return [] }
}
function guardarHistorial(userId: string, m: Mensaje[]) {
  try { localStorage.setItem(STORAGE_KEY + ':' + userId, JSON.stringify(m.slice(-40))) } catch { /* nada */ }
}

export function Asistente({ abierto, onCerrar }: Props) {
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [entrada, setEntrada] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [grabando, setGrabando] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    if (userId) setMensajes(leerHistorial(userId))
  }, [userId])

  useEffect(() => {
    if (abierto) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [abierto, mensajes])

  async function enviarMensaje(msg: Mensaje) {
    setError(null)
    const nuevos: Mensaje[] = [...mensajes, msg]
    setMensajes(nuevos)
    guardarHistorial(userId, nuevos)
    setEnviando(true)
    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      const token = s?.access_token
      if (!token) throw new Error('Sesión no encontrada. Refrescá la página.')
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agente`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          mensajes: nuevos.map((m) => ({
            role: m.role, content: m.content,
            audio_base64: m.audio_base64, audio_mime: m.audio_mime,
          })),
        }),
      })
      const j = await resp.json()
      if (!resp.ok || j.error) throw new Error(j.error || `Error ${resp.status}`)
      const conRespuesta: Mensaje[] = [...nuevos, { role: 'assistant', content: j.texto || '(sin respuesta)', acciones: j.acciones }]
      setMensajes(conRespuesta)
      guardarHistorial(userId, conRespuesta)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }

  async function enviar() {
    const texto = entrada.trim()
    if (!texto || enviando) return
    setEntrada('')
    await enviarMensaje({ role: 'user', content: texto })
  }

  async function iniciarGrabacion() {
    if (grabando || enviando) return
    setError(null)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no soporta grabación de audio.'); return
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
        : ''
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        const b64 = await blobABase64(blob)
        setGrabando(false)
        await enviarMensaje({ role: 'user', content: '🎤 (audio)', audio_base64: b64, audio_mime: blob.type })
      }
      recorderRef.current = rec
      rec.start()
      setGrabando(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setGrabando(false)
    }
  }

  function detenerGrabacion() {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
  }

  function limpiar() {
    setMensajes([])
    guardarHistorial(userId, [])
    setError(null)
  }

  if (!abierto) return null

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onCerrar}>
      <div className="flex-1 bg-black/30" />
      <div
        className="w-full sm:w-[420px] bg-white border-l border-oliva-200 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-oliva-100 bg-oliva-50">
          <div className="h-8 w-8 rounded-full bg-oliva-800 text-oliva-50 flex items-center justify-center text-sm font-bold">📊</div>
          <div className="flex-1">
            <div className="text-sm font-bold text-oliva-900">Analista de datos</div>
            <div className="text-[10px] text-oliva-500">Sierras de Aiguá · marketing e insights</div>
          </div>
          <button className="text-xs text-oliva-500 hover:text-oliva-800 underline" onClick={limpiar}>Limpiar</button>
          <button className="text-oliva-500 hover:text-oliva-800 p-1" onClick={onCerrar}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M6 18L18 6" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-oliva-50/30">
          {mensajes.length === 0 && (
            <div className="text-xs text-oliva-600 text-center py-8 space-y-2">
              <div className="text-3xl">📊</div>
              <div>Preguntame para analizar los datos. Ejemplos:</div>
              <ul className="text-left inline-block space-y-1">
                <li>· "cómo vengo este mes vs el pasado"</li>
                <li>· "top 10 clientes del año"</li>
                <li>· "qué presentación se vende más"</li>
                <li>· "qué clientes están en riesgo"</li>
                <li>· "evolución de ventas últimos 6 meses"</li>
                <li>· "historial del cliente X"</li>
                <li>· "qué productos no rotan"</li>
              </ul>
            </div>
          )}
          {mensajes.map((m, i) => (
            <Burbuja key={i} m={m} />
          ))}
          {enviando && (
            <div className="flex gap-2 items-center text-xs text-oliva-500 pl-2">
              <div className="animate-pulse">•••</div>
              <span>pensando…</span>
            </div>
          )}
          {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
          <div ref={bottomRef} />
        </div>

        <div className="p-3 border-t border-oliva-100 bg-white">
          {grabando ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md border border-red-300 bg-red-50">
                <div className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
                <span className="text-sm text-red-800 font-medium">Grabando… hablá y tocá "Enviar"</span>
              </div>
              <button className="btn-primary shrink-0" onClick={detenerGrabacion}>Enviar</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <textarea
                className="input flex-1 resize-none"
                rows={2}
                placeholder="Preguntá o pedile algo…"
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() }
                }}
                disabled={enviando}
              />
              <div className="flex flex-col gap-1 shrink-0 self-end">
                <button
                  type="button"
                  className="h-10 w-10 rounded-md bg-oliva-100 hover:bg-oliva-200 text-oliva-800 flex items-center justify-center transition"
                  onClick={iniciarGrabacion}
                  disabled={enviando}
                  title="Grabar audio"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 18v4M8 22h8"/></svg>
                </button>
                <button className="btn-primary" onClick={enviar} disabled={enviando || !entrada.trim()}>
                  Enviar
                </button>
              </div>
            </div>
          )}
          <div className="text-[10px] text-oliva-500 mt-1">Enter para enviar · Shift+Enter nueva línea · 🎤 grabar</div>
        </div>
      </div>
    </div>
  )
}

function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onloadend = () => {
      const dataUrl = r.result as string // "data:audio/webm;base64,..."
      const idx = dataUrl.indexOf(',')
      resolve(idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl)
    }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

function Burbuja({ m }: { m: Mensaje }) {
  const esUsuario = m.role === 'user'
  return (
    <div className={`flex ${esUsuario ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
        esUsuario
          ? 'bg-oliva-800 text-oliva-50 rounded-br-sm'
          : 'bg-white border border-oliva-100 text-oliva-900 rounded-bl-sm'
      }`}>
        {m.content}
        {m.acciones && m.acciones.length > 0 && (
          <details className="mt-2 text-[10px] opacity-70 cursor-pointer">
            <summary>Acciones ejecutadas ({m.acciones.length})</summary>
            <ul className="mt-1 space-y-0.5 pl-3">
              {m.acciones.map((a, i) => (
                <li key={i}>· {a.tool}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  )
}
