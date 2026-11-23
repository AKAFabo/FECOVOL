const express = require('express');
const cors = require('cors');

const { authenticate } = require('./middleware/authenticate');
const currentUser = require('./middleware/currentUser');
const { resolveScope } = require('./middleware/scopeOrganization');
const errorHandler = require('./middleware/errorHandler');

const associationsRoutes = require('./routes/associations.routes');
const teamsRoutes = require('./routes/teams.routes');
const personsRoutes = require('./routes/persons.routes');
const documentsRoutes = require('./routes/documents.routes');
const refereeAssignmentsRoutes = require('./routes/refereeAssignments.routes');
const refereesRoutes = require('./routes/referees.routes');
const refereeSelfRoutes = require('./routes/referees.me.routes');
const participacionRoutes = require('./routes/participacion.routes');
const reportesAsociacionRoutes = require('./routes/reportesAsociacion.routes');
const catalogsRoutes = require('./routes/catalogs.routes');
const competitionsRoutes = require('./routes/competitions.routes');
const matchesRoutes = require('./routes/matches.routes');
const inscriptionsRoutes = require('./routes/inscriptions.routes');
const reportsRoutes = require('./routes/reports.routes');
const usersRoutes = require('./routes/users.routes');
const rolesRoutes = require('./routes/roles.routes');
const parametersRoutes = require('./routes/parameters.routes');
const auditRoutes = require('./routes/audit.routes');
const newsRoutes = require('./routes/news.routes');
const incidentsRoutes = require('./routes/incidents.routes');
const publicRoutes = require('./routes/public.routes');
const nationalTeamsRoutes = require('./routes/nationalTeams.routes');

const app = express();

app.use(cors());
// El cuerpo de una noticia puede traer imagenes incrustadas por el editor.
app.use('/api/news', express.json({ limit: '25mb' }));
app.use(express.json());

// Portal público: solo lectura y sin sesión (ver routes/public.routes.js). Va antes de
// resolveScope y currentUser porque no usa el ámbito del usuario: así no se consulta la base
// para resolver un usuario que el portal no necesita.
app.use('/api/public', publicRoutes);

// Identidad (token de Supabase) -> ámbito organizacional -> usuario para la bitácora.
app.use(authenticate);
app.use(resolveScope);
app.use(currentUser);

app.get('/', (req, res) => {
  res.json({
    message: 'API del Sistema de Informacion FECOVOL',
    modulo: 'Competencias y Resultados',
    endpoints: [
      '/api/associations',
      '/api/teams',
      '/api/persons',
      '/api/documents',
      '/api/referee-assignments',
      '/api/referees',
      '/api/participacion',
      '/api/reportes-asociacion',
      '/api/catalogs',
      '/api/competitions',
      '/api/matches',
      '/api/inscriptions',
      '/api/reports',
      '/api/users',
      '/api/roles',
      '/api/parameters',
      '/api/audit',
      '/api/national-teams',
      '/api/news',
      '/api/incidents',
      '/api/public'
    ]
  });
});

app.use('/api/associations', associationsRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/persons', personsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/referee-assignments', refereeAssignmentsRoutes);
// El entorno del propio árbitro va antes que las rutas de FECOVOL del mismo prefijo.
app.use('/api/referees/me', refereeSelfRoutes);
app.use('/api/referees', refereesRoutes);
// Participación en competencias y reportes de la asociación (RF-ASO-007 y RF-ASO-008).
app.use('/api/participacion', participacionRoutes);
app.use('/api/reportes-asociacion', reportesAsociacionRoutes);
app.use('/api/catalogs', catalogsRoutes);
app.use('/api/competitions', competitionsRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/inscriptions', inscriptionsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/parameters', parametersRoutes);
app.use('/api/audit', auditRoutes);
// Selecciones nacionales (administración de FECOVOL).
app.use('/api/national-teams', nationalTeamsRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/incidents', incidentsRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use(errorHandler);

module.exports = app;
