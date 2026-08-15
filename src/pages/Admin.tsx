import { PlaceholderPagina } from '../components/PlaceholderPagina'

export function Admin() {
  return (
    <PlaceholderPagina
      titulo="Administración"
      descripcion="Gestión de usuarios/socios, productos, presentaciones y precios."
      proximo={[
        'Alta/baja de socios y cambio de rol.',
        'Editor de productos y presentaciones.',
        'Precios minorista/mayorista por presentación.',
        'Crear nueva “edición” anual del Premiado.',
      ]}
    />
  )
}
