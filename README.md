# Proyecto Full Stack (JS + React)

Estructura base para un proyecto full stack con backend en Node/Express y frontend en React (Vite).

## Estructura

```
proyecto-fullstack/
├── Backend/
│   ├── src/
│   │   ├── routes/
│   │   │   └── example.routes.js
│   │   └── server.js
│   ├── .env.example
│   └── package.json
└── Frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── App.css
    │   ├── main.jsx
    │   └── index.css
    ├── index.html
    ├── vite.config.js
    └── package.json
```

## Cómo correr el Backend

```bash
cd Backend
npm install
cp .env.example .env
npm run dev
```

El servidor quedará en `http://localhost:4000`.

## Cómo correr el Frontend

```bash
cd Frontend
npm install
npm run dev
```

El frontend quedará en `http://localhost:5173` y ya está configurado para consumir la API del backend.

## Notas

- El backend usa Express con CORS habilitado y una ruta de ejemplo en `/api/example`.
- El frontend usa Vite + React y hace un fetch de prueba a la raíz del backend (`/`) para verificar la conexión.
- Ajusta la variable `API_URL` en `Frontend/src/App.jsx` si cambias el puerto del backend.
