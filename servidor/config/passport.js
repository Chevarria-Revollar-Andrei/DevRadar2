
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const db = require('./database');

// Guarda el ID del usuario en la sesion.
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Recupera los datos del usuario al iniciar una sesion.
passport.deserializeUser(async (id, done) => {
    try {
        const [rows] = await db.execute(
            `SELECT id, name, email, avatar, provider
             FROM users
             WHERE id = ?
             LIMIT 1`,
            [id]
        );

        done(null, rows[0] || false);
    } catch (error) {
        done(error);
    }
});

// Configuracion del inicio de sesion con GitHub.
if (
    process.env.GITHUB_CLIENT_ID &&
    process.env.GITHUB_CLIENT_SECRET
) {
    passport.use(
        new GitHubStrategy(
            {
                clientID: process.env.GITHUB_CLIENT_ID,
                clientSecret: process.env.GITHUB_CLIENT_SECRET,
                callbackURL:
                    process.env.GITHUB_CALLBACK_URL ||
                    'http://localhost:4000/api/auth/github/callback',
                scope: ['user:email'],
                state: true
            },
            async (accessToken, refreshToken, profile, done) => {
                try {
                    const githubId = String(profile.id);
                    const email =
                        profile.emails?.find((item) => item.primary && item.verified)?.value ||
                        profile.emails?.find((item) => item.verified)?.value || null;
                    const name =
                        profile.displayName ||
                        profile.username ||
                        'Usuario GitHub';
                    const avatar =
                        profile.photos?.[0]?.value || null;

                    const [found] = await db.execute(
                        'SELECT * FROM users WHERE github_id = ? LIMIT 1',
                        [githubId]
                    );

                    let user;

                    if (found.length > 0) {
                        user = found[0];

                        await db.execute(
                            `UPDATE users
                             SET name = ?, email = ?, avatar = ?
                             WHERE id = ?`,
                            [name, email, avatar, user.id]
                        );
                    } else {
                        // No vinculamos automáticamente una cuenta local por coincidencia de correo.
                        // Si el correo ya pertenece a otra cuenta, guardamos NULL para evitar apropiación de cuentas.
                        let safeEmail = email;
                        if (safeEmail) {
                            const [emailOwner] = await db.execute(
                                'SELECT id FROM users WHERE email = ? LIMIT 1',
                                [safeEmail]
                            );
                            if (emailOwner.length) safeEmail = null;
                        }
                        const [result] = await db.execute(
                            `INSERT INTO users
                             (name, email, github_id, avatar, provider)
                             VALUES (?, ?, ?, ?, 'github')`,
                            [name, safeEmail, githubId, avatar]
                        );

                        user = {
                            id: result.insertId,
                            name,
                            email: safeEmail,
                            avatar,
                            provider: 'github'
                        };
                    }

                    done(null, user);
                } catch (error) {
                    done(error);
                }
            }
        )
    );
}

module.exports = passport;
