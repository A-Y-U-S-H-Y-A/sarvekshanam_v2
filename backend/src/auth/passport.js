'use strict';

const passport             = require('passport');
const LocalStrategy        = require('passport-local').Strategy;
const JwtStrategy          = require('passport-jwt').Strategy;
const ExtractJwt           = require('passport-jwt').ExtractJwt;
const bcrypt               = require('bcryptjs');
const crypto               = require('crypto');
const config               = require('../config');
const { getDb }            = require('../db/database');

// ── Local Strategy (username + password) ────────────────────────────────────
passport.use(
  'local',
  new LocalStrategy(
    { usernameField: 'username', passwordField: 'password' },
    async (username, password, done) => {
      try {
        const { User } = getDb();
        const user = await User.findOne({ where: { username } });

        if (!user) {
          return done(null, false, { message: 'Invalid username or password' });
        }

        const match = bcrypt.compareSync(password, user.password_hash);
        if (!match) {
          return done(null, false, { message: 'Invalid username or password' });
        }

        return done(null, { id: user.id, username: user.username, role: user.role });
      } catch (err) {
        return done(err);
      }
    }
  )
);

// ── JWT Strategy (Bearer token) ──────────────────────────────────────────────
passport.use(
  'jwt',
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey:    config.jwtSecret,
    },
    async (payload, done) => {
      try {
        const { User } = getDb();
        const user = await User.findByPk(payload.id, { attributes: ['id', 'username', 'role'] });

        if (!user) return done(null, false);
        return done(null, { id: user.id, username: user.username, role: user.role });
      } catch (err) {
        return done(err);
      }
    }
  )
);

// ── OIDC Strategy (Enterprise SSO) ──────────────────────────────────────────
if (config.oidcEnabled && config.oidcIssuer) {
  const OIDCStrategy = require('passport-openidconnect').Strategy;

  passport.use(
    'oidc',
    new OIDCStrategy(
      {
        issuer:             config.oidcIssuer,
        authorizationURL:   `${config.oidcIssuer}/authorize`,
        tokenURL:           `${config.oidcIssuer}/oauth/token`,
        userInfoURL:        `${config.oidcIssuer}/userinfo`,
        clientID:           config.oidcClientId,
        clientSecret:       config.oidcClientSecret,
        callbackURL:        config.oidcRedirectUri,
        scope:              config.oidcScopes,
      },
      async (issuer, profile, done) => {
        try {
          // Auto-provision local user on first OIDC login
          const { User } = getDb();
          const oidcId   = profile.id || profile.sub;
          const email    = profile.emails?.[0]?.value || '';
          const displayName = profile.displayName || email || oidcId;

          // Try to find by username = oidc:<issuer>:<id>
          const username = `oidc:${oidcId}`;
          let user = await User.findOne({ where: { username } });

          if (!user) {
            // Auto-create on first login
            const id = crypto.randomUUID();
            // Use a random password hash (not usable for local login)
            const password_hash = bcrypt.hashSync(crypto.randomUUID(), 4);
            user = await User.create({
              id,
              username,
              password_hash,
              role: 'viewer',
            });
            console.log(`[OIDC] Auto-provisioned user: ${username} (${displayName})`);
          }

          return done(null, { id: user.id, username: user.username, role: user.role, displayName });
        } catch (err) {
          return done(err);
        }
      }
    )
  );
  console.log(`[Passport] OIDC strategy registered (issuer: ${config.oidcIssuer})`);
}

module.exports = passport;
