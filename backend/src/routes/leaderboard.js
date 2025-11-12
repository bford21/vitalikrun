const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifySignature, validateScoreData } = require('../middleware/verify');

/**
 * POST /api/submit-score
 * Submit a score to the leaderboard with wallet signature
 */
router.post('/submit-score', async (req, res) => {
  try {
    const { walletAddress, score, ethCollected, blocksPassed, signature, message, farcasterData } = req.body;

    // Validate required fields
    if (!walletAddress || !score || !signature || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Normalize wallet address
    const normalizedAddress = walletAddress.toLowerCase();

    // Validate score data
    const validation = validateScoreData(score, ethCollected, blocksPassed, message);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Verify signature
    const isValid = await verifySignature(normalizedAddress, message, signature);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Insert or update score in database
    let query, queryParams;

    if (farcasterData && farcasterData.fid) {
      // User is from Farcaster - include Farcaster data
      query = `
        INSERT INTO leaderboard (wallet_address, score, eth_collected, blocks_passed, signature, message, farcaster_fid, farcaster_username, farcaster_display_name, farcaster_pfp_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (wallet_address)
        DO UPDATE SET
          score = EXCLUDED.score,
          eth_collected = EXCLUDED.eth_collected,
          blocks_passed = EXCLUDED.blocks_passed,
          signature = EXCLUDED.signature,
          message = EXCLUDED.message,
          farcaster_fid = EXCLUDED.farcaster_fid,
          farcaster_username = EXCLUDED.farcaster_username,
          farcaster_display_name = EXCLUDED.farcaster_display_name,
          farcaster_pfp_url = EXCLUDED.farcaster_pfp_url,
          updated_at = NOW()
        WHERE EXCLUDED.score > leaderboard.score
        RETURNING *;
      `;
      queryParams = [
        normalizedAddress,
        score,
        ethCollected,
        blocksPassed,
        signature,
        message,
        farcasterData.fid,
        farcasterData.username || null,
        farcasterData.displayName || null,
        farcasterData.pfpUrl || null
      ];
    } else {
      // Regular user - no Farcaster data
      query = `
        INSERT INTO leaderboard (wallet_address, score, eth_collected, blocks_passed, signature, message)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (wallet_address)
        DO UPDATE SET
          score = EXCLUDED.score,
          eth_collected = EXCLUDED.eth_collected,
          blocks_passed = EXCLUDED.blocks_passed,
          signature = EXCLUDED.signature,
          message = EXCLUDED.message,
          updated_at = NOW()
        WHERE EXCLUDED.score > leaderboard.score
        RETURNING *;
      `;
      queryParams = [
        normalizedAddress,
        score,
        ethCollected,
        blocksPassed,
        signature,
        message
      ];
    }

    const result = await pool.query(query, queryParams);

    // If no rows returned, it means the new score wasn't higher
    if (result.rows.length === 0) {
      // Get the existing score
      const existingQuery = 'SELECT score FROM leaderboard WHERE wallet_address = $1';
      const existing = await pool.query(existingQuery, [normalizedAddress]);

      return res.status(200).json({
        success: false,
        message: 'Score not improved',
        currentScore: existing.rows[0].score,
        submittedScore: score
      });
    }

    // Get the user's rank
    const rankQuery = `
      SELECT COUNT(*) + 1 as rank
      FROM leaderboard
      WHERE score > $1
    `;
    const rankResult = await pool.query(rankQuery, [score]);
    const rank = parseInt(rankResult.rows[0].rank);

    res.status(200).json({
      success: true,
      rank,
      score,
      walletAddress: normalizedAddress
    });

  } catch (error) {
    console.error('Error submitting score:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/leaderboard
 * Get leaderboard with pagination
 * Query params: offset (default 0), limit (default 50)
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const offset = parseInt(req.query.offset) || 0;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100); // Max 100 per request

    const query = `
      SELECT
        wallet_address,
        ens_name,
        score,
        eth_collected,
        blocks_passed,
        created_at,
        updated_at,
        farcaster_fid,
        farcaster_username,
        farcaster_display_name,
        farcaster_pfp_url,
        ROW_NUMBER() OVER (ORDER BY score DESC) as rank
      FROM leaderboard
      ORDER BY score DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [limit, offset]);

    // Get total count
    const countQuery = 'SELECT COUNT(*) as total FROM leaderboard';
    const countResult = await pool.query(countQuery);
    const total = parseInt(countResult.rows[0].total);

    res.status(200).json({
      leaderboard: result.rows,
      total,
      offset,
      limit
    });

  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/user-score/:address
 * Get a specific user's score and rank
 */
router.get('/user-score/:address', async (req, res) => {
  try {
    const walletAddress = req.params.address.toLowerCase();

    const query = `
      SELECT
        wallet_address,
        ens_name,
        score,
        eth_collected,
        blocks_passed,
        created_at,
        updated_at,
        farcaster_fid,
        farcaster_username,
        farcaster_display_name,
        farcaster_pfp_url,
        (SELECT COUNT(*) + 1 FROM leaderboard WHERE score > l.score) as rank
      FROM leaderboard l
      WHERE wallet_address = $1
    `;

    const result = await pool.query(query, [walletAddress]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found on leaderboard' });
    }

    res.status(200).json(result.rows[0]);

  } catch (error) {
    console.error('Error fetching user score:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
