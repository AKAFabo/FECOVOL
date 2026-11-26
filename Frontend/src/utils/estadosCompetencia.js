// Texto y color de los estados que muestran las pantallas de Competencias. Las clases de color
// (badge-status--*) están en pages/admin/AdminCommon.css.
//   activa = verde · info = azul · aviso = naranja · error = rojo · inactivo = gris

const COMPETENCIA = {
  PLANIFICACION: ['Planificación', 'inactivo'],
  INSCRIPCIONES: ['Inscripciones abiertas', 'aviso'],
  EN_CURSO: ['En curso', 'activa'],
  FINALIZADA: ['Finalizada', 'info'],
  CERRADA: ['Cerrada', 'suspendida']
};

const INSCRIPCION = {
  PENDIENTE: ['Pendiente', 'aviso'],
  POR_SUBSANAR: ['Por subsanar', 'aviso'],
  DEVUELTA: ['Devuelta', 'aviso'],
  INSCRITO: ['Inscrito', 'activa'],
  RETIRADO: ['Retirado', 'error'],
  DESCALIFICADO: ['Descalificado', 'error']
};

const PARTIDO = {
  PROGRAMADO: ['Programado', 'info'],
  REPROGRAMADO: ['Reprogramado', 'aviso'],
  EN_CURSO: ['En curso', 'info'],
  FINALIZADO: ['Finalizado', 'activa'],
  SUSPENDIDO: ['Suspendido', 'error'],
  CANCELADO: ['Cancelado', 'error']
};

const ACTA = {
  BORRADOR: ['Borrador', 'inactivo'],
  ENVIADA: ['Enviada', 'aviso'],
  VALIDADA: ['Validada', 'activa']
};

const de = (tabla) => (estado) => {
  const [texto, tono] = tabla[estado] || [String(estado || '—').replace(/_/g, ' ').toLowerCase(), 'inactivo'];
  return { texto, clase: `badge-status badge-status--${tono}` };
};

export const estadoCompetencia = de(COMPETENCIA);
export const estadoInscripcion = de(INSCRIPCION);
export const estadoPartido = de(PARTIDO);
export const estadoActa = de(ACTA);
