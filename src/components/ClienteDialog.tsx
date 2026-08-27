import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Dialog } from './Dialog'
import { money } from '../lib/format'
import { borrarKey, guardarObj, leerObj } from '../lib/persistencia'

const BORRADOR_CLIENTE = 'borrador:nuevo-cliente'

export interface Cliente {
  id: number
  nombre: string
  tipo: 'minorista' | 'mayorista' | 'feria' | 'envio' | 'otro' | 'distribuidor'
  telefono: string | null
  email: string | null
  whatsapp: string | null
  direccion: string | null
  localidad: string | null
  rut: string | null
  condiciones_pago: string | null
  socio_asignado: string | null
  notas: string | null
  lista_precios_id: number | null
  creado_en?: string
}

export interface Socio { id: string; nombre: string }

export const TIPOS_CLIENTE: Cliente['tipo'][] = ['minorista', 'mayorista', 'distribuidor', 'feria', 'envio', 'otro']

export interface EstadisticasCliente {
  compras: number
  total: number
  ticketPromedio: number
  primeraCompra: string | null
  ultimaCompra: string | null
  diasDesdeUltima: number | null
  frecuenciaDias: number | null // promedio de días entre compras (null si solo 1)
}

interface Props {
  abierto: boolean
  socios: Socio[]
  editar?: Cliente | null
  soloLectura?: boolean
  /** Si es "rapido", muestra solo los campos esenciales — pensado para alta express desde Ventas. */
  modo?: 'completo' | 'rapido'
  /** Estadísticas de compras (solo se muestra al editar). */
  stats?: EstadisticasCliente | null
  /** Callback opcional para eliminar el cliente. Si no se pasa, no aparece el botón. */
  onEliminar?: (cliente: Cliente) => Promise<void>
  /** Si se pasa y se está creando un cliente nuevo, se lo asigna a este socio automáticamente. */
  defaultSocioAsignado?: string
  onCerrar: () => void
  /** Devuelve el cliente creado/editado para que quien invoca pueda seleccionarlo automáticamente. */
  onOk: (cliente: Cliente) => void
}

export function ClienteDialog({
  abierto, socios, editar, soloLectura, modo = 'completo', stats, onEliminar, defaultSocioAsignado, onCerrar, onOk,
}: Props) {
  const [confirmEliminar, setConfirmEliminar] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<Cliente['tipo']>('minorista')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [direccion, setDireccion] = useState('')
  const [localidad, setLocalidad] = useState('')
  const [rut, setRut] = useState('')
  const [pago, setPago] = useState('')
  const [socioAsig, setSocioAsig] = useState<string>('')
  const [listaPreciosId, setListaPreciosId] = useState<string>('')
  const [listas, setListas] = useState<Array<{ id: number; nombre: string }>>([])
  useEffect(() => {
    supabase.from('listas_precios').select('id,nombre').eq('activo', true).order('id').then(({ data }) => setListas(data ?? []))
  }, [])
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    if (editar) {
      setNombre(editar.nombre); setTipo(editar.tipo)
      setEmail(editar.email ?? ''); setWhatsapp(editar.whatsapp ?? editar.telefono ?? '')
      setDireccion(editar.direccion ?? ''); setLocalidad(editar.localidad ?? '')
      setRut(editar.rut ?? ''); setPago(editar.condiciones_pago ?? '')
      setSocioAsig(editar.socio_asignado ?? ''); setNotas(editar.notas ?? '')
      setListaPreciosId(editar.lista_precios_id ? String(editar.lista_precios_id) : '')
    } else {
      const b = leerObj<{ nombre: string; tipo: Cliente['tipo']; email: string; whatsapp: string; direccion: string; localidad: string; rut: string; pago: string; socioAsig: string; notas: string }>(BORRADOR_CLIENTE)
      if (b) {
        setNombre(b.nombre); setTipo(b.tipo); setEmail(b.email); setWhatsapp(b.whatsapp)
        setDireccion(b.direccion); setLocalidad(b.localidad); setRut(b.rut); setPago(b.pago)
        setSocioAsig(b.socioAsig || (defaultSocioAsignado ?? ''))
        setNotas(b.notas)
      } else {
        setNombre(''); setTipo('minorista'); setEmail(''); setWhatsapp('')
        setDireccion(''); setLocalidad(''); setRut(''); setPago('')
        setSocioAsig(defaultSocioAsignado ?? '')
        setNotas('')
      }
    }
    setError(null); setConfirmEliminar(false)
  }, [abierto, editar, defaultSocioAsignado])

  // Guardar borrador al escribir (solo en modo nuevo)
  useEffect(() => {
    if (!abierto || editar) return
    guardarObj(BORRADOR_CLIENTE, { nombre, tipo, email, whatsapp, direccion, localidad, rut, pago, socioAsig, notas })
  }, [abierto, editar, nombre, tipo, email, whatsapp, direccion, localidad, rut, pago, socioAsig, notas])

  async function eliminar() {
    if (!editar || !onEliminar) return
    setEliminando(true); setError(null)
    try {
      await onEliminar(editar)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar')
      setEliminando(false)
    }
  }

  function formatFecha(iso: string | null): string {
    if (!iso) return '—'
    return new Date(iso + 'T00:00:00').toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  function formatDias(n: number | null): string {
    if (n === null) return '—'
    if (n === 0) return 'hoy'
    if (n === 1) return 'ayer'
    if (n < 7) return `hace ${n} días`
    if (n < 30) return `hace ${Math.round(n / 7)} sem.`
    if (n < 365) return `hace ${Math.round(n / 30)} meses`
    return `hace ${Math.round(n / 365)} años`
  }
  function formatFrecuencia(n: number | null): string {
    if (n === null) return 'primera compra'
    if (n < 14) return `cada ${Math.round(n)} días`
    if (n < 60) return `cada ${Math.round(n / 7)} semanas`
    return `cada ${Math.round(n / 30)} meses`
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true); setError(null)
    const payload = {
      nombre: nombre.trim(),
      tipo,
      telefono: null,
      email: email.trim() || null,
      whatsapp: whatsapp.trim() || null,
      direccion: direccion.trim() || null,
      localidad: localidad.trim() || null,
      rut: rut.trim() || null,
      condiciones_pago: pago.trim() || null,
      socio_asignado: socioAsig || null,
      lista_precios_id: listaPreciosId ? Number(listaPreciosId) : null,
      notas: notas.trim() || null,
      actualizado_en: new Date().toISOString(),
    }
    const q = editar
      ? supabase.from('clientes').update(payload).eq('id', editar.id).select('*').single()
      : supabase.from('clientes').insert({ ...payload, origen: 'manual' }).select('*').single()
    const { data, error } = await q
    setGuardando(false)
    if (error || !data) { setError(error?.message ?? 'Error al guardar'); return }
    if (!editar) borrarKey(BORRADOR_CLIENTE)
    onOk(data as Cliente)
  }

  const rapido = modo === 'rapido' && !editar

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo={editar ? (soloLectura ? 'Cliente' : 'Editar cliente') : (rapido ? 'Nuevo cliente (alta rápida)' : 'Nuevo cliente')} ancho={rapido ? 'md' : 'lg'}>
      <form onSubmit={guardar} className="space-y-4">
        <div className={rapido ? 'space-y-3' : 'grid grid-cols-1 sm:grid-cols-2 gap-4'}>
          <div className={rapido ? '' : 'sm:col-span-2'}>
            <label className="label">Nombre / razón social</label>
            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} required disabled={soloLectura} autoFocus />
          </div>
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as Cliente['tipo'])} disabled={soloLectura}>
              {TIPOS_CLIENTE.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Teléfono</label>
            <input className="input" placeholder="+598 9X XXX XXX" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} disabled={soloLectura} />
          </div>
          {!rapido && (
            <>
              <div>
                <label className="label">Socio asignado</label>
                <select className="input" value={socioAsig} onChange={(e) => setSocioAsig(e.target.value)} disabled={soloLectura}>
                  <option value="">— sin asignar —</option>
                  {socios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Lista de precios</label>
                <select className="input" value={listaPreciosId} onChange={(e) => setListaPreciosId(e.target.value)} disabled={soloLectura}>
                  <option value="">— consumidor (default) —</option>
                  {listas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
                <p className="text-[10px] text-oliva-500 mt-1">Al elegir este cliente en una venta, se cargan los precios de esta lista.</p>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Email</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={soloLectura} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Dirección</label>
                <input className="input" value={direccion} onChange={(e) => setDireccion(e.target.value)} disabled={soloLectura} />
              </div>
              <div>
                <label className="label">Localidad</label>
                <input className="input" value={localidad} onChange={(e) => setLocalidad(e.target.value)} disabled={soloLectura} />
              </div>
              <div>
                <label className="label">RUT (opcional)</label>
                <input className="input" value={rut} onChange={(e) => setRut(e.target.value)} disabled={soloLectura} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Condiciones de pago</label>
                <input className="input" value={pago} onChange={(e) => setPago(e.target.value)} placeholder="ej: contado / 30 días" disabled={soloLectura} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Notas</label>
                <textarea className="input min-h-[70px]" value={notas} onChange={(e) => setNotas(e.target.value)} disabled={soloLectura} />
              </div>
            </>
          )}
        </div>
        {rapido && (
          <p className="text-xs text-oliva-600">
            Alta express — solo nombre, tipo y teléfono. Podés completar el resto después desde el módulo Clientes.
          </p>
        )}

        {/* Estadísticas de compras (solo al editar) */}
        {editar && stats && (
          <div className="rounded-xl border border-oliva-100 bg-oliva-50/60 p-4 space-y-3">
            <div className="text-xs uppercase tracking-wide text-oliva-700 font-medium">📊 Historial de compras</div>
            {stats.compras === 0 ? (
              <div className="text-sm text-oliva-600 italic">Sin compras registradas en la app todavía.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-[11px] text-oliva-600 uppercase">Compras</div>
                  <div className="tabular-nums font-semibold text-oliva-900">{stats.compras}</div>
                </div>
                <div>
                  <div className="text-[11px] text-oliva-600 uppercase">Total gastado</div>
                  <div className="tabular-nums font-semibold text-oliva-900">{money(stats.total)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-oliva-600 uppercase">Ticket promedio</div>
                  <div className="tabular-nums font-semibold text-oliva-900">{money(stats.ticketPromedio)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-oliva-600 uppercase">Frecuencia</div>
                  <div className="font-semibold text-oliva-900">{formatFrecuencia(stats.frecuenciaDias)}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[11px] text-oliva-600 uppercase">Última compra</div>
                  <div className="font-medium text-oliva-900">{formatFecha(stats.ultimaCompra)} <span className="text-xs text-oliva-600">· {formatDias(stats.diasDesdeUltima)}</span></div>
                </div>
                <div className="col-span-2">
                  <div className="text-[11px] text-oliva-600 uppercase">Primera compra</div>
                  <div className="font-medium text-oliva-900">{formatFecha(stats.primeraCompra)}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {error && <div className="text-sm text-red-700">{error}</div>}

        {/* Zona destructiva: eliminar (solo al editar y si hay callback) */}
        {editar && onEliminar && !soloLectura && (
          <div className="border-t border-oliva-100 pt-3">
            {confirmEliminar ? (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-2">
                <div className="text-sm text-red-800">
                  ¿Eliminar el cliente <b>{editar.nombre}</b>? Las ventas cargadas se conservan como <i>"sin cliente"</i>. Esta acción no se puede deshacer.
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-secondary text-xs" onClick={() => setConfirmEliminar(false)} disabled={eliminando}>Cancelar</button>
                  <button type="button" className="text-xs px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50" onClick={eliminar} disabled={eliminando}>
                    {eliminando ? 'Eliminando…' : 'Sí, eliminar'}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="text-xs text-red-700 hover:text-red-900 underline" onClick={() => setConfirmEliminar(true)}>
                Eliminar cliente
              </button>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onCerrar}>{soloLectura ? 'Cerrar' : 'Cancelar'}</button>
          {!soloLectura && (
            <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          )}
        </div>
      </form>
    </Dialog>
  )
}
