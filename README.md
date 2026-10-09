# NPPweb
Notepad++ like application, but web based and simplified, runs on railway

## Local setup

Needs Node.js 24.

1. `npm ci`
2. `npm run build`
3. `npm test`

## Deploy on Railway

`railway.json` sets the build command, start command, health check (`/healthz`) and restart policy.

Owner checklist for the first deploy:

1. Create a Railway project from this GitHub repo.
2. Add a volume to the service with mount path `/data`.
3. Keep the service at 1 replica. Railway does not allow replicas with a volume.
4. Set the variables `NODE_ENV=production` and a strong `OWNER_PASSWORD`.
5. Generate a Railway domain.
6. Open `https://<domain>/healthz`. It must return `{"ok":true}`.
7. In the deploy logs, find the line `Database: /data/notepad.db`.
8. Redeploy. Then run `railway volume files list /` and confirm that `notepad.db` is still there. This command needs Railway CLI 5 or later (`npm i -g @railway/cli`).
