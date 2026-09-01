import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { Gastos } from './Gastos'
import { IngresosPanel } from './IngresosPanel'
import { CategoriasPanel } from './CategoriasPanel'

type Tab = 'egresos' | 'ingresos' | 'categorias'

function esAdmin(nombre: string | null | undefined): boolean {
  const n = (nombre ?? '').toLowerCase()
  return n.includes('rodrigo') || n.includes('santi')
}

export function Finanzas() {
  const { perfil } = useAuth()
  const puedeEditarCat = esAdmin(perfil?.nombre)
  const [tab, setTab] = useState<Tab>('egresos')

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'egresos', label: 'Egresos', icon: '💸' },
    { key: 'ingresos', label: 'Ingresos', icon: '💰' },
    ...(puedeEditarCat ? [{ key: 'categorias' as Tab, label: 'Categorías', icon: '🏷️' }] : []),
  ]

  return (
    <div className="space-y-5 max-w-[1200px]">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-oliva-500">Finanzas</div>
        <h1 className="text-xl font-bold text-oliva-900 mt-1">Ingresos y Egresos</h1>
      </div>

      <div className="flex gap-1 border-b border-oliva-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${
              tab === t.key
                ? 'border-oliva-800 text-oliva-900'
                : 'border-transparent text-oliva-500 hover:text-oliva-700'
            }`}
          >
            <span className="mr-1.5">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'egresos' && <Gastos />}
        {tab === 'ingresos' && <IngresosPanel />}
        {tab === 'categorias' && puedeEditarCat && <CategoriasPanel />}
      </div>
    </div>
  )
}
