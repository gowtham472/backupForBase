# Firestore Self-Backup Setup

This repository includes an automated Firestore backup robot that:

1. Exports Firestore collections to JSON files in `backups/firestore/`.
2. Runs every day (and on manual trigger) through GitHub Actions.
3. Commits backup snapshots back to this same repository.

## Files added

- `scripts/backup-firestore.js`
- `.github/workflows/firestore-backup.yml`
- `backups/firestore/.gitkeep`
- `package.json`

## Required GitHub secret

Add this in **Settings → Secrets and variables → Actions → Secrets**:

- `FIREBASE_SERVICE_ACCOUNT`: full JSON string from a Firebase service account key.

## Optional GitHub Action variables

In **Settings → Secrets and variables → Actions → Variables**:

- `FIRESTORE_COLLECTIONS`: comma-separated collection names (example: `users,tasks,projects`).
  - If omitted, the script auto-discovers top-level collections via `db.listCollections()`.
- `BACKUP_RETENTION_DAYS`: defaults to `30`.
  - Set `0` or a negative value to disable cleanup.

## Manual run

1. Go to **Actions → Firestore Backup**.
2. Click **Run workflow**.

## Local run (optional)

```bash
export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account", ...}'
export FIRESTORE_COLLECTIONS='users,tasks,projects' # optional
export BACKUP_RETENTION_DAYS=30 # optional
npm install
npm run backup:firestore
```
