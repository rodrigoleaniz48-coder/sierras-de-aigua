import { useEffect, useMemo, useState } from 'react'
import { Dialog } from './Dialog'
import { normalizarTelWA } from '../lib/config'
import type { Cliente } from './ClienteDialog'

interface Plantilla { id: string; nombre: string; texto: string }

// Plantillas iniciales precargadas. Se guardan en localStorage la primera vez y desde ahi
// el usuario puede editar, agregar o borrar. Usar {nombre} para insertar el nombre del cliente.
const PLANTILLAS_DEFAULT: Plantilla[] = [
  {
    id: 'cosecha-2026',
    nombre: 'Nueva cosecha 2026',
    texto: 'Hola {nombre}! Cómo andás? Te cuento que ya está la nueva cosecha 2026 — salió muy buena. ¿Te queda aceite? Cualquier cosa avisame.\nUn abrazo, Rodrigo · Sierras de Aiguá 🫒',
  },
  {
    id: 'reactivacion',
    nombre: 'Reactivación suave',
    texto: 'Hola {nombre}! Cómo andás? Hace un tiempo que no te vemos por acá. ¿Te queda aceite o te mando? Cualquier cosa avisame.\nUn abrazo, *Rodrigo · Sierras de Aiguá* 🫒',
  },
  {
    id: 'novedad',
    nombre: 'Novedad genérica',
    texto: 'Hola {nombre}! Espero que estés bien. Te escribo desde *Sierras de Aiguá* para contarte una novedad. Avisame si te interesa y te paso más info.\nAbrazo, *Rodrigo* 🫒',
  },
]

const LS_KEY_PLANTILLAS = 'wa:plantillas'
const LS_KEY_ENVIADOS = 'wa:enviados'

function leerPlantillas(): Plantilla[] {
  try {
    const raw = localStorage.getItem(LS_KEY_PLANTILLAS)
    if (!raw) return PLANTILLAS_DEFAULT
    const arr = JSON.parse(raw) as Plantilla[]
    if (!Array.isArray(arr) || arr.length === 0) return PLANTILLAS_DEFAULT
    return arr
  } catch { return PLANTILLAS_DEFAULT }
}

function guardarPlantillas(ps: Plantilla[]) {
  try { localStorage.setItem(LS_KEY_PLANTILLAS, JSON.stringify(ps)) } catch { /* nada */ }
}

// "Enviados hoy": guardamos en localStorage los ids que ya se abrieron en WA hoy,
// para marcar visualmente y no reenviar el mismo mensaje al mismo cliente el mismo dia.
function claveEnviadosHoy(): string {
  const d = new Date()
  return `${LS_KEY_ENVIADOS}:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}
function leerEnviadosHoy(): Set<number> {
  try {
    const raw = localStorage.getItem(claveEnviadosHoy())
    return new Set(raw ? (JSON.parse(raw) as number[]) : [])
  } catch { return new Set() }
}
function marcarEnviado(id: number) {
  try {
    const s = leerEnviadosHoy(); s.add(id)
    localStorage.setItem(claveEnviadosHoy(), JSON.stringify([...s]))
  } catch { /* nada */ }
}

function renderMensaje(texto: string, nombre: string): string {
  const primerNombre = (nombre ?? '').split(' ')[0] || nombre
  return texto.split('{nombre}').join(primerNombre)
}

export function EnviarWhatsAppDialog({
  abierto, clientes, onCerrar,
}: {
  abierto: boolean
  clientes: Cliente[]
  onCerrar: () => void
}) {
  const [plantillas, setPlantillas] = useState<Plantilla[]>(PLANTILLAS_DEFAULT)
  const [plantillaId, setPlantillaId] = useState<string>('cosecha-2026')
  const [texto, setTexto] = useState<string>('')
  const [editandoPlantillas, setEditandoPlantillas] = useState(false)
  const [enviados, setEnviados] = useState<Set<number>>(new Set())
  const [filtro, setFiltro] = useState<'todos' | 'pendientes' | 'sin-tel'>('todos')

  useEffect(() => {
    if (!abierto) return
    const ps = leerPlantillas()
    setPlantillas(ps)
    const pid = ps[0]?.id ?? 'cosecha-2026'
    setPlantillaId(pid)
    setTexto(ps.find((p) => p.id === pid)?.texto ?? '')
    setEnviados(leerEnviadosHoy())
    setEditandoPlantillas(false)
    setFiltro('todos')
  }, [abierto])

  function cambiarPlantilla(id: string) {
    setPlantillaId(id)
    setTexto(plantillas.find((p) => p.id === id)?.texto ?? '')
  }

  function guardarCambiosPlantillaActual() {
    const ps = plantillas.map((p) => p.id === plantillaId ? { ...p, texto } : p)
    setPlantillas(ps)
    guardarPlantillas(ps)
  }

  function nuevaPlantilla() {
    const id = 'p-' + Date.now()
    const nueva: Plantilla = { id, nombre: 'Nueva plantilla', texto: 'Hola {nombre}! ' }
    const ps = [...plantillas, nueva]
    setPlantillas(ps); guardarPlantillas(ps)
    setPlantillaId(id); setTexto(nueva.texto)
    setEditandoPlantillas(true)
  }

  function borrarPlantillaActual() {
    if (plantillas.length === 1) return
    const ps = plantillas.filter((p) => p.id !== plantillaId)
    setPlantillas(ps); guardarPlantillas(ps)
    const nuevoId = ps[0]?.id ?? ''
    setPlantillaId(nuevoId); setTexto(ps.find((p) => p.id === nuevoId)?.texto ?? '')
  }

  function renombrarPlantillaActual(nombre: string) {
    const ps = plantillas.map((p) => p.id === plantillaId ? { ...p, nombre } : p)
    setPlantillas(ps); guardarPlantillas(ps)
  }

  const filas = useMemo(() => {
    return clientes.map((c) => {
      const tel = normalizarTelWA(c.whatsapp ?? c.telefono ?? null)
      const mensaje = renderMensaje(texto, c.nombre)
      const url = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}` : null
      return { c, tel, url, ya: enviados.has(c.id) }
    })
  }, [clientes, texto, enviados])

  const filasVisibles = useMemo(() => {
    if (filtro === 'sin-tel') return filas.filter((f) => !f.tel)
    if (filtro === 'pendientes') return filas.filter((f) => f.tel && !f.ya)
    return filas
  }, [filas, filtro])

  const totalConTel = filas.filter((f) => f.tel).length
  const totalSinTel = filas.length - totalConTel
  const totalEnviados = filas.filter((f) => f.ya).length
  const totalPendientes = totalConTel - totalEnviados

  function abrirWA(id: number, url: string) {
    // Abrir en misma pestaña para el usuario copie/reciba WhatsApp Web/mobile app
    window.open(url, '_blank', 'noopener')
    marcarEnviado(id)
    setEnviados((prev) => new Set(prev).add(id))
  }

  const preview = filas[0] ? renderMensaje(texto, filas[0].c.nombre) : renderMensaje(texto, 'Nombre')

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo={`📱 Enviar WhatsApp (${clientes.length})`} ancho="lg" scrollKey="wa-bulk">
      <div className="space-y-4">
        {/* Selector de plantilla */}
        <div className="rounded-lg bg-oliva-50/60 border border-oliva-100 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="label !mb-0">Plantilla</label>
            <select className="input w-auto flex-1 min-w-[180px]" value={plantillaId} onChange={(e) => cambiarPlantilla(e.target.value)}>
              {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <button type="button" className="text-xs text-oliva-700 underline hover:text-oliva-900" onClick={() => setEditandoPlantillas((v) => !v)}>
              {editandoPlantillas ? 'Ocultar edición' : 'Editar plantillas'}
            </button>
          </div>

          {editandoPlantillas && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center pt-1">
              <input
                className="input text-sm"
                placeholder="Nombre de la plantilla"
                value={plantillas.find((p) => p.id === plantillaId)?.nombre ?? ''}
                onChange={(e) => renombrarPlantillaActual(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <button type="button" className="btn-secondary text-xs" onClick={nuevaPlantilla}>+ Nueva plantilla</button>
                <button type="button" className="text-xs text-red-700 underline hover:text-red-900" onClick={borrarPlantillaActual} disabled={plantillas.length === 1}>Borrar esta</button>
              </div>
            </div>
          )}
        </div>

        {/* Editor del mensaje + preview */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label !mb-0">Mensaje <span className="text-oliva-500 font-normal text-xs">— usá <code>{'{nombre}'}</code> para insertar el nombre</span></label>
            <button type="button" className="text-xs text-oliva-700 underline hover:text-oliva-900" onClick={guardarCambiosPlantillaActual}>
              💾 Guardar cambios en la plantilla
            </button>
          </div>
          <textarea
            className="input font-medium"
            rows={5}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          {filas[0] && (
            <div className="mt-2 text-xs text-oliva-600">
              <span className="font-semibold">Preview para {filas[0].c.nombre.split(' ')[0]}:</span>
              <div className="mt-1 rounded-md bg-green-50 border border-green-200 p-2 text-oliva-900 whitespace-pre-wrap">{preview}</div>
            </div>
          )}
        </div>

        {/* Resumen y filtros */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-oliva-100 text-oliva-800 px-2 py-1"><b>{clientes.length}</b> seleccionados</span>
          {totalEnviados > 0 && <span className="rounded-full bg-green-100 text-green-800 px-2 py-1"><b>{totalEnviados}</b> abiertos hoy</span>}
          {totalPendientes > 0 && <span className="rounded-full bg-amber-100 text-amber-900 px-2 py-1"><b>{totalPendientes}</b> pendientes</span>}
          {totalSinTel > 0 && <span className="rounded-full bg-red-100 text-red-800 px-2 py-1"><b>{totalSinTel}</b> sin teléfono</span>}
          <div className="ml-auto flex gap-1">
            <button type="button" className={`text-xs px-2 py-1 rounded ${filtro === 'todos' ? 'bg-oliva-800 text-white' : 'bg-white border border-oliva-200 text-oliva-700'}`} onClick={() => setFiltro('todos')}>Todos</button>
            <button type="button" className={`text-xs px-2 py-1 rounded ${filtro === 'pendientes' ? 'bg-oliva-800 text-white' : 'bg-white border border-oliva-200 text-oliva-700'}`} onClick={() => setFiltro('pendientes')}>Pendientes</button>
            <button type="button" className={`text-xs px-2 py-1 rounded ${filtro === 'sin-tel' ? 'bg-oliva-800 text-white' : 'bg-white border border-oliva-200 text-oliva-700'}`} onClick={() => setFiltro('sin-tel')}>Sin tel.</button>
          </div>
        </div>

        {/* Lista de destinatarios */}
        <div className="rounded-lg border border-oliva-100 overflow-hidden">
          <div className="max-h-[45vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-oliva-50 z-10">
                <tr className="text-left text-xs uppercase tracking-wide text-oliva-600 border-b border-oliva-100">
                  <th className="py-2 px-3">Cliente</th>
                  <th className="py-2 px-3">Teléfono</th>
                  <th className="py-2 px-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filasVisibles.map(({ c, url, ya }) => (
                  <tr key={c.id} className={`border-b border-oliva-100/70 last:border-0 ${ya ? 'bg-green-50/40' : ''}`}>
                    <td className="py-2 px-3">
                      <div className="font-medium text-oliva-900">{c.nombre}</div>
                      {c.localidad && <div className="text-[11px] text-oliva-500">{c.localidad}</div>}
                    </td>
                    <td className="py-2 px-3 text-oliva-700 text-xs">{c.whatsapp ?? c.telefono ?? <span className="text-red-700">— sin teléfono —</span>}</td>
                    <td className="py-2 px-3 text-right">
                      {url ? (
                        <button
                          type="button"
                          onClick={() => abrirWA(c.id, url)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition ${
                            ya
                              ? 'bg-green-100 text-green-800 hover:bg-green-200'
                              : 'bg-[#25D366] text-white hover:brightness-95'
                          }`}
                        >
                          {ya ? '✓ Enviado' : '📱 Abrir WhatsApp'}
                        </button>
                      ) : (
                        <span className="text-[11px] text-red-700">no tiene tel.</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filasVisibles.length === 0 && (
                  <tr><td colSpan={3} className="py-6 text-center text-sm text-oliva-500">— vacío —</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-[11px] text-oliva-600">
          Al tocar <b>Abrir WhatsApp</b> se abre el chat con el mensaje ya escrito — apretás enviar. La marca <b>✓ Enviado</b> es local (solo en este dispositivo, para no repetir hoy) y se resetea a la medianoche.
        </div>

        <div className="flex justify-end">
          <button type="button" className="btn-secondary" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </Dialog>
  )
}
