import { useState, type ReactNode } from 'react'
import { useAuth } from '../lib/auth'

// Manual de uso de la app, dentro de la propia app. Contenido estático,
// organizado por módulo + una guía por rol arriba. Mobile-first: cada
// módulo es una sección colapsable (acordeón) para no ser un muro de texto.

export function Manual() {
  const { perfil } = useAuth()
  const rol = perfil?.rol ?? ''

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-oliva-900">Manual de uso</h1>
        <p className="text-sm text-oliva-700 mt-1">
          Guía rápida de la app, módulo por módulo. Arriba tenés qué puede hacer cada persona según su rol.
          Tocá cada sección para desplegarla.
        </p>
      </div>

      {/* Guía por rol */}
      <div className="card p-4 space-y-3">
        <div className="text-xs font-bold uppercase tracking-widest text-oliva-500">Qué puede hacer cada rol</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <RolCard
            titulo="Rodrigo y Santiago"
            rol="Administrador"
            activo={rol === 'admin'}
            items={[
              'Acceso total a todos los módulos.',
              'Ventas, Clientes, Stock, Ingresos/Egresos, Tareas.',
              'Contabilidad y Administración (precios, IVA, costos).',
              'Herramientas de márgenes, listas de precios y backup.',
            ]}
          />
          <RolCard
            titulo="Gonzalo"
            rol="Ventas (Maldonado)"
            activo={rol === 'ventas'}
            items={[
              'Inicio, Ventas y Tareas.',
              'Clientes: solo los suyos.',
              'Stock: consulta y traslados (no ve Montevideo).',
              'Ingresos/Egresos: solo los propios. Sin Contabilidad ni Administración.',
            ]}
          />
          <RolCard
            titulo="Ayelén"
            rol="Marketing (lectura)"
            activo={rol === 'marketing'}
            items={[
              'Inicio, Clientes, Stock, Ingresos/Egresos, Tareas.',
              'Modo consulta (no modifica).',
              'Ideal para ver reportes y datos de clientes.',
            ]}
          />
          <RolCard
            titulo="Emiliano"
            rol="Campo"
            activo={rol === 'campo'}
            items={[
              'Solo Tareas (la app lo lleva directo ahí).',
              'Ve y actualiza las tareas que le asignan.',
              'Puede registrar tareas realizadas y sus jornales.',
            ]}
          />
        </div>
        <p className="text-[11px] text-oliva-500">
          Para cambiar tu contraseña o cerrar sesión: menú de tu cuenta (abajo a la izquierda en la compu, o el botón con tus
          iniciales arriba en el teléfono).
        </p>
      </div>

      {/* Secciones por módulo */}
      <Seccion icono="🏠" titulo="Inicio (pantalla principal)">
        <p><b>Para qué sirve:</b> el resumen del día — lo primero que ves al entrar.</p>
        <Lista items={[
          'KPIs del mes: Ventas del mes, Aceite (litros) y comparación con el mes anterior (↑/↓ %).',
          'Reporte semanal: tocá "Ver detalle" para ver ventas por socio, top clientes y top productos de la semana.',
          'Barra "Pendiente ventas": cuántas ventas quedan sin cobrar (y el monto). Tocala para ir a Ventas.',
          'Gráfica Ingresos vs Egresos de los últimos 6 meses (convierte dólares con la cotización del BCU).',
          'Alertas: stock bajo, tareas pendientes y aviso para coordinar cadete con otro socio.',
        ]} />
        <Nota>Emiliano (campo) no ve esta pantalla: la app lo lleva directo a Tareas.</Nota>
      </Seccion>

      <Seccion icono="🧾" titulo="Ventas">
        <p><b>Para qué sirve:</b> registrar cada venta. Al guardarla, descuenta el stock automáticamente.</p>
        <p className="font-medium text-oliva-800 mt-2">Nueva venta</p>
        <Lista items={[
          'Elegí el cliente con el buscador (escribí nombre, teléfono o localidad). Podés dejar "sin cliente" para feria/mostrador.',
          'Agregá ítems (producto + presentación + unidades). El precio sale solo; podés marcar un ítem como regalo.',
          'Con factura: agrega el IVA que corresponde a cada producto (aceites y jabón 10%, miel 0%, resto 22%).',
          'Promoción comercial: la venta es un regalo (no se cobra) y se registra su costo como gasto.',
          'A confirmar: venta potencial — no descuenta stock ni cuenta en reportes hasta que la confirmes.',
          'Moneda UYU o USD, forma de pago (efectivo/transferencia) y envío por cadete con horario.',
        ]} />
        <p className="font-medium text-oliva-800 mt-2">Cobros y pendientes</p>
        <Lista items={[
          'Arriba se listan las ventas pendientes de entrega o cobro.',
          'Cada venta sin cobrar muestra los días de atraso y un botón "Recordar" que abre WhatsApp con el mensaje de cobro + datos bancarios.',
          'Cobro en efectivo: al marcarla cobrada salta un diálogo para cargar ese efectivo como adelanto del socio que lo recibió.',
        ]} />
        <p className="font-medium text-oliva-800 mt-2">Detalle de una venta</p>
        <Lista items={[
          'Tocá una venta para ver el detalle, marcar entregado/cobrado, editar o anular.',
          'Anular revierte el stock y el granel, y borra los gastos que esa venta había generado.',
          'Cadete: "Lista para cadete" arma el mensaje del reparto; "Pago mensual cadete" calcula lo que se le paga.',
        ]} />
        <Nota>Disponible para Rodrigo, Santiago y Gonzalo.</Nota>
      </Seccion>

      <Seccion icono="👥" titulo="Clientes (CRM)">
        <p><b>Para qué sirve:</b> la base de clientes y el contacto por WhatsApp.</p>
        <Lista items={[
          'Lista con buscador, filtros por tipo y por segmento, y orden (por nombre, última compra, cantidad o total).',
          'Segmentos automáticos: nuevos, compró recién, frecuentes activos/inactivos, en riesgo, perdidos y sin compras.',
          'Envío masivo de WhatsApp: seleccioná varios clientes y elegí una plantilla. Usá {nombre} para el cliente y {socio} para tu firma (sale con tu nombre).',
          'La app marca "enviado hoy" para no repetir, y tiene un flujo "siguiente pendiente" para ir uno por uno.',
        ]} />
        <Nota>Gonzalo ve solo sus clientes asignados. El envío es uno por uno (WhatsApp no permite listas de difusión desde afuera).</Nota>
      </Seccion>

      <Seccion icono="📦" titulo="Stock">
        <p><b>Para qué sirve:</b> controlar el aceite a granel (tanques), el envasado y los envases.</p>
        <Lista items={[
          'Arriba: litros de aceite en granel, en botellas y total.',
          'Pestañas: Tanques, Stock envasado (por producto/presentación/ubicación, con alerta "bajo"), Envases vacíos y Movimientos.',
          'Envasar: descuenta litros del tanque, suma unidades al stock (en Almazara) y descuenta un envase vacío.',
          'Cargar cosecha, Trasegar/blend, Merma/muestra: para administrar el granel de los tanques.',
          'Ajuste envasado: corregir unidades a mano (carga inicial, roturas). Trasladar: mover unidades entre ubicaciones.',
        ]} />
        <Nota>Ubicaciones: Almazara, Maldonado, Montevideo, Posada. Gonzalo no ve Montevideo. Cada venta descuenta stock sola. Ayelén consulta sin modificar.</Nota>
      </Seccion>

      <Seccion icono="✅" titulo="Tareas">
        <p><b>Para qué sirve:</b> organizar el trabajo del equipo y del campo.</p>
        <Lista items={[
          'Mi agenda: tus tareas ordenadas por vencimiento (atrasadas, hoy, esta semana, después).',
          'Equipo (socios): ver las tareas de cada persona y un resumen mensual con jornales.',
          'Nueva tarea: título, asignados (varios), prioridad, área (Campo/General) y fecha límite.',
          'Estados: pendiente, en curso, hecha, cancelada. Podés dejar comentarios en cada tarea.',
          'Campo (Emiliano): "Registrar tarea realizada" para anotar trabajo hecho y sus jornales.',
        ]} />
        <Nota>La disponible para todos los roles. El borrador de una tarea nueva se guarda 24 h por si cerrás la app.</Nota>
      </Seccion>

      <Seccion icono="💰" titulo="Ingresos y Egresos (Finanzas)">
        <p><b>Para qué sirve:</b> cargar los gastos y los ingresos que no son ventas de aceite.</p>
        <p className="font-medium text-oliva-800 mt-2">Egresos (Gastos)</p>
        <Lista items={[
          'Tres tipos: Normal (gasto que paga la empresa), Reembolsable (lo pagaste de tu bolsillo y la empresa te lo debe), y Adelanto.',
          'Adelanto: efectivo que el socio se llevó de la caja/cobros. Se descuenta de su sueldo y NO cuenta como gasto operativo.',
          'Categorías agrupadas (Olivos, Almazara, Ovinos, Inversiones, Operativo, etc.) y "Cuenta con la empresa" por socio.',
        ]} />
        <p className="font-medium text-oliva-800 mt-2">Ingresos</p>
        <Lista items={[
          'Ingresos que no son venta de aceite: eventos, alquileres, aportes de capital, ventas ovinas, etc.',
        ]} />
        <Nota>Gonzalo ve solo lo suyo. Ayelén consulta.</Nota>
      </Seccion>

      <Seccion icono="📊" titulo="Contabilidad" soloAdmin>
        <p><b>Para qué sirve:</b> el estado financiero y las obligaciones. Solo administradores.</p>
        <Lista items={[
          'Estado de resultados (mensual): ingresos, egresos (sin adelantos), margen y desglose por categoría.',
          'Conciliación bancaria: pegás el extracto del BROU y la app lo interpreta y lo cruza con gastos/ventas.',
          'Mail / Obligaciones: sincroniza correos de DGI, BPS, BSE y proveedores (solo lectura), detecta montos y vencimientos, y te deja marcarlos pagados/pendientes y cargarlos como gasto.',
        ]} />
      </Seccion>

      <Seccion icono="⚙️" titulo="Administración" soloAdmin>
        <p><b>Para qué sirve:</b> configurar productos y precios. Solo administradores.</p>
        <Lista items={[
          'Productos y presentaciones con precio consumidor y mayorista (en pesos o dólares, con cotización del BCU).',
          'IVA por presentación (0 / 10 / 22 %) y costo de envasado.',
          '"Costo aceite USD/L" global, usado para calcular los márgenes reales.',
          'Listas de precios y backup a Excel (Rodrigo y Santiago).',
        ]} />
      </Seccion>

      <div className="text-[11px] text-oliva-500 text-center pt-2">
        ¿Dudas o algo no funciona? Hablá con Rodrigo.
      </div>
    </div>
  )
}

function RolCard({ titulo, rol, items, activo }: { titulo: string; rol: string; items: string[]; activo: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${activo ? 'border-aceite-500/60 bg-aceite-500/5' : 'border-oliva-100 bg-white'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-oliva-900">{titulo}</div>
        {activo && <span className="text-[9px] uppercase tracking-wide rounded-full bg-aceite-500 text-white px-1.5 py-0.5 font-bold">vos</span>}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-oliva-500">{rol}</div>
      <ul className="mt-1.5 space-y-0.5">
        {items.map((t, i) => (
          <li key={i} className="text-xs text-oliva-700 flex gap-1.5"><span className="text-oliva-400">·</span><span>{t}</span></li>
        ))}
      </ul>
    </div>
  )
}

function Seccion({ icono, titulo, children, soloAdmin }: { icono: string; titulo: string; children: ReactNode; soloAdmin?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div className="card p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-oliva-50 transition"
      >
        <span className="text-lg shrink-0">{icono}</span>
        <span className="flex-1 font-semibold text-oliva-900">{titulo}</span>
        {soloAdmin && <span className="text-[9px] uppercase tracking-wide rounded-full bg-oliva-100 text-oliva-600 px-1.5 py-0.5 font-semibold">admin</span>}
        <span className={`text-oliva-400 transition-transform ${abierto ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {abierto && (
        <div className="px-4 pb-4 pt-1 text-sm text-oliva-700 space-y-2 border-t border-oliva-100">
          {children}
        </div>
      )}
    </div>
  )
}

function Lista({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2"><span className="text-oliva-400 shrink-0">•</span><span>{t}</span></li>
      ))}
    </ul>
  )
}

function Nota({ children }: { children: ReactNode }) {
  return (
    <div className="text-[12px] text-oliva-600 bg-oliva-50 border border-oliva-100 rounded-lg p-2 mt-1">
      {children}
    </div>
  )
}
