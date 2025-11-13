# Running On Ethereum

Endless runner game with real-time blockchain blocks. Dodge blocks from live Ethereum networks, collect ETH, and compete for the top score!

**Play now**: https://runvitalik.run

![Gameplay](gameplay.png)

## Features

- Dodge blocks spawned from live Ethereum, Base, and Optimism networks
- Collect ETH coins to increase score
- Three powerups: Clear blocks, magnetic coins, giant mode
- Connect wallet to submit scores to leaderboard
- Farcaster mini app integration with profile support

## Tech Stack

- **Frontend**: Three.js, Vite, React, RainbowKit, Wagmi
- **Backend**: Node.js, Express, PostgreSQL
- **Blockchain**: Alchemy WebSocket connections for real-time block data
- **Integrations**: Farcaster SDK, ethers.js

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Alchemy API keys for Base, Optimism, and Ethereum

### Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
cd backend && npm install
```

3. Create `.env` file in `backend/`:
```
DATABASE_URL=your_postgres_url
ALCHEMY_BASE_KEY=your_key
ALCHEMY_OP_KEY=your_key
ALCHEMY_ETH_KEY=your_key
PORT=8080
FRONTEND_URL=http://localhost:4000
NODE_ENV=development
```

4. Run database migrations:
```sql
-- See backend/migrations/add_farcaster_fields.sql
```

5. Start development servers:
```bash
# Terminal 1 - Frontend
npm run dev

# Terminal 2 - Backend
cd backend && npm start
```

6. Open http://localhost:4000

## Deployment

### Frontend
Deploy to hosting service. Ensure:
- Build with `npm run build`
- Serve `dist/` directory
- `/.well-known/farcaster.json` is accessible

### Backend
Deploy to Node.js hosting. Ensure:
- PostgreSQL connection configured
- Environment variables set
- CORS allows frontend domain

### Farcaster Publishing
1. Create required images in `public/`:
   - `icon-512.png` (512x512)
   - `splash.png` (1200x630)
   - `og-image.png` (1200x630)

2. Register at https://farcaster.xyz/~/developers/mini-apps/manifest with your domain

## Game Controls

- **Desktop**: Arrow keys or WASD to move, Space to jump
- **Mobile**: Touch controls for left/right/jump

## Architecture

- Backend maintains 3 WebSocket connections to Alchemy (one per chain)
- Real-time blocks broadcast to all connected clients via Server-Sent Events
- Leaderboard stores wallet addresses, ENS names, and Farcaster profiles
- Score submission requires wallet signature verification
