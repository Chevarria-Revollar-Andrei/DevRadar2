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

// Obtiene el correo verificado desde GitHub o genera uno de respaldo no nulo.
async function resolveGitHubEmail(accessToken, profile, githubId) {
    const fallbackEmail = `${githubId}+${profile.username || 'github'}@users.noreply.github.com`.toLowerCase();

    try {
        const response = await fetch('https://api.github.com/user/emails', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'DevRadar-App'
            }
        });

        if (response.ok) {
            const emails = await response.json();
            if (Array.isArray(emails)) {
                const chosen =
                    emails.find((item) => item.primary && item.verified)?.email ||
                    emails.find((item) => item.verified)?.email ||
                    emails[0]?.email;
                if (chosen) return chosen.trim().toLowerCase();
            }
        }
    } catch {
        // Si falla la consulta adicional, usamos el perfil o el respaldo.
    }

    const profileEmail = profile.emails?.[0]?.value;
    return profileEmail ? profileEmail.trim().toLowerCase() : fallbackEmail;
}

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
                    const fallbackEmail = `${githubId}+${profile.username || 'github'}@users.noreply.github.com`.toLowerCase();
                    const email = await resolveGitHubEmail(accessToken, profile, githubId);
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
                        let safeEmail = email || user.email || fallbackEmail;

                        const [emailOwner] = await db.execute(
                            'SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1',
                            [safeEmail, user.id]
                        );
                        if (emailOwner.length) safeEmail = user.email || fallbackEmail;

                        await db.execute(
                            `UPDATE users
                             SET name = ?, email = ?, avatar = ?
                             WHERE id = ?`,
                            [name, safeEmail, avatar, user.id]
                        );

                        user = { ...user, name, email: safeEmail, avatar };
                    } else {
                        // Evita colision con cuentas locales existentes sin enviar NULL a MySQL.
                        let safeEmail = email || fallbackEmail;
                        const [emailOwner] = await db.execute(
                            'SELECT id FROM users WHERE email = ? LIMIT 1',
                            [safeEmail]
                        );
                        if (emailOwner.length) safeEmail = fallbackEmail;

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
