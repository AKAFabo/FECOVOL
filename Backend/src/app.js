const express = require('express');
const cors = require('cors');

const currentUser = require('./middleware/currentUser');
const { resolveScope } = require('./middleware/scopeOrganization');
const errorHandler = require('./middleware/errorHandler');

const associationsRoutes = require('./routes/associations.routes');
const teamsRoutes = require('./routes/teams.routes');
const personsRoutes = require('./routes/persons.routes');
const documentsRoutes = require('./routes/documents.routes');
const refereeAssignmentsRoutes = require('./routes/refereeAssignments.routes');
const catalogsRoutes = require('./routes/catalogs.routes');
const usersRoutes = require('./routes/users.routes');
const rolesRoutes = require('./routes/roles.routes');
const parametersRoutes = require('./routes/parameters.routes');
const auditRoutes = require('./routes/audit.routes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(resolveScope);
app.use(currentUser);

app.get('/', (req, res) => {
  res.json({
    message: 'API del Sistema de Informacion FECOVOL',
    modulo: 'Asociaciones y Arbitraje',
    endpoints: [
      '/api/associations',
      '/api/teams',
      '/api/persons',
      '/api/documents',
      '/api/referee-assignments',
      '/api/catalogs',
      '/api/users',
      '/api/roles',
      '/api/parameters',
      '/api/audit'
    ]
  });
});

app.use('/api/associations', associationsRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/persons', personsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/referee-assignments', refereeAssignmentsRoutes);
app.use('/api/catalogs', catalogsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/parameters', parametersRoutes);
app.use('/api/audit', auditRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use(errorHandler);

module.exports = app;
