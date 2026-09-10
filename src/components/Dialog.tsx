import { type ReactNode, useEffect, useRef } from 'react'

interface Props {
  abierto: boolean
  onCerrar: () => void
  titulo: string
  children: ReactNode
  ancho?: 'sm' | 'md' | 'lg'
  /**
   * Si se pasa, la posicion de scroll interna del dialog se guarda en
   * localStorage bajo esta clave y se restaura cuando el dialog vuelve a abrirse.
   * Util para volver a la app despues de mirar WhatsApp: se retoma en el mismo
   * punto sin perder de vista lo que se estaba completando.
   */
  scrollKey?: string
}

export function Dialog({ abierto, onCerrar, titulo, children, ancho = 'md', scrollKey }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar()
    }
    if (abierto) document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [abierto, onCerrar])

  // Persistencia de scroll dentro del dialog: cuando el usuario cambia de app
  // (visibilitychange), o se cierra la pagina, guardamos el offset. Al montar,
  // restauramos.
  useEffect(() => {
    if (!abierto || !scrollKey) return
    const el = scrollRef.current
    if (!el) return
    // Restaurar
    try {
      const raw = localStorage.getItem(`dialog:scroll:${scrollKey}`)
      const n = raw ? Number(raw) : 0
      if (n > 0) {
        // Doble RAF: esperar a que el contenido termine de layoutear antes de scrollear
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = n
        }))
      }
    } catch { /* nada */ }
    function guardar() {
      try {
        if (scrollRef.current) localStorage.setItem(`dialog:scroll:${scrollKey}`, String(scrollRef.current.scrollTop))
      } catch { /* nada */ }
    }
    document.addEventListener('visibilitychange', guardar)
    window.addEventListener('pagehide', guardar)
    window.addEventListener('beforeunload', guardar)
    return () => {
      guardar()
      document.removeEventListener('visibilitychange', guardar)
      window.removeEventListener('pagehide', guardar)
      window.removeEventListener('beforeunload', guardar)
    }
  }, [abierto, scrollKey])

  if (!abierto) return null

  const w = ancho === 'sm' ? 'max-w-sm' : ancho === 'lg' ? 'max-w-2xl' : 'max-w-md'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onCerrar}
    >
      <div
        ref={scrollRef}
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
