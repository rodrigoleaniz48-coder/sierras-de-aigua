import { PlaceholderPagina } from '../components/PlaceholderPagina'

export function Ventas() {
  return (
    <PlaceholderPagina
      titulo="Ventas"
      descripcion="Carga rápida de ventas desde celular; descuenta stock automáticamente al guardar."
      proximo={[
        'Formulario de venta: cliente, ítems (producto+presentación+cantidad), forma de pago.',
        'Precio automático según tipo de cliente (minorista/mayorista).',
        'Marca “con factura” para separar ventas con IVA.',
        'Listado, filtros por período/socio/cliente, exportación CSV.',
      ]}
    />
  )
}
