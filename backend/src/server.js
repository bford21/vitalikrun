require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const leaderboardRoutes = require('./routes/leaderboard');
const { router: blockchainRouter, initializeBlockchainConnections } = require('./routes/blockchain');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

// API Routes
app.use('/api', leaderboardRoutes);
app.use('/api', blockchainRouter);

// Serve static files from frontend (for production)
// Exclude backend directory and config.js
app.use(express.static(path.join(__dirname, '../../'), {
  index: false,
  setHeaders: (res, filepath) => {
    // Don't serve backend files or config.js
    if (filepath.includes('/backend/') || filepath.endsWith('config.js')) {
      res.status(404);
    }
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Catch-all route to serve index.html (for SPA)
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, '../../index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🎮 Frontend URL: ${process.env.FRONTEND_URL || 'Not set'}`);

  // Initialize blockchain WebSocket connections
  initializeBlockchainConnections();
});
