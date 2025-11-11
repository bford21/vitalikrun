const { verifyMessage } = require('viem');

/**
 * Verify that a signature matches the wallet address and message
 */
async function verifySignature(walletAddress, message, signature) {
  try {
    // Recover the address from the signature
    const recoveredAddress = await verifyMessage({
      address: walletAddress,
      message,
      signature
    });

    return recoveredAddress;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Validate score submission data
 */
function validateScoreData(score, ethCollected, blocksPassed, message) {
  // Check score is a positive number
  if (typeof score !== 'number' || score < 0) {
    return { valid: false, error: 'Invalid score' };
  }

  // Check eth collected is valid
  if (typeof ethCollected !== 'number' || ethCollected < 0) {
    return { valid: false, error: 'Invalid eth collected' };
  }

  // Check blocks passed is valid
  if (typeof blocksPassed !== 'number' || blocksPassed < 0) {
    return { valid: false, error: 'Invalid blocks passed' };
  }

  // Verify the score calculation matches
  const calculatedScore = (ethCollected * 100) + (blocksPassed * 100);
  if (calculatedScore !== score) {
    return { valid: false, error: 'Score calculation mismatch' };
  }

  // Verify message contains the score data
  if (!message.includes(`Score: ${score}`)) {
    return { valid: false, error: 'Message does not match score' };
  }

  if (!message.includes(`ETH Collected: ${ethCollected}`)) {
    return { valid: false, error: 'Message does not match ETH collected' };
  }

  if (!message.includes(`Blocks Passed: ${blocksPassed}`)) {
    return { valid: false, error: 'Message does not match blocks passed' };
  }

  return { valid: true };
}

module.exports = {
  verifySignature,
  validateScoreData
};
