const path = require('path');
const datastore = require('nedb-promise');
const mkdirp = require('mkdirp');
const config = require('./config');
const passhash = require('../lib/passhash');
const logger = require('./logger');

const admin = config.get('admin');
const adminPassword = config.get('adminPassword');
const dbPath = config.get('dbPath');
const port = config.get('port');

mkdirp.sync(path.join(dbPath, '/cache'));

const db = {
  users: datastore({ filename: path.join(dbPath, 'users.db') }),
  connections: datastore({
    filename: path.join(dbPath, 'connections.db')
  }),
  queries: datastore({ filename: path.join(dbPath, 'queries.db') }),
  cache: datastore({ filename: path.join(dbPath, 'cache.db') }),
  instances: ['users', 'connections', 'queries', 'cache']
};

// Load dbs, migrate data, and apply indexes
async function init() {
  await Promise.all(
    db.instances.map(dbname => {
      logger.debug('Loading %s..', dbname);
      return db[dbname].loadDatabase();
    })
  );
  await db.users.ensureIndex({ fieldName: 'email', unique: true });
  await db.cache.ensureIndex({ fieldName: 'cacheKey', unique: true });
  // set autocompaction
  const tenMinutes = 1000 * 60 * 10;
  db.instances.forEach(dbname => {
    db[dbname].nedb.persistence.setAutocompactionInterval(tenMinutes);
  });
  return ensureAdmin();
}

db.loadPromise = init();

async function ensureAdmin() {
  const adminEmail = admin;
  if (!adminEmail) {
    return;
  }

  try {
    // if an admin was passed in the command line, check to see if a user exists with that email
    // if so, set the admin to true
    // if not, whitelist the email address.
    // Then write to console that the person should visit the signup url to finish registration.
    const user = await db.users.findOne({ email: adminEmail });
    if (user) {
      const changes = { role: 'admin' };
      if (adminPassword) {
        changes.passhash = passhash.getPasshash(adminPassword);
      }
      await db.users.update({ _id: user._id }, { $set: changes }, {});
      logger.info(adminEmail + ' should now have admin access.');
      return;
    }

    const newAdmin = {
      email: adminEmail,
      role: 'admin'
    };
    if (adminPassword) {
      newAdmin.passhash = passhash.getPasshash(adminPassword);
    }
    await db.users.insert(newAdmin);
    logger.debug(`${adminEmail} has been whitelisted with admin access.`);
    logger.debug(
      `Please visit http://localhost:${port}/signup/ to complete registration.`
    );
  } catch (error) {
    logger.error({ err: error }, `could not make ${adminEmail} an admin.`);
    throw error;
  }
}

module.exports = db;
