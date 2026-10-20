import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import '../AdminCommon.css';
import './RedactarNoticia.css';
import EditorTexto from './EditorTexto.jsx';
import RecorteImagen from './RecorteImagen.jsx';
import { obtenerNoticia } from './noticiasDatos.js';

const NOTICIA_VACIA = {
  titulo: '',
  bajada: '',
  cuerpo: '',
  estado: 'BORRADOR',
  categoria: '',
  fechaPublicacion: '',
  competencia: '',
  etiquetas: [],
  destacada: false,
  textoAlternativo: ''
};

const ESTADOS = [
  { valor: 'BORRADOR', texto: 'Borrador', clase: 'badge-status--borrador' },
  { valor: 'PROGRAMADA', texto: 'Programada', clase: 'badge-status--programada' },
  { valor: 'PUBLICADA', texto: 'Publicada', clase: 'badge-status--activa' }
];
const CATEGORIAS = ['Liga Superior', 'Selecciones', 'Competencias', 'Arbitraje', 'Voleibol de playa'];
const COMPETENCIAS = ['Liga Superior Femenina 2026', 'Liga Superior Masculina 2026', 'Campeonato Nacional U-19'];

// Misma proporción que el bloque grande de noticias de la portada (Inicio.css).
const ASPECTO_IMAGEN = 744 / 330;
const TAMANO_MAX_MB = 10;

const formatearFecha = (valor) =>
  valor
    ? new Date(valor).toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Sin fecha de publicación';

// Toma de la noticia guardada solo los campos que maneja el formulario.
const aFormulario = (guardada) =>
  Object.fromEntries(Object.keys(NOTICIA_VACIA).map((campo) => [campo, guardada[campo] ?? NOTICIA_VACIA[campo]]));

// Sirve para redactar (/admin/noticias/redactar) y para editar (/admin/noticias/:id/editar).
export default function RedactarNoticia() {
  const { id } = useParams();
  const esEdicion = Boolean(id);
  const [cargando, setCargando] = useState(esEdicion);
  const [noEncontrada, setNoEncontrada] = useState(false);

  const [noticia, setNoticia] = useState(NOTICIA_VACIA);
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState('');

  // Imagen destacada: archivo original + recorte aplicado (blob listo para subir).
  const [imagen, setImagen] = useState(null); // { archivo, urlOriginal, blob, url, recorte } | null
  const [imagenPendiente, setImagenPendiente] = useState(null); // archivo recién elegido, aún sin recortar
  const [recortando, setRecortando] = useState(false);
  const [errorImagen, setErrorImagen] = useState('');
  const [arrastrando, setArrastrando] = useState(false);
  const inputImagenRef = useRef(null);

  // Libera las URLs temporales de la imagen al salir de la página.
  const imagenRef = useRef(imagen);
  imagenRef.current = imagen;
  useEffect(
    () => () => {
      if (imagenRef.current) {
        URL.revokeObjectURL(imagenRef.current.urlOriginal);
        URL.revokeObjectURL(imagenRef.current.url);
      }
    },
    []
  );

  // En modo edición, carga la noticia existente en el formulario.
  useEffect(() => {
    if (!esEdicion) return;
    let cancelado = false;
    setCargando(true);
    setNoEncontrada(false);
    setNoticia(NOTICIA_VACIA);
    setImagen(null);
    obtenerNoticia(id).then((guardada) => {
      if (cancelado) return;
      if (!guardada) {
        setNoEncontrada(true);
      } else {
        setNoticia(aFormulario(guardada));
        if (guardada.imagenUrl) {
          // Imagen ya subida: no hay archivo local, el recorte se hace sobre la URL guardada.
          setImagen({ archivo: null, urlOriginal: guardada.imagenUrl, blob: null, url: guardada.imagenUrl, recorte: null });
        }
      }
      setCargando(false);
    });
    return () => {
      cancelado = true;
    };
  }, [id, esEdicion]);

  const actualizar = (campo) => (e) => setNoticia((n) => ({ ...n, [campo]: e.target.value }));
  const estadoActual = ESTADOS.find((e) => e.valor === noticia.estado);

  // ── Etiquetas ──────────────────────────────────────────────
  function agregarEtiqueta() {
    const etiqueta = nuevaEtiqueta.trim().replace(/,$/, '');
    if (etiqueta && !noticia.etiquetas.some((t) => t.toLowerCase() === etiqueta.toLowerCase())) {
      setNoticia((n) => ({ ...n, etiquetas: [...n.etiquetas, etiqueta] }));
    }
    setNuevaEtiqueta('');
  }

  function quitarEtiqueta(etiqueta) {
    setNoticia((n) => ({ ...n, etiquetas: n.etiquetas.filter((t) => t !== etiqueta) }));
  }

  function teclaEtiqueta(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      agregarEtiqueta();
    } else if (e.key === 'Backspace' && !nuevaEtiqueta && noticia.etiquetas.length) {
      quitarEtiqueta(noticia.etiquetas[noticia.etiquetas.length - 1]);
    }
  }

  // ── Imagen destacada ───────────────────────────────────────
  function elegirArchivo(archivo) {
    if (!archivo) return;
    if (!archivo.type.startsWith('image/')) {
      setErrorImagen('El archivo seleccionado no es una imagen.');
      return;
    }
    if (archivo.size > TAMANO_MAX_MB * 1024 * 1024) {
      setErrorImagen(`La imagen supera el máximo de ${TAMANO_MAX_MB} MB.`);
      return;
    }
    setErrorImagen('');
    setImagenPendiente({ archivo, urlOriginal: URL.createObjectURL(archivo) });
    setRecortando(true);
  }

  function soltarArchivo(e) {
    e.preventDefault();
    setArrastrando(false);
    elegirArchivo(e.dataTransfer.files?.[0]);
  }

  function aplicarRecorte({ blob, url, recorte }) {
    if (imagenPendiente) {
      if (imagen) {
        URL.revokeObjectURL(imagen.urlOriginal);
        URL.revokeObjectURL(imagen.url);
      }
      setImagen({ ...imagenPendiente, blob, url, recorte });
      setImagenPendiente(null);
    } else {
      URL.revokeObjectURL(imagen.url);
      setImagen({ ...imagen, blob, url, recorte });
    }
    setRecortando(false);
  }

  function cancelarRecorte() {
    if (imagenPendiente) {
      URL.revokeObjectURL(imagenPendiente.urlOriginal);
      setImagenPendiente(null);
    }
    setRecortando(false);
  }

  function quitarImagen() {
    URL.revokeObjectURL(imagen.urlOriginal);
    URL.revokeObjectURL(imagen.url);
    setImagen(null);
  }

  const imagenEnRecorte = imagenPendiente ?? imagen;

  if (cargando || noEncontrada) {
    return (
      <div>
        <div className="admin-page-header">
          <div className="admin-page-header__title-group">
            <h1>Editar noticia</h1>
          </div>
        </div>
        <div className="admin-card redactar-card redactar-mensaje">
          {cargando ? (
            <p>Cargando noticia…</p>
          ) : (
            <>
              <p>No se encontró la noticia solicitada.</p>
              <Link to="/admin/noticias" className="admin-btn admin-btn--secondary">
                Volver a noticias
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="admin-page-header">
        <div className="admin-page-header__title-group">
          <h1>{esEdicion ? 'Editar noticia' : 'Redactar noticia'}</h1>
          <div className="redactar-estado">
            <span className={`badge-status ${estadoActual.clase}`}>{estadoActual.texto}</span>
          </div>
        </div>
        <div className="admin-page-header__actions">
          <button type="button" className="admin-btn admin-btn--secondary">Vista previa</button>
          {esEdicion ? (
            <button type="button" className="admin-btn admin-btn--primary">Guardar cambios</button>
          ) : (
            <>
              <button type="button" className="admin-btn admin-btn--secondary">Guardar borrador</button>
              <button type="button" className="admin-btn admin-btn--primary">Publicar</button>
            </>
          )}
        </div>
      </div>

      <div className="redactar-layout">
        {/* Columna principal */}
        <div className="redactar-columna">
          <section className="admin-card redactar-card">
            <div className="redactar-campo">
              <label className="redactar-campo__etiqueta" htmlFor="noticia-titulo">Título</label>
              <input
                id="noticia-titulo"
                type="text"
                className="redactar-campo__input redactar-campo__input--titulo"
                placeholder="Título de la noticia"
                value={noticia.titulo}
                onChange={actualizar('titulo')}
              />
            </div>

            <div className="redactar-campo">
              <label className="redactar-campo__etiqueta" htmlFor="noticia-bajada">Bajada</label>
              <textarea
                id="noticia-bajada"
                rows={2}
                className="redactar-campo__input redactar-campo__textarea"
                placeholder="Resumen breve que acompaña al título"
                value={noticia.bajada}
                onChange={actualizar('bajada')}
              />
            </div>

            <EditorTexto
              key={id ?? 'nueva'}
              valorInicial={noticia.cuerpo}
              onChange={(html) => setNoticia((n) => ({ ...n, cuerpo: html }))}
            />
          </section>

          <section className="admin-card">
            <div className="admin-card__header redactar-card__header">
              <h2 className="redactar-card__titulo">Imagen destacada</h2>
            </div>
            <div className="redactar-card__cuerpo">
              {imagen ? (
                <img src={imagen.url} alt={noticia.textoAlternativo} className="redactar-imagen redactar-imagen--cargada" />
              ) : (
                <div
                  className={`redactar-imagen redactar-imagen--vacia ${arrastrando ? 'redactar-imagen--arrastrando' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setArrastrando(true);
                  }}
                  onDragLeave={() => setArrastrando(false)}
                  onDrop={soltarArchivo}
                >
                  <p>Arrastre una imagen aquí</p>
                  <button type="button" className="admin-btn admin-btn--secondary" onClick={() => inputImagenRef.current.click()}>
                    Seleccionar imagen
                  </button>
                  <span className="redactar-imagen__ayuda">JPG, PNG o WebP · máximo {TAMANO_MAX_MB} MB</span>
                </div>
              )}

              {errorImagen && <p className="redactar-imagen__error">{errorImagen}</p>}

              <input
                ref={inputImagenRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  elegirArchivo(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />

              {imagen && (
                <div className="redactar-imagen__acciones">
                  <div className="admin-page-header__actions">
                    <button type="button" className="admin-btn admin-btn--secondary" onClick={() => inputImagenRef.current.click()}>
                      Reemplazar
                    </button>
                    <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setRecortando(true)}>
                      Editar recorte
                    </button>
                    <button type="button" className="admin-btn admin-btn--secondary" onClick={quitarImagen}>
                      Quitar
                    </button>
                  </div>
                </div>
              )}

              <div className="redactar-campo redactar-campo--alt">
                <label className="redactar-campo__etiqueta" htmlFor="noticia-alt">Texto alternativo</label>
                <input
                  id="noticia-alt"
                  type="text"
                  className="redactar-campo__input"
                  placeholder="Describa la imagen para lectores de pantalla"
                  value={noticia.textoAlternativo}
                  onChange={actualizar('textoAlternativo')}
                />
              </div>
            </div>
          </section>
        </div>

        {/* Columna lateral */}
        <aside className="redactar-columna">
          <section className="admin-card">
            <div className="admin-card__header redactar-card__header">
              <h2 className="redactar-card__titulo">Publicación</h2>
            </div>
            <div className="redactar-card__cuerpo">
              <div className="redactar-campo">
                <label className="redactar-campo__etiqueta" htmlFor="noticia-estado">Estado</label>
                <select id="noticia-estado" className="admin-select redactar-campo__select" value={noticia.estado} onChange={actualizar('estado')}>
                  {ESTADOS.map((e) => (
                    <option key={e.valor} value={e.valor}>{e.texto}</option>
                  ))}
                </select>
              </div>

              <div className="redactar-campo">
                <label className="redactar-campo__etiqueta" htmlFor="noticia-categoria">Categoría</label>
                <select id="noticia-categoria" className="admin-select redactar-campo__select" value={noticia.categoria} onChange={actualizar('categoria')}>
                  <option value="">Seleccionar categoría…</option>
                  {CATEGORIAS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="redactar-campo">
                <label className="redactar-campo__etiqueta" htmlFor="noticia-fecha">Fecha de publicación</label>
                <input
                  id="noticia-fecha"
                  type="datetime-local"
                  className="admin-input redactar-campo__select"
                  value={noticia.fechaPublicacion}
                  onChange={actualizar('fechaPublicacion')}
                />
              </div>

              <div className="redactar-campo">
                <label className="redactar-campo__etiqueta" htmlFor="noticia-competencia">Competencia relacionada</label>
                <select id="noticia-competencia" className="admin-select redactar-campo__select" value={noticia.competencia} onChange={actualizar('competencia')}>
                  <option value="">Ninguna</option>
                  {COMPETENCIAS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="redactar-campo">
                <label className="redactar-campo__etiqueta" htmlFor="noticia-etiquetas">Etiquetas</label>
                {noticia.etiquetas.length > 0 && (
                  <div className="redactar-etiquetas">
                    {noticia.etiquetas.map((t) => (
                      <span key={t} className="badge-status badge-status--borrador redactar-etiqueta">
                        {t}
                        <button type="button" aria-label={`Quitar etiqueta ${t}`} onClick={() => quitarEtiqueta(t)}>
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  id="noticia-etiquetas"
                  type="text"
                  className="admin-input redactar-campo__select"
                  placeholder="Escriba y presione Enter"
                  value={nuevaEtiqueta}
                  onChange={(e) => setNuevaEtiqueta(e.target.value)}
                  onKeyDown={teclaEtiqueta}
                  onBlur={agregarEtiqueta}
                />
              </div>

              <div className="redactar-destacar">
                <div>
                  <span className="redactar-destacar__titulo" id="destacar-titulo">Destacar en portada</span>
                  <span className="redactar-destacar__ayuda">Reemplaza el bloque grande de noticias</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={noticia.destacada}
                  aria-labelledby="destacar-titulo"
                  className={`interruptor ${noticia.destacada ? 'interruptor--activo' : ''}`}
                  onClick={() => setNoticia((n) => ({ ...n, destacada: !n.destacada }))}
                >
                  <span className="interruptor__perilla" />
                </button>
              </div>
            </div>
          </section>

          <section className="admin-card">
            <div className="admin-card__header redactar-card__header redactar-card__header--columna">
              <h2 className="redactar-card__titulo">Cómo se verá</h2>
              <p className="admin-side-card__subtitle">Portada del sitio público</p>
            </div>
            <div className="redactar-card__cuerpo">
              {imagen ? (
                <img src={imagen.url} alt="" className="redactar-imagen redactar-imagen--mini redactar-imagen--cargada" />
              ) : (
                <div className="redactar-imagen redactar-imagen--mini" aria-hidden="true" />
              )}
              <p className="antetitulo redactar-vista__categoria">{noticia.categoria || 'Sin categoría'}</p>
              <h3 className="redactar-vista__titulo">{noticia.titulo || 'Título de la noticia'}</h3>
              <time className="redactar-vista__fecha">{formatearFecha(noticia.fechaPublicacion)}</time>
            </div>
          </section>

          <div className="redactar-aviso">
            <p className="antetitulo">Al publicar</p>
            <p>
              La nota aparece en la portada pública y en la sección de noticias. La publicación, la edición y el retiro
              quedan en bitácora con el usuario y la hora.
            </p>
          </div>
        </aside>
      </div>

      {recortando && imagenEnRecorte && (
        <RecorteImagen
          src={imagenEnRecorte.urlOriginal}
          aspecto={ASPECTO_IMAGEN}
          recorteInicial={imagenPendiente ? null : imagen.recorte}
          onCancelar={cancelarRecorte}
          onAplicar={aplicarRecorte}
        />
      )}
    </div>
  );
}
