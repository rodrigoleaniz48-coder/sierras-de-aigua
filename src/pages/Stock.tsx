import { PlaceholderPagina } from '../components/PlaceholderPagina'

export function Stock() {
  return (
    <PlaceholderPagina
      titulo="Stock"
      descripcion="Lotes/partidas, envasado por presentación, movimientos y alertas de stock mínimo."
      proximo={[
        'Alta de lote/partida (variedad, campaña, litros producidos).',
        'Envasado: convertir litros a unidades por presentación.',
        'Vista de stock actual por producto + presentación.',
        'Historial de movimientos y trazabilidad hacia atrás.',
      ]}
    />
  )
}
