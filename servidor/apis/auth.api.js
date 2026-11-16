const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const passport = require('../config/passport');

const router = express.Router();
const requireAuth = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ success: false, error: 'Debes iniciar sesión para realizar esta acción.' });
};

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  avatar: user.avatar,
  provider: user.provider
});

router.get('/me', (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ success: false, error: 'No has iniciado sesión.' });
  }
  return res.json({ success: true, user: publicUser(req.user) });
});

router.post('/register', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 120);
    const email = String(req.body.email || '').trim().toLowerCase().slice(0, 180);
    const password = String(req.body.password || '');
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      return res.status(400).json({ success: false, error: 'Ingresa un nombre, correo válido y una contraseña de al menos 8 caracteres.' });
    }
    const [existing] = await db.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existing.length) return res.status(409).json({ success: false, error: 'Ya existe una cuenta con ese correo.' });

    const hash = await bcrypt.hash(password, 12);
    const [result] = await db.execute(
      `INSERT INTO users (name, email, password, provider) VALUES (?, ?, ?, 'local')`,
      [name, email, hash]
    );
    const user = { id: result.insertId, name, email, avatar: null, provider: 'local' };
    req.login(user, (error) => {
      if (error) return next(error);
      return res.status(201).json({ success: true, user });
    });
  } catch (error) { next(error); }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ success: false, error: 'Completa el correo y la contraseña.' });

    const [rows] = await db.execute(
      'SELECT id, name, email, password, avatar, provider FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    const user = rows[0];
    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, error: 'Correo o contraseña incorrectos.' });
    }
    const safeUser = publicUser(user);
    req.login(safeUser, (error) => {
      if (error) return next(error);
      return res.json({ success: true, user: safeUser });
    });
  } catch (error) { next(error); }
});

router.get('/github', (req, res, next) => {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    return res.status(503).json({ success: false, error: 'El acceso con GitHub todavía no está configurado en el servidor.' });
  }
  passport.authenticate('github', { scope: ['user:email'] })(req, res, next);
});

router.get('/github/callback',
  passport.authenticate('github', { failureRedirect: `${process.env.CLIENT_URL || 'http://localhost:5173'}/?auth=error` }),
  (req, res) => res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/?auth=success`)
);

router.post('/logout', (req, res, next) => {
  req.logout((error) => {
    if (error) return next(error);
    req.session.destroy((destroyError) => {
      if (destroyError) return next(destroyError);
      res.clearCookie('devradar.sid', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
      });
      return res.json({ success: true, message: 'Sesión cerrada correctamente.' });
    });
  });
});

router.get('/saved', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, item_type, title, description, url, image_url, content, created_at FROM saved_items WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    const data = rows.map((row) => {
      let stored = {};
      try { stored = row.content ? JSON.parse(row.content) : {}; } catch {}
      return { ...row, payload: stored.payload ?? null, external_id: stored.externalId ?? null };
    });
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

router.post('/saved', requireAuth, async (req, res, next) => {
  try {
    const type = req.body.type === 'note' ? 'research' : String(req.body.type || '');
    const allowed = ['repository', 'news', 'question', 'wikipedia', 'research'];
    const externalId = String(req.body.externalId || '').slice(0, 255);
    const title = String(req.body.title || '').trim().slice(0, 255);
    const url = req.body.url ? String(req.body.url).slice(0, 1000) : null;
    const description = req.body.description ? String(req.body.description).slice(0, 5000) : null;
    if (!allowed.includes(type) || !externalId || !title) {
      return res.status(400).json({ success: false, error: 'Los datos del elemento guardado no son válidos.' });
    }
    const content = JSON.stringify({ externalId, payload: req.body.payload ?? null });
    const [existing] = await db.execute(
      `SELECT id FROM saved_items WHERE user_id = ? AND item_type = ? AND JSON_UNQUOTE(JSON_EXTRACT(content, '$.externalId')) = ? LIMIT 1`,
      [req.user.id, type, externalId]
    );
    if (existing.length) {
      await db.execute(
        'UPDATE saved_items SET title = ?, description = ?, url = ?, content = ? WHERE id = ? AND user_id = ?',
        [title, description, url, content, existing[0].id, req.user.id]
      );
      return res.json({ success: true, message: 'Elemento actualizado.' });
    }
    await db.execute(
      'INSERT INTO saved_items (user_id, item_type, title, description, url, content) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, type, title, description, url, content]
    );
    res.status(201).json({ success: true, message: 'Elemento guardado.' });
  } catch (error) { next(error); }
});

router.delete('/saved/:type/:id', requireAuth, async (req, res, next) => {
  try {
    const type = req.params.type === 'note' ? 'research' : req.params.type;
    const allowed = ['repository', 'news', 'question', 'wikipedia', 'research'];
    if (!allowed.includes(type)) return res.status(400).json({ success: false, error: 'Tipo de elemento no válido.' });
    const [result] = await db.execute(
      `DELETE FROM saved_items WHERE user_id = ? AND item_type = ? AND JSON_UNQUOTE(JSON_EXTRACT(content, '$.externalId')) = ?`,
      [req.user.id, type, String(req.params.id).slice(0, 255)]
    );
    res.json({ success: true, deleted: result.affectedRows });
  } catch (error) { next(error); }
});

router.get('/history', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, search_term, search_date FROM search_history WHERE user_id = ? ORDER BY search_date DESC LIMIT 30',
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

router.post('/history', requireAuth, async (req, res, next) => {
  try {
    const term = String(req.body.query || '').trim().slice(0, 255);
    if (!term) return res.status(400).json({ success: false, error: 'Escribe un término de búsqueda.' });
    await db.execute('INSERT INTO search_history (user_id, search_term) VALUES (?, ?)', [req.user.id, term]);
    await db.execute(
      `DELETE FROM search_history WHERE user_id = ? AND id NOT IN
       (SELECT id FROM (SELECT id FROM search_history WHERE user_id = ? ORDER BY search_date DESC, id DESC LIMIT 30) recent)`,
      [req.user.id, req.user.id]
    );
    res.status(201).json({ success: true, message: 'Búsqueda registrada.' });
  } catch (error) { next(error); }
});

module.exports = router;
