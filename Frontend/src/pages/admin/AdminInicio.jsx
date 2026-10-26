import { Link } from 'react-router-dom';
import './AdminCommon.css';

export default function AdminInicio() {
  return (
    <div>
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>Panel general de administración</h1>
          <p className="admin-page-header__subtitle">
            Acceso directo a las áreas de gestión y configuración institucional.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        {/* Card Usuarios */}
        <div className="admin-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '8px', color: 'var(--texto)' }}>Usuarios y permisos</h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--texto-mudo)', marginBottom: '20px' }}>
            Control de cuentas, asignación de roles, ámbito organizacional y estados de acceso.
          </p>
          <Link to="/admin/usuarios" className="admin-btn admin-btn--primary">
            Gestionar usuarios &rarr;
          </Link>
        </div>

        {/* Card Catálogos */}
        <div className="admin-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '8px', color: 'var(--texto)' }}>Listas de valores</h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--texto-mudo)', marginBottom: '20px' }}>
            Parametrización de categorías, ramas, modalidades y estados con consistencia histórica.
          </p>
          <Link to="/admin/listas-valores" className="admin-btn admin-btn--primary">
            Gestionar catálogos &rarr;
          </Link>
        </div>

        {/* Card Auditoría */}
        <div className="admin-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '8px', color: 'var(--texto)' }}>Auditoría y respaldos</h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--texto-mudo)', marginBottom: '20px' }}>
            Consulta de la bitácora de transacciones, verificación de integridad y copias de seguridad.
          </p>
          <Link to="/admin/auditoria" className="admin-btn admin-btn--primary">
            Ver bitácora &rarr;
          </Link>
        </div>

        {/* Card Noticias */}
        <div className="admin-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '8px', color: 'var(--texto)' }}>Noticias y comunicados</h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--texto-mudo)', marginBottom: '20px' }}>
            Gestión de contenidos informativos, publicación de comunicados y difusión de eventos.
          </p>
          <Link to="/admin/noticias" className="admin-btn admin-btn--primary">
            Gestionar noticias &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
