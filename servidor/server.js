// Servidor principal: APIs públicas, autenticación y sesiones persistentes.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const MySQLStoreFactory = require('express-mysql-session');
const passport = require('./config/passport');
const db = require('./config/database');
const apiRoutes = require('./rutas/api.routes');
const authRoutes = require('./apis/auth.api');

const app = express();
const PORT = process.env.PORT || 4000;
const production = process.env.NODE_ENV === 'production';
if (production && !process.env.SESSION_SECRET) {
  throw new Error('En producción debes configurar SESSION_SECRET con una clave larga y aleatoria.');
}
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((value) => value.trim());

app.set('trust proxy', 1);
app.use(cors({ origin(origin, callback) {
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Origen no permitido por CORS.'));
}, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Las sesiones se guardan en MySQL; no desaparecen al reiniciar Node.
const MySQLStore = MySQLStoreFactory(session);
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'devradar',
  clearExpired: false
});
app.use(session({
  name: 'devradar.sid',
  secret: process.env.SESSION_SECRET || 'cambia-esta-clave-en-tu-entorno-local',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: production, sameSite: production ? 'none' : 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(passport.initialize());
app.use(passport.session());

app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
app.get('/', (_req, res) => res.json({ name: 'DevRadar API', status: 'online', docs: '/api/health' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ success: false, error: err.message || 'Ocurrió un error inesperado en el servidor.' });
});

// Verifica la conexión a MySQL antes de aceptar tráfico.
db.query('SELECT 1').then(() => {
  app.listen(PORT, () => console.log(`DevRadar backend disponible en el puerto ${PORT}`));
}).catch((error) => {
  console.error('No se pudo conectar a MySQL. Revisa el archivo .env y ejecuta servidor/sql/devradar.sql', error.message);
  process.exit(1);
});
