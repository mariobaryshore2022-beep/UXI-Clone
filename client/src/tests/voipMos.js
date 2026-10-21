/**
 * ITU-T G.107 E-Model VoIP Mean Opinion Score (MOS) Calculator
 * Translates one-way latency, jitter, and packet loss into an objective 1.0 - 5.0 MOS score.
 */

function calculateMos(roundTripLatencyMs, jitterMs, packetLossPct) {
  // One-way delay estimation (RTT/2 + jitter buffer delay)
  const oneWayDelay = (roundTripLatencyMs / 2) + (jitterMs * 2);

  // 1. Base Transmission Rating factor (R0)
  const R0 = 93.2;

  // 2. Delay Impairment factor (Id)
  let Id = 0;
  if (oneWayDelay <= 177.3) {
    Id = 0.024 * oneWayDelay;
  } else {
    Id = 0.024 * oneWayDelay + 0.11 * (oneWayDelay - 177.3);
  }

  // 3. Equipment / Packet Loss Impairment factor (Ie)
  // G.711 codec loss curve
  const lossRatio = Math.max(0, packetLossPct) / 100;
  const Ie = 30 * Math.log(1 + 15 * lossRatio);

  // 4. Effective R-Factor
  let R = R0 - Id - Ie;
  R = Math.max(0, Math.min(100, R));

  // 5. Convert R-Factor to MOS (1.0 to 4.5 scale according to ITU-T G.107)
  let mos = 1.0;
  if (R <= 0) {
    mos = 1.0;
  } else if (R >= 100) {
    mos = 4.5;
  } else {
    mos = 1 + (0.035 * R) + (R * (R - 60) * (100 - R) * 0.000007);
  }

  // Cap at standard MOS boundaries
  mos = Math.max(1.0, Math.min(4.5, mos));

  return {
    mos: parseFloat(mos.toFixed(2)),
    rFactor: parseFloat(R.toFixed(1)),
    rating: mos >= 4.03 ? 'Excellent' : mos >= 3.6 ? 'Good' : mos >= 3.1 ? 'Fair' : 'Poor'
  };
}

module.exports = { calculateMos };
