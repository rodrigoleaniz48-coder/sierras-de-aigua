// Tema claro/oscuro. 'sistema' sigue la preferencia del SO.
// La clase .dark se aplica en <html>; la primera aplicacion la hace un script
// inline en index.html para evitar parpadeo. Este hook la mantiene en sync.
import { useCallback, useEffect, useState } from 'react'

export type Tema = 'claro' | 'oscuro' | 'sistema'

const KEY = 'tema'

export function leerTema(): Tema {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'claro' || v === 'oscuro' || v === 'sistema') return v
  } catch { /* nada */ }
  return 'sistema'
}

function sistemaEsOscuro(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function aplicarTema(t: Tema) {
  const dark = t === 'oscuro' || (t === 'sistema' && sistemaEsOscuro())
  document.documentElement.classList.toggle('dark', dark)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#15180f' : '#829378')
}

export function useTema() {
  const [tema, setTemaState] = useState<Tema>(leerTema)

  const setTema = useCallback((t: Tema) => {
    setTemaState(t)
    try { localStorage.setItem(KEY, t) } catch { /* nada */ }
    aplicarTema(t)
  }, [])

  // Si esta en 'sistema', reaccionar a cambios de la preferencia del SO.
  useEffect(() => {
    if (tema !== 'sistema') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => aplicarTema('sistema')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [tema])

  return { tema, setTema }
}
