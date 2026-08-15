import { type ReactNode, useEffect } from 'react'

interface Props {
  abierto: boolean
  onCerrar: () => void
  titulo: string
  children: ReactNode
  ancho?: 'sm' | 'md' | 'lg'
}

export function Dialog({ abierto, onCerrar, titulo, children, ancho = 'md' }: Props) {
  useEffect(() => {
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar()
    }
    if (abierto) document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [abierto, onCerrar])

  if (!abierto) return null

  const w = ancho === 'sm' ? 'max-w-sm' : ancho === 'lg' ? 'max-w-2xl' : 'max-w-md'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onCerrar}
    >
      <div
        className={`w-full ${w} bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-oliva-100 px-5 py-3 sticky top-0 bg-white">
          <h2 className="font-semibold text-oliva-900">{titulo}</h2>
          <button
            className="text-oliva-600 hover:text-oliva-900 text-xl leading-none"
            onClick={onCerrar}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
