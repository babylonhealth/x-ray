const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const config = require('./lib/config');
const logger = require('./lib/logger');

const baseUrl = config.get('baseUrl');
const googleClientId = config.get('googleClientId');
const googleClientSecret = config.get('googleClientSecret');
const publicUrl = config.get('publicUrl');
const dbPath = config.get('dbPath');
const env = config.get('env');
const cookieSecret = config.get('cookieSecret');
const sessionMinutes = config.get('sessionMinutes');

const samlEntryPoint = config.get('samlEntryPoint');
const samlIssuer = config.get('samlIssuer');
const samlCallbackUrl = config.get('samlCallbackUrl');
const samlCert = config.get('samlCert');
const samlAuthContext = config.get('samlAuthContext');

/*  Express setup
============================================================================= */
const bodyParser = require('body-parser');
const favicon = require('serve-favicon');
const passport = require('passport');
const errorhandler = require('errorhandler');

const app = express();

// Default helmet protections, minus frameguard (becaue of sqlpad iframe embed), adding referrerPolicy
app.use(helmet.dnsPrefetchControl());
app.use(helmet.hidePoweredBy());
app.use(helmet.hsts({}));
app.use(helmet.ieNoOpen());
app.use(helmet.noSniff());
app.use(helmet.xssFilter());
app.use(helmet.referrerPolicy({ policy: 'same-origin' }));

app.set('env', env);

if (app.settings.env == 'development') {
  app.use(errorhandler());
}
app.use(favicon(path.join(__dirname, '/public/favicon.ico')));
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true
  })
);

app.use(
  session({
    store: new FileStore({
      path: path.join(dbPath, '/sessions')
    }),
    saveUninitialized: false,
    resave: true,
    rolling: true,
    cookie: { maxAge: 1000 * 60 * sessionMinutes },
    logFn: logger.info,
    secret: cookieSecret
  })
);

app.use(function(req, res, next) {
  var log = logger.child({ id: req.id }, true);
  log.info({ req: req });
  next();
});

app.use(function(req, res, next) {
  function afterResponse() {
    res.removeListener('finish', afterResponse);
    res.removeListener('close', afterResponse);

    var log = logger.child({ id: req.id }, true);
    log.info({ res: res }, 'response');
  }
  res.on('finish', afterResponse);
  res.on('close', afterResponse);
  next();
});

app.use(passport.initialize());
app.use(passport.session());
app.use(baseUrl, express.static(path.join(__dirname, 'public')));

/*  Passport setup
============================================================================= */
require('./middleware/passport.js');

/*  Routes
============================================================================= */
const routers = [
  require('./routes/drivers.js'),
  require('./routes/users.js'),
  require('./routes/forgot-password.js'),
  require('./routes/password-reset.js'),
  require('./routes/connections.js'),
  require('./routes/test-connection.js'),
  require('./routes/queries.js'),
  require('./routes/query-result.js'),
  require('./routes/download-results.js'), // streams result download to browser
  require('./routes/schema-info.js'),
  require('./routes/tags.js'),
  require('./routes/format-sql.js'),
  require('./routes/signup-signin-signout.js')
];

if (googleClientId && googleClientSecret && publicUrl) {
  logger.debug('Enabling Google authentication Strategy.');
  routers.push(require('./routes/oauth.js'));
}

if (
  samlEntryPoint &&
  samlIssuer &&
  samlCallbackUrl &&
  samlCert &&
  samlAuthContext
) {
  logger.debug('Enabling SAML authentication Strategy.');
  routers.push(require('./routes/saml.js'));
}

// Add all core routes to the baseUrl except for the */api/app route
routers.forEach(function(router) {
  app.use(baseUrl, router);
});

// Add '*/api/app' route last and without baseUrl
app.use(require('./routes/app.js'));

// For any missing api route, return a 404
// NOTE - this cannot be a general catch-all because it might be a valid non-api route from a front-end perspective
app.use(baseUrl + '/api/', function(req, res) {
  logger.warn('reached catch all api route');
  res.sendStatus(404);
});

// Anything else should render the client-side app
// Client-side routing will take care of things from here
// Because index.html will be served via static plugin,
// we need to rename it to something else and switch out the URLs to consider the baseUrl
const indexPath = path.join(__dirname, 'public/index.html');
const indexTemplatePath = path.join(__dirname, 'public/index-template.html');

if (fs.existsSync(indexPath)) {
  fs.renameSync(indexPath, indexTemplatePath);
}

if (fs.existsSync(indexTemplatePath)) {
  const html = fs.readFileSync(indexTemplatePath, 'utf8');
  const baseUrlHtml = html
    .replace(/="\/stylesheets/g, `="${baseUrl}/stylesheets`)
    .replace(/="\/javascripts/g, `="${baseUrl}/javascripts`)
    .replace(/="\/images/g, `="${baseUrl}/images`)
    .replace(/="\/fonts/g, `="${baseUrl}/fonts`)
    .replace(/="\/static/g, `="${baseUrl}/static`);
  app.use((req, res) => res.send(baseUrlHtml));
} else {
  logger.error('NO FRONT END TEMPLATE DETECTED');
  logger.error('If not running in dev mode please report this issue.');
}

module.exports = app;
