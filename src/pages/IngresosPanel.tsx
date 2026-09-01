import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Dialog } from '../components/Dialog'
import { EditorCategoriasDialog } from '../components/EditorCategoriasDialog'
import { money } from '../lib/format'

function esAdmin(nombre: string | null | undefined): boolean {
  const n = (nombre ?? '').toLowerCase()
  return n.includes('rodrigo') || n.includes('santi')
}

interface Categoria { id: number; slug: string; nombre: string; activo: boolean; orden: number }
interface Socio { id: string; nombre: string; cuenta_default_id?: number | null }
interface CuentaBancaria { id: number; nombre: string; moneda: 'UYU' | 'USD' }
interface Ingreso {
  id: number
  fecha: string
  socio_id: string | null
  categoria_id: number | null
  monto: number
  moneda: 'UYU' | 'USD'
  descripcion: string | null
  comprobante_url: string | null
  cuenta_id: number | null
  creado_en: string
}

const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export function IngresosPanel() {
  const { session, perfil } = useAuth()
  const soyYo = session?.user.id ?? ''
  const puedeEditarCat = esAdmin(perfil?.nombre)

  const [ingresos, setIngresos] = useState<Ingreso[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [socios, setSocios] = useState<Socio[]>([])
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
  const [cargando, setCargando] = useState(true)
  const [nuevo, setNuevo] = useState(false)
  const [editorCat, setEditorCat] = useState(false)
  const [editando, setEditando] = useState<Ingreso | null>(null)

  const hoy = new Date()
  const [mes, setMes] = useState<string>(String(hoy.getMonth() + 1).padStart(2, '0'))
  const [anio, setAnio] = useState<string>(String(hoy.getFullYear()))
  const [filtroCat, setFiltroCat] = useState<string>('todas')

  async function cargar() {
    setCargando(true)
    const [i, c, p, cb] = await Promise.all([
      supabase.from('ingresos').select('*').order('fecha', { ascending: false }).order('id', { ascending: false }),
      supabase.from('categorias_ingreso').select('*').eq('activo', true).order('orden'),
      supabase.from('perfiles').select('id,nombre,cuenta_default_id').eq('activo', true).order('nombre'),
      supabase.from('cuentas_bancarias').select('id,nombre,moneda').eq('activo', true).order('id'),
    ])
    setIngresos((i.data as Ingreso[]) ?? [])
    setCategorias((c.data as Categoria[]) ?? [])
    setSocios((p.data as Socio[]) ?? [])
    setCuentas((cb.data as CuentaBancaria[]) ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const catPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias])
  const socioPorId = useMemo(() => new Map(socios.map((s) => [s.id, s])), [socios])

  const filtrados = useMemo(() => {
    const desde = `${anio}-${mes}-01`
    const hastaDate = new Date(Number(anio), Number(mes), 0).toISOString().slice(0, 10)
    return ingresos.filter((g) => {
      if (g.fecha < desde || g.fecha > hastaDate) return false
      if (filtroCat !== 'todas' && String(g.categoria_id) !== filtroCat) return false
      return true
    })
  }, [ingresos, mes, anio, filtroCat])

  const totalUYU = filtrados.filter((g) => g.moneda === 'UYU').reduce((s, g) => s + Number(g.monto), 0)
  const totalUSD = filtrados.filter((g) => g.moneda === 'USD').reduce((s, g) => s + Number(g.monto), 0)

  async function eliminar(id: number) {
    if (!confirm('¿Eliminar este ingreso? No se puede deshacer.')) return
    const { error } = await supabase.from('ingresos').delete().eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    cargar()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-oliva-700">
            Ingresos que <b>no</b> son ventas de aceite: eventos, alquileres, aportes de capital, ventas ocasionales, etc.
          </p>
        </div>
        <div className="flex gap-2">
          {puedeEditarCat && (
            <button type="button" className="btn-secondary" onClick={() => setEditorCat(true)}>
              🏷️ Categorías
            </button>
          )}
          <button className="btn-primary" onClick={() => setNuevo(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
            Nuevo ingreso
          </button>
        </div>
      </div>

      <div className="card p-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div>
          <label className="label">Mes</label>
          <select className="input" value={mes} onChange={(e) => setMes(e.target.value)}>
            {MESES_ES.map((m, i) => <option key={i + 1} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Año</label>
          <select className="input" value={anio} onChange={(e) => setAnio(e.target.value)}>
            {[hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Categoría</label>
          <select className="input" value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)}>
            <option value="todas">Todas</option>
            {categorias.map((c) => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="panel">
          <div className="text-[10px] font-bold uppercase tracking-widest text-oliva-500">Total en pesos</div>
          <div className="text-xl font-extrabold text-oliva-900 mt-1 tabular-nums">{money(totalUYU)}</div>
        </div>
        <div className="panel">
          <div className="text-[10px] font-bold uppercase tracking-widest text-oliva-500">Total en dólares</div>
          <div className="text-xl font-extrabold text-oliva-900 mt-1 tabular-nums">U$S {Number(totalUSD).toLocaleString('es-UY')}</div>
        </div>
      </div>

      {cargando ? (
        <div className="card p-6 text-sm text-oliva-700">Cargando…</div>
      ) : filtrados.length === 0 ? (
        <div className="card p-6 text-sm text-oliva-700 text-center">Sin ingresos en el período.</div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-oliva-100/60 text-oliva-800 text-xs uppercase tracking-wide">
              <tr>
                <th className="py-2 px-4 text-left">Fecha</th>
                <th className="py-2 px-4 text-left">Categoría</th>
                <th className="py-2 px-4 text-left">Descripción</th>
                <th className="py-2 px-4 text-left">Socio</th>
                <th className="py-2 px-4 text-right">Monto</th>
                <th className="py-2 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((g) => (
                <tr key={g.id} className="border-t border-oliva-100 hover:bg-oliva-50/50">
                  <td className="py-2 px-4 text-oliva-700 tabular-nums">{g.fecha}</td>
                  <td className="py-2 px-4 text-oliva-800">{catPorId.get(g.categoria_id ?? -1)?.nombre ?? '—'}</td>
                  <td className="py-2 px-4 text-oliva-700">{g.descripcion || <span className="text-oliva-400">—</span>}</td>
                  <td className="py-2 px-4 text-oliva-700">{socioPorId.get(g.socio_id ?? '')?.nombre ?? '—'}</td>
                  <td className="py-2 px-4 text-right font-semibold tabular-nums">
                    {g.moneda === 'USD' ? `U$S ${Number(g.monto).toLocaleString('es-UY')}` : money(Number(g.monto))}
                  </td>
                  <td className="py-2 px-4 text-right">
                    <button className="text-xs text-oliva-700 hover:text-oliva-900 underline mr-2" onClick={() => setEditando(g)}>Editar</button>
                    <button className="text-xs text-red-700 hover:text-red-900 underline" onClick={() => eliminar(g.id)}>Borrar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <IngresoDialog
        abierto={nuevo || editando !== null}
        editar={editando}
        categorias={categorias}
        socios={socios}
        cuentas={cuentas}
        soyYo={soyYo}
        onCerrar={() => { setNuevo(false); setEditando(null) }}
        onOk={() => { setNuevo(false); setEditando(null); cargar() }}
      />
      <EditorCategoriasDialog
        abierto={editorCat}
        tabla="categorias_ingreso"
        titulo="Categorías de ingresos"
        onCerrar={() => setEditorCat(false)}
        onCambio={cargar}
      />
    </div>
  )
}

function IngresoDialog({ abierto, editar, categorias, socios, cuentas, soyYo, onCerrar, onOk }: {
  abierto: boolean
  editar: Ingreso | null
  categorias: Categoria[]
  socios: Socio[]
  cuentas: CuentaBancaria[]
  soyYo: string
  onCerrar: () => void
  onOk: () => void
}) {
  const [fecha, setFecha] = useState<string>(new Date().toISOString().slice(0, 10))
  const [socioId, setSocioId] = useState<string>('')
  const [categoriaId, setCategoriaId] = useState<string>('')
  const [monto, setMonto] = useState<string>('')
  const [moneda, setMoneda] = useState<'UYU' | 'USD'>('UYU')
  const [descripcion, setDescripcion] = useState('')
  const [cuentaId, setCuentaId] = useState<string>('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    if (editar) {
      setFecha(editar.fecha)
      setSocioId(editar.socio_id ?? '')
      setCategoriaId(editar.categoria_id ? String(editar.categoria_id) : '')
      setMonto(String(editar.monto))
      setMoneda(editar.moneda)
      setDescripcion(editar.descripcion ?? '')
      setCuentaId(editar.cuenta_id ? String(editar.cuenta_id) : '')
    } else {
      setFecha(new Date().toISOString().slice(0, 10))
      setSocioId(soyYo)
      setCategoriaId('')
      setMonto(''); setMoneda('UYU'); setDescripcion(''); setCuentaId('')
    }
    setError(null)
  }, [abierto, editar, soyYo])

  // Auto-selección de cuenta según socio elegido + moneda
  useEffect(() => {
    if (!abierto || editar) return
    const socio = socios.find((s) => s.id === socioId)
    const def = socio?.cuenta_default_id
    if (def && cuentas.some((c) => c.id === def && c.moneda === moneda)) {
      setCuentaId(String(def))
    } else {
      // Buscar cualquier cuenta del socio en la moneda actual, si no hay caer a Harria
      const harria = cuentas.find((c) => c.nombre.toLowerCase().includes('harria') && c.moneda === moneda)
      setCuentaId(harria ? String(harria.id) : '')
    }
  }, [abierto, editar, socioId, moneda, cuentas, socios])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!categoriaId) { setError('Elegí una categoría.'); return }
    if (!monto || Number(monto) <= 0) { setError('Monto inválido.'); return }
    setGuardando(true); setError(null)
    const payload = {
      fecha,
      socio_id: socioId || null,
      categoria_id: Number(categoriaId),
      monto: Number(monto),
      moneda,
      descripcion: descripcion.trim() || null,
      cuenta_id: cuentaId ? Number(cuentaId) : null,
      actualizado_en: new Date().toISOString(),
    }
    const q = editar
      ? supabase.from('ingresos').update(payload).eq('id', editar.id)
      : supabase.from('ingresos').insert(payload)
    const { error: err } = await q
    setGuardando(false)
    if (err) { setError(err.message); return }
    onOk()
  }

  return (
    <Dialog abierto={abierto} onCerrar={onCerrar} titulo={editar ? `Ingreso #${editar.id}` : 'Nuevo ingreso'} ancho="md">
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Fecha</label>
            <input type="date" className="input" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </div>
          <div>
            <label className="label">Socio (opcional)</label>
            <select className="input" value={socioId} onChange={(e) => setSocioId(e.target.value)}>
              <option value="">— sin socio —</option>
              {socios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Categoría <span className="text-red-600">*</span></label>
          <select className="input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} required>
            <option value="">— elegí una —</option>
            {categorias.map((c) => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Monto <span className="text-red-600">*</span></label>
            <input type="number" step="0.01" min="0" className="input" value={monto} onChange={(e) => setMonto(e.target.value)} required />
          </div>
          <div>
            <label className="label">Moneda</label>
            <div className="flex gap-1">
              {(['UYU', 'USD'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMoneda(m)}
                  className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${
                    moneda === m ? 'bg-oliva-800 text-white' : 'bg-white ring-1 ring-oliva-200 text-oliva-700 hover:ring-oliva-400'
                  }`}
                >
                  {m === 'UYU' ? '$ pesos' : 'U$S dólares'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className="label">Cuenta destino</label>
          <select className="input" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
            <option value="">— sin cuenta / efectivo —</option>
            {cuentas.filter((c) => c.moneda === moneda).map((c) => (
              <option key={c.id} value={String(c.id)}>{c.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Descripción (opcional)</label>
          <input className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="ej. tickets evento HEAT, arrendamiento Pardie 1/2" />
        </div>
        {error && <div className="text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-2 border-t border-oliva-100">
          <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Dialog>
  )
}
