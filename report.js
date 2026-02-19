const RUBRIC = {
  fees: 3,
  apr: 3,
  cancellation: 2,
  'auto-renew': 2,
  'early-repay': 2
};

export function buildReport(findings) {
  const moneyTraps = findings.map(f => ({
    trigger: f.label,
    consequence: summarizeConsequence(f.type),
    evidence: f.snippet,
    pageNumber: f.pageNumber,
    confidence: f.confidence
  }));

  const escapeChecklist = buildEscapeChecklist(findings);
  const riskScore = calculateScore(findings);
  const riskLabel = riskScore >= 6 ? 'Predatory' : riskScore >= 3 ? 'Caution' : 'Good Deal';

  const breakdown = Object.entries(RUBRIC).map(([key, weight]) => ({
    signal: key,
    weight,
    present: findings.some(f => f.type === key)
  }));

  return {
    moneyTraps,
    escapeChecklist,
    riskScore,
    riskLabel,
    breakdown
  };
}

function buildEscapeChecklist(findings) {
  const items = [
    { label: 'Cancellation path stated', present: hasType(findings, 'cancellation') },
    { label: 'Auto-renewal clauses', present: hasType(findings, 'auto-renew') },
    { label: 'Early repayment/termination fees', present: hasType(findings, 'early-repay') }
  ];
  return items;
}

function calculateScore(findings) {
  let score = 0;
  for (const f of findings) {
    score += RUBRIC[f.type] || 0;
  }
  return Math.min(10, score);
}

function summarizeConsequence(type) {
  switch (type) {
    case 'fees':
      return 'Unexpected fees may increase total cost.';
    case 'apr':
      return 'APR may increase under certain conditions.';
    case 'cancellation':
      return 'Cancellation may require specific steps.';
    case 'auto-renew':
      return 'Auto-renewal could extend the agreement.';
    case 'early-repay':
      return 'Early repayment/termination could trigger fees.';
    default:
      return 'Potential cost or constraint detected.';
  }
}

function hasType(findings, type) {
  return findings.some(f => f.type === type);
}
