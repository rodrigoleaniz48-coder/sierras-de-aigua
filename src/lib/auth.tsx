import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Perfil, Rol } from './types'

interface AuthState {
  session: Session | null
  perfil: Perfil | null
  cargando: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  puede: (roles: Rol[]) => boolean
}

const Ctx = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setPerfil(null)
      setCargando(false)
      return
    }
    setCargando(true)
    supabase
      .from('perfiles')
      .select('id,nombre,rol,activo,puede_modificar_stock')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setPerfil((data as Perfil) ?? null)
        setCargando(false)
      })
  }, [session])

  const signIn: AuthState['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const puede: AuthState['puede'] = (roles) => !!perfil && roles.includes(perfil.rol)

  return (
    <Ctx.Provider value={{ session, perfil, cargando, signIn, signOut, puede }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth fuera de AuthProvider')
  return v
}
