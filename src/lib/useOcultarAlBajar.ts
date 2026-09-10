import { useEffect, useRef, useState } from 'react'

// Hook para ocultar/mostrar elementos fijos (BottomNav, FAB) segun la direccion del scroll.
// - Se oculta cuando el usuario baja (para dejar mas espacio a la lectura).
// - Reaparece apenas empieza a subir.
// - Cerca del tope (< topSiempreVisible) siempre esta visible.
const SCROLL_UMBRAL = 40
const TOP_SIEMPRE_VISIBLE = 80

export function useOcultarAlBajar(): boolean {
  const [oculto, setOculto] = useState(false)
  const ultimoY = useRef(0)
  const acumBajando = useRef(0)
  const acumSubiendo = useRef(0)

  useEffect(() => {
    ultimoY.current = window.scrollY
    function onScroll() {
      const y = window.scrollY
      const dy = y - ultimoY.current
      ultimoY.current = y
      if (y < TOP_SIEMPRE_VISIBLE) {
        acumBajando.current = 0; acumSubiendo.current = 0
        setOculto(false)
        return
      }
      if (dy > 0) {
        acumBajando.current += dy
        acumSubiendo.current = 0
        if (acumBajando.current > SCROLL_UMBRAL) setOculto(true)
      } else if (dy < 0) {
        acumSubiendo.current += -dy
        acumBajando.current = 0
        if (acumSubiendo.current > SCROLL_UMBRAL / 2) setOculto(false)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return oculto
}
