const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function getEnv(name, fallback = undefined) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function parseServiceAccount() {
  const raw = getEnv('FIREBASE_SERVICE_ACCOUNT');
  if (!raw) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT secret.');
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT is not valid JSON: ${error.message}`);
  }
}

function normalizeValue(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      // Firestore Timestamp
      return value.toDate().toISOString();
    }

    if (
      Object.prototype.hasOwnProperty.call(value, 'latitude') &&
      Object.prototype.hasOwnProperty.call(value, 'longitude')
    ) {
      // Firestore GeoPoint
      return { latitude: value.latitude, longitude: value.longitude };
    }

    if (typeof value.path === 'string' && typeof value.firestore === 'object') {
      // Firestore DocumentReference
      return value.path;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, normalizeValue(nested)])
    );
  }

  return value;
}

function getDateStamp() {
  return new Date().toISOString().split('T')[0];
}

function getCollectionsFromEnv() {
  const raw = getEnv('FIRESTORE_COLLECTIONS', '');
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function resolveCollections(db) {
  const configured = getCollectionsFromEnv();
  if (configured.length > 0) {
    return configured;
  }

  const collectionRefs = await db.listCollections();
  return collectionRefs.map((collection) => collection.id);
}

function ensureBackupDir() {
  const dir = path.join('backups', 'firestore');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeCollectionBackup(dir, collectionName, dateStamp, rows) {
  const filePath = path.join(dir, `${collectionName}-${dateStamp}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  console.log(`Backup saved: ${filePath}`);
}

function cleanOldBackups(dir, retentionDays) {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    console.log('Retention disabled (BACKUP_RETENTION_DAYS <= 0).');
    return;
  }

  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const fileName of fs.readdirSync(dir)) {
    if (!fileName.endsWith('.json')) {
      continue;
    }

    const fullPath = path.join(dir, fileName);
    const stat = fs.statSync(fullPath);
    if (now - stat.mtimeMs > maxAgeMs) {
      fs.unlinkSync(fullPath);
      console.log(`Deleted old backup: ${fullPath}`);
    }
  }
}

async function backupCollection(db, dir, collectionName, dateStamp) {
  const snapshot = await db.collection(collectionName).get();

  const rows = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...normalizeValue(doc.data())
  }));

  writeCollectionBackup(dir, collectionName, dateStamp, rows);
}

async function main() {
  const serviceAccount = parseServiceAccount();

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  const db = admin.firestore();
  const collections = await resolveCollections(db);

  if (collections.length === 0) {
    console.log('No Firestore collections found. Nothing to backup.');
    return;
  }

  const backupDir = ensureBackupDir();
  const dateStamp = getDateStamp();

  for (const collectionName of collections) {
    await backupCollection(db, backupDir, collectionName, dateStamp);
  }

  const retentionDays = Number.parseInt(getEnv('BACKUP_RETENTION_DAYS', '30'), 10);
  cleanOldBackups(backupDir, retentionDays);
}

main().catch((error) => {
  console.error('Firestore backup failed:', error);
  process.exitCode = 1;
});
