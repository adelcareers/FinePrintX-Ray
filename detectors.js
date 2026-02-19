export function chunkPages(pages, minWords = 300, maxWords = 800) {
  const chunks = [];
  let buffer = [];
  let words = 0;
  let startPage = null;

  for (const page of pages) {
    const pageWords = page.text.split(/\s+/).filter(Boolean);
    if (startPage === null) startPage = page.pageNumber;
    buffer.push({ pageNumber: page.pageNumber, words: pageWords });
    words += pageWords.length;

    if (words >= minWords) {
      if (words >= maxWords) {
        chunks.push(makeChunk(buffer, startPage));
        buffer = [];
        words = 0;
        startPage = null;
      }
    }
  }

  if (buffer.length > 0) {
    chunks.push(makeChunk(buffer, startPage));
  }

  return chunks;
}

function makeChunk(buffer, startPage) {
  const text = buffer.map(b => b.words.join(' ')).join(' ');
  const endPage = buffer[buffer.length - 1].pageNumber;
  return { startPage, endPage, text };
}

const RULES = [
  { type: 'fees', label: 'Fee / charge', pattern: /(fee|charge|penalty|late)/i, weight: 3 },
  { type: 'apr', label: 'APR trigger', pattern: /(apr|interest rate|rate increase|variable rate)/i, weight: 3 },
  { type: 'cancellation', label: 'Cancellation/termination', pattern: /(cancel|termination|close|end account)/i, weight: 2 },
  { type: 'auto-renew', label: 'Auto-renewal', pattern: /(auto\-renew|automatic renewal)/i, weight: 2 },
  { type: 'early-repay', label: 'Early repayment', pattern: /(early repayment|prepayment)/i, weight: 2 }
];

export function detectFindings(pages) {
  const findings = [];
  const chunks = chunkPages(pages);

  for (const chunk of chunks) {
    for (const rule of RULES) {
      const match = chunk.text.match(rule.pattern);
      if (match) {
        const snippet = extractSnippet(chunk.text, match.index || 0, 180);
        findings.push({
          type: rule.type,
          label: rule.label,
          pageNumber: chunk.startPage,
          snippet,
          confidence: scoreConfidence(rule.weight)
        });
      }
    }
  }

  return findings.slice(0, 12);
}

function extractSnippet(text, index, span) {
  const start = Math.max(0, index - span);
  const end = Math.min(text.length, index + span);
  return text.slice(start, end).trim();
}

function scoreConfidence(weight) {
  if (weight >= 3) return 'High';
  if (weight === 2) return 'Med';
  return 'Low';
}
