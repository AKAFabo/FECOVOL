const express = require('express');
const cors = require('cors');

const currentUser = require('./middleware/currentUser');
const errorHandler = require('./middleware/errorHandler');

const associationsRoutes = require('./routes/associations.routes');
const teamsRoutes = require('./routes/teams.routes');
const personsRoutes = require('./routes/persons.routes');
const documentsRoutes = require('./routes/documents.routes');
const refereeAssignmentsRoutes = require('./routes/refereeAssignments.routes');
const catalogsRoutes = require('./routes/catalogs.routes');
const competitionsRoutes = require('./routes/competitions.routes');
const matchesRoutes = require('./routes/matches.routes');
const publicRoutes = require('./routes/public.routes');

const app = express();

app.use(cors());
app.use(express.json());
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
      '/api/catalogs'
    ]
  });
});

// Portal público: solo lectura, sin sesión (ver routes/public.routes.js).
app.use('/api/public', publicRoutes);

app.use('/api/associations', associationsRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/persons', personsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/referee-assignments', refereeAssignmentsRoutes);
app.use('/api/catalogs', catalogsRoutes);
app.use('/api/competitions', competitionsRoutes);
app.use('/api/matches', matchesRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use(errorHandler);

module.exports = app;
