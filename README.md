# Kenzz COD Cash Cycle — Web Application

A professional COD cash cycle analysis dashboard for Kenzz e-commerce.
Tracks collections, 3PL performance, seller payments, and payment term compliance.

## Quick Start (Local)

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open in browser
# → http://localhost:3000
```

The database (SQLite) is created automatically in `./data/kenzz.db`.

---

## Deploy to Render.com (Free — recommended)

Render gives you a free web service with persistent disk for the SQLite database.

### Step-by-step:

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Kenzz COD Cash Cycle v2.0"
   # Create a repo on github.com, then:
   git remote add origin https://github.com/YOUR_USERNAME/kenzz-cod-app.git
   git push -u origin main
   ```

2. **Create a Render account** → https://render.com (sign in with GitHub)

3. **New → Web Service**
   - Connect your GitHub repo
   - **Name:** `kenzz-cod-dashboard`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free

4. **Add a Disk** (so data persists across deploys)
   - Go to your service → **Disks** → **Add Disk**
   - **Mount Path:** `/data`
   - **Size:** 1 GB (free tier)

5. **Add Environment Variable**
   - `DB_PATH` = `/data/kenzz.db`

6. **Deploy** — Render builds and gives you a URL like:
   `https://kenzz-cod-dashboard.onrender.com`

Share this URL with management. Done.

---

## Deploy to Railway.app (Alternative)

1. Push to GitHub (same as above)
2. Go to https://railway.app → **New Project** → **Deploy from GitHub**
3. Select your repo
4. Add a **Volume** mounted at `/data`
5. Set environment variable: `DB_PATH=/data/kenzz.db`
6. Railway gives you a public URL automatically

---

## Deploy to a VPS (DigitalOcean, AWS, etc.)

```bash
# On the server:
git clone https://github.com/YOUR_USERNAME/kenzz-cod-app.git
cd kenzz-cod-app
npm install
# Run with PM2 for production:
npm install -g pm2
pm2 start server.js --name kenzz-cod
# Set up nginx reverse proxy to port 3000
```

---

## Project Structure

```
kenzz-cod-app/
├── server.js          # Express server + API routes
├── db.js              # SQLite database module
├── parser.js          # Excel file parser (Journal, Collections, Sellers, Legacy)
├── package.json
├── README.md
├── public/
│   └── index.html     # Frontend (single-page app, all analysis client-side)
└── data/
    └── kenzz.db       # SQLite database (auto-created)
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | Get all orders |
| GET | `/api/imports` | Get import history |
| GET | `/api/returns` | Get return tracking numbers |
| POST | `/api/upload` | Upload Excel files (multipart form) |
| POST | `/api/returns` | Add return tracking numbers |
| DELETE | `/api/returns/:tn` | Remove a return |
| DELETE | `/api/returns` | Clear all returns |
| GET | `/api/settings/:key` | Get a setting |
| POST | `/api/settings/:key` | Save a setting |
| GET | `/api/export` | Export full database as JSON |
| POST | `/api/import-db` | Import database from JSON |
| POST | `/api/clear` | Clear all orders and imports |

## Future Expansion

- **Authentication:** Add `express-session` + a users table, or use Auth0/Clerk
- **Odoo Integration:** Add API routes that pull from Odoo's XML-RPC/JSON-RPC API
- **PostgreSQL:** Swap `better-sqlite3` for `pg` — the queries are simple enough to port
- **Multi-user:** Add a `user_id` column to orders/imports tables
