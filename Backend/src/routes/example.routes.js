const express = require('express');
const router = express.Router();

// GET /api/example
router.get('/', (req, res) => {
  res.json({
    data: [
      { id: 1, nombre: 'Elemento 1' },
      { id: 2, nombre: 'Elemento 2' },
      { id: 3, nombre: 'Elemento 3' }
    ]
  });
});

// POST /api/example
router.post('/', (req, res) => {
  const nuevoElemento = req.body;
  res.status(201).json({
    message: 'Elemento creado correctamente',
    data: nuevoElemento
  });
});

module.exports = router;
