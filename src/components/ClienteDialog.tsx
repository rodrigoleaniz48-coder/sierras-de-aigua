import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Dialog } from './Dialog'

export interface Cliente {
  id: number
  nombre: string
  tipo: 'minorista' | 'mayorista' | 'feria' | 'envio' | 'otro'
  telefono: string | null
  email: string | null
  whatsapp: string | null
  direccion: string | null
  localidad: string | null
  rut: string | null
  condiciones_pago: string | null
  socio_asignado: string | null
  notas: string | null
  creado_en?: string
}

export interface Socio { id: string; nombre: string }

export const TIPOS_CLIENTE: Cliente['tipo'][] = ['minorista', 'mayorista', 'feria', 'envio', 'otro']

interface Props {
  abierto: boolean
  socios: Socio[]
  editar?: Cliente | null
  soloLectura?: boolean
  /** Si es "rapido", muestra solo los campos esenciales — pensado para alta express desde Ventas. */
  modo?: 'completo' | 'rapido'
  onCerrar: () => void
  /** Devuelve el cliente creado/editado para que quien invoca pueda seleccionarlo automáticamente. */
  onOk: (cliente: Cliente) => void
}

export function ClienteDialog({
  abierto, socios, editar, soloLectura, modo = 'completo', onCerrar, onOk,
}: Props) {
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<Cliente['tipo']>('minorista')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [direccion, setDireccion] = useState('')
  const [localidad, setLocalidad] = useState('')
  const [rut, setRut] = useState('')
  const [pago, setPago] = useState('')
  const [socioAsig, setSocioAsig] = useState<string>('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    if (editar) {
      setNombre(editar.nombre); setTipo(editar.tipo); setTelefono(editar.telefono ?? '')
      setEmail(editar.email ?? ''); setWhatsapp(editar.whatsapp ?? '')
      setDireccion(editar.direccion ?? ''); setLocalidad(editar.localidad ?? '')
      setRut(editar.rut ?? ''); setPago(editar.condiciones_pago ?? '')
      setSocioAsig(editar.socio_asignado ?? ''); setNotas(editar.notas ?? '')
    } else {
      setNombre(''); setTipo('minorista'); setTelefono(''); setEmail(''); setWhatsapp('')
      setDireccion(''); setLocalidad(''); setRut(''); setPago(''); setSocioAsig(''); setNotas('')
    }
    setError(null)
  }, [abierto, editar])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true); setError(null)
    const payload = {
      nombre: nombre.trim(),
      tipo,
      telefono: telefono.trim() || null,
      email: email.trim() || null,
      whatsapp: whatsapp.trim() || null,
      direccion: direccion.trim() || null,
      localidad: localidad.trim() || null,
      rut: rut.trim() || null,
      condiciones_pago: pago.trim() || null,
      socio_asignado: socioAsig || null,
      notas: notas.trim() || null,
      actualizado_en: new Date().toISOString(),
    }
    const q = editar
      ? supabase.from('clientes').update(payload).eq('id', editar.id).select('*').single()
      : supabase.from('clientes').insert({ ...payload, origen: 'manual' }).select('*').single()
    const { data, error } = await q
    setGuardando(false)
    if (error || !data) { setError(error?.message ?? 'Error al guardar'); return }
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
            <input className="input" value={telefono} onChange={(e) => setTelefono(e.target.value)} disabled={soloLectura} />
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
                <label className="label">WhatsApp</label>
                <input className="input" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} disabled={soloLectura} />
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
        {error && <div className="text-sm text-red-700">{error}</div>}
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
