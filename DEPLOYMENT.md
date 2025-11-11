# Railway Monorepo Deployment Guide

This project is a **monorepo** with two services:
- `frontend/` - Next.js app with RainbowKit wallet connection
- `backend/` - Express API with PostgreSQL and blockchain WebSocket proxy

## Project Structure
```
vitalikrun/
├── frontend/          # Next.js 15 + RainbowKit
│   ├── app/
│   ├── components/
│   ├── public/
│   └── railway.json
├── backend/           # Express + PostgreSQL
│   ├── src/
│   └── railway.json
└── README.md
```

## Prerequisites

1. Railway account ([railway.app](https://railway.app))
2. PostgreSQL database in Railway (tables created)
3. Alchemy API key ([alchemy.com](https://alchemy.com))
4. WalletConnect Project ID ([cloud.walletconnect.com](https://cloud.walletconnect.com))

## Railway Monorepo Deployment

### Step 1: Connect GitHub Repository

1. Go to Railway Dashboard
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your `vitalikrun` repository
5. Railway will detect it's a monorepo

### Step 2: Deploy Backend Service

1. Railway should auto-detect `backend/` directory
2. **If not**: Click "Add Service" → Set root directory to `backend`
3. Configure environment variables:
   ```
   ALCHEMY_API_KEY=your_alchemy_api_key
   NODE_ENV=production
   FRONTEND_URL=*
   ```
4. **Note**: Railway auto-provides `DATABASE_URL` and `PORT`
5. Deploy! Backend will run on assigned Railway URL

### Step 3: Deploy Frontend Service

1. Click "Add Service from repo"
2. Set root directory to `frontend`
3. Configure environment variables:
   ```
   NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app/api
   ```
   *(Replace with your actual backend URL from Step 2)*
4. Deploy! Frontend will run on assigned Railway URL

### Step 4: Update Backend CORS

After both services are deployed:

1. Go to backend service environment variables
2. Update `FRONTEND_URL` to your frontend Railway URL:
   ```
   FRONTEND_URL=https://your-frontend.up.railway.app
   ```
3. Redeploy backend

## Environment Variables Reference

### Backend (`backend/.env`)
```
DATABASE_URL=<auto-injected-by-railway>
ALCHEMY_API_KEY=your_alchemy_key_here
PORT=<auto-injected-by-railway>
NODE_ENV=production
FRONTEND_URL=https://your-frontend.up.railway.app
```

### Frontend (`frontend/.env.local`)
```
NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app/api
```

## Database Setup

Your PostgreSQL database should have these tables:

```sql
CREATE TABLE leaderboard (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL UNIQUE,
  ens_name VARCHAR(255),
  score INTEGER NOT NULL,
  eth_collected INTEGER NOT NULL,
  blocks_passed INTEGER NOT NULL,
  signature TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_leaderboard_score ON leaderboard(score DESC);
CREATE INDEX idx_leaderboard_wallet ON leaderboard(wallet_address);
CREATE INDEX idx_leaderboard_created ON leaderboard(created_at DESC);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_leaderboard_updated_at BEFORE UPDATE
    ON leaderboard FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## Local Development

### Backend
```bash
cd backend
npm install
# Set up .env file with local DATABASE_URL
npm start  # Runs on port 8080
```

### Frontend
```bash
cd frontend
npm install
# Create .env.local with NEXT_PUBLIC_API_URL=http://localhost:8080/api
npm run dev  # Runs on port 3000
```

## Features

✅ Next.js 15 with App Router
✅ RainbowKit wallet connection (MetaMask, Rainbow, Coinbase, WalletConnect)
✅ Real-time blockchain blocks from Base, ETH, OP, ARB
✅ Score submission with signature verification
✅ PostgreSQL leaderboard
✅ Server-Sent Events for blockchain updates
✅ Mobile responsive

## Troubleshooting

### Frontend can't connect to backend
- Verify `NEXT_PUBLIC_API_URL` in frontend env vars
- Check backend URL is correct and includes `/api`
- Ensure backend CORS allows frontend origin

### Blockchain blocks not appearing
- Check Railway logs for WebSocket errors
- Verify `ALCHEMY_API_KEY` is set correctly
- Check blockchain connection status in logs

### Wallet connection fails
- Verify WalletConnect Project ID in `frontend/components/providers.tsx`
- Check browser console for errors
- Ensure site is served over HTTPS (Railway provides this)

## Architecture

```
┌─────────────┐       HTTPS        ┌──────────────┐
│   User      │ ◄─────────────────► │   Frontend   │
│  (Browser)  │                     │   (Next.js)  │
└─────────────┘                     └──────┬───────┘
                                           │ API Calls
                                           ▼
                                    ┌──────────────┐
                                    │   Backend    │
                                    │  (Express)   │
                                    └──┬───────┬───┘
                                       │       │
                        ┌──────────────┘       └─────────────┐
                        ▼                                     ▼
                 ┌─────────────┐                      ┌─────────────┐
                 │  PostgreSQL │                      │   Alchemy   │
                 │  (Railway)  │                      │  WebSockets │
                 └─────────────┘                      └─────────────┘
```

## Post-Deployment Checklist

- [ ] Backend deployed and running
- [ ] Frontend deployed and running
- [ ] Database tables created
- [ ] Backend can connect to database
- [ ] Frontend can call backend API
- [ ] Blockchain WebSockets connected (check logs)
- [ ] Wallet connection works (test RainbowKit modal)
- [ ] Can submit score and see on leaderboard
- [ ] Mobile responsive design working
