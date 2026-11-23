import { useMemo } from 'react';
import { evaluarPoliticaPassword } from '../utils/passwordPolicy.js';
import Icono from '../components/Icono.jsx';

export default function IndicadorPoliticaPassword({ password = '', mostrarSoloSiHayTexto = false }) {
  const { reglas, esValida } = useMemo(() => evaluarPoliticaPassword(password), [password]);

  if (mostrarSoloSiHayTexto && !password) {
    return null;
  }

  return (
    <div style={{
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '6px',
      padding: '10px 14px',
      margin: '8px 0 16px 0',
      fontSize: '0.8rem'
    }}>
      <div style={{
        fontWeight: 600,
        marginBottom: '6px',
        color: esValida ? '#16a34a' : '#475569',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <span>{esValida ? 'Política de contraseña cumplida' : 'Requisitos de seguridad de la contraseña:'}</span>
      </div>

      <ul style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '4px 12px'
      }}>
        {reglas.map((regla) => (
          <li
            key={regla.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: regla.cumplida ? '#16a34a' : '#64748b',
              fontWeight: regla.cumplida ? 600 : 400,
              transition: 'color 0.15s ease'
            }}
          >
            <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>
              {regla.cumplida ? <Icono nombre="check" tam={13} /> : '○'}
            </span>
            <span>{regla.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
