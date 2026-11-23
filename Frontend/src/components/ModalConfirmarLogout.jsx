import '../pages/admin/AdminCommon.css';

/**
 * Modal de confirmación para el cierre de sesión unificado en todos los roles (RF-SEG-002).
 * Muestra la advertencia normalizada de posibles cambios sin guardar.
 */
export default function ModalConfirmarLogout({
  abierto,
  cerrando = false,
  onConfirmar,
  onCancelar
}) {
  if (!abierto) return null;

  return (
    <div
      className="admin-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-logout-titulo"
      onClick={() => !cerrando && onCancelar()}
    >
      <div
        className="admin-modal"
        style={{ maxWidth: '440px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-modal__header">
          <h2 id="modal-logout-titulo" className="admin-modal__title">Confirmar cierre de sesión</h2>
          <button
            type="button"
            className="admin-modal__close"
            onClick={() => !cerrando && onCancelar()}
            disabled={cerrando}
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        <div className="admin-modal__body">
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: '#fef3c7',
              color: '#b45309',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: '1.3rem'
            }}>
              ⚠️
            </div>
            <div>
              <p style={{ margin: '0 0 6px 0', fontWeight: 700, color: 'var(--texto)', fontSize: '0.98rem' }}>
                ¿Está seguro de que desea salir?
              </p>
              <p style={{ margin: 0, color: 'var(--texto-mudo)', fontSize: '0.88rem', lineHeight: '1.45' }}>
                Podría perder cambios sin guardar.
              </p>
            </div>
          </div>
        </div>

        <div className="admin-modal__footer">
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            onClick={onCancelar}
            disabled={cerrando}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--danger"
            onClick={onConfirmar}
            disabled={cerrando}
          >
            {cerrando ? 'Cerrando sesión…' : 'Sí, cerrar sesión'}
          </button>
        </div>
      </div>
    </div>
  );
}
