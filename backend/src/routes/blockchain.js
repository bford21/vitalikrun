const express = require('express');
const router = express.Router();
const WebSocket = require('ws');

// Store active WebSocket connections
const blockchainConnections = new Map();

// Initialize blockchain WebSocket connections
function initializeBlockchainConnections() {
  const chains = [
    { name: 'base', url: `wss://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`, httpUrl: 'https://base-mainnet.g.alchemy.com/v2' },
    { name: 'op', url: `wss://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`, httpUrl: 'https://opt-mainnet.g.alchemy.com/v2' },
    { name: 'eth', url: `wss://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`, httpUrl: 'https://eth-mainnet.g.alchemy.com/v2' },
    // Arbitrum disabled
    // { name: 'arb', url: `wss://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`, httpUrl: 'https://arb-mainnet.g.alchemy.com/v2' }
  ];

  chains.forEach(chain => {
    setupChainConnection(chain);
  });
}

// Setup WebSocket connection for a specific chain
function setupChainConnection(chain) {
  console.log(`🔗 Connecting to ${chain.name.toUpperCase()} blockchain...`);

  const ws = new WebSocket(chain.url);

  ws.on('open', () => {
    console.log(`✅ ${chain.name.toUpperCase()} WebSocket connected`);

    // Subscribe to new block headers
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_subscribe',
      params: ['newHeads']
    }));
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());

      // Handle subscription confirmations
      if (message.result && typeof message.result === 'string') {
        console.log(`${chain.name.toUpperCase()} subscription ID:`, message.result);
        return;
      }

      // Handle new block notifications
      if (message.method === 'eth_subscription') {
        const blockHeader = message.params.result;
        const blockNumber = parseInt(blockHeader.number, 16);

        // Fetch full block data with transaction count
        try {
          const response = await fetch(`${chain.httpUrl}/${process.env.ALCHEMY_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'eth_getBlockByNumber',
              params: [blockHeader.number, false]
            })
          });

          const blockData = await response.json();
          const txCount = blockData.result.transactions ? blockData.result.transactions.length : 0;

          // Broadcast to all connected clients
          const blockInfo = {
            chain: chain.name,
            blockNumber,
            txCount,
            timestamp: Date.now()
          };

          broadcastToClients(blockInfo);

          console.log(`${chain.name.toUpperCase()} Block #${blockNumber} - ${txCount} txs`);
        } catch (error) {
          console.error(`Error fetching ${chain.name.toUpperCase()} block data:`, error);
        }
      }
    } catch (error) {
      console.error(`Error processing ${chain.name.toUpperCase()} message:`, error);
    }
  });

  ws.on('error', (error) => {
    console.error(`${chain.name.toUpperCase()} WebSocket error:`, error);
  });

  ws.on('close', () => {
    console.log(`${chain.name.toUpperCase()} WebSocket closed. Reconnecting in 5s...`);
    setTimeout(() => setupChainConnection(chain), 5000);
  });

  blockchainConnections.set(chain.name, ws);
}

// Store connected SSE clients
const sseClients = new Set();

// Broadcast block data to all connected clients
function broadcastToClients(blockInfo) {
  sseClients.forEach(client => {
    try {
      client.write(`data: ${JSON.stringify(blockInfo)}\n\n`);
    } catch (error) {
      console.error('Error broadcasting to client:', error);
      sseClients.delete(client);
    }
  });
}

// SSE endpoint for clients to receive blockchain updates
router.get('/blocks/stream', (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send initial connection message
  res.write('data: {"status":"connected"}\n\n');

  // Add client to the set
  sseClients.add(res);

  console.log(`📡 New SSE client connected. Total clients: ${sseClients.size}`);

  // Remove client on disconnect
  req.on('close', () => {
    sseClients.delete(res);
    console.log(`📡 SSE client disconnected. Total clients: ${sseClients.size}`);
  });
});

module.exports = { router, initializeBlockchainConnections };
