/**
 * Trigram generation and fuzzy matching utilities
 *
 * Trigrams are 3-character sequences used for fuzzy string matching.
 * Example: "useChat" → ["use", "seC", "eCh", "Cha", "hat"]
 */

/**
 * Generate trigrams from a string
 * Handles Unicode properly and preserves case for code identifiers
 */
export function generateTrigrams(text: string): string[] {
  const chars = Array.from(text); // codepoint-aware
  if (chars.length < 3) return [text];

  const trigrams: string[] = [];
  const padded = [' ', ' ', ...chars, ' ']; // capture boundaries

  for (let i = 0; i < padded.length - 2; i++) {
    trigrams.push(padded.slice(i, i + 3).join(''));
  }
  return Array.from(new Set(trigrams));
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching (typo tolerance)
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const a = Array.from(str1);
  const b = Array.from(str2);
  const n = a.length, m = b.length;
  if (!n) return m;
  if (!m) return n;

  let prev = new Array(m + 1);
  let curr = new Array(m + 1);

  for (let j = 0; j <= m; j++) prev[j] = j;

  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    const ai = a[i - 1].toLowerCase();
    for (let j = 1; j <= m; j++) {
      const cost = ai === b[j - 1].toLowerCase() ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return prev[m];
}

/**
 * Calculate similarity score based on Levenshtein distance
 * Returns 0.0-1.0 where 1.0 is identical
 */
export function similarityScore(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  const maxLength = Math.max(str1.length, str2.length);

  if (maxLength === 0) {
    return 1.0;
  }

  return 1.0 - (distance / maxLength);
}

/**
 * Check if a string matches a pattern with fuzzy matching
 * @param text - Text to search in
 * @param pattern - Pattern to search for
 * @param threshold - Similarity threshold (0.0-1.0), default 0.7
 */
export function fuzzyMatch(
  text: string,
  pattern: string,
  threshold: number = 0.7
): boolean {
  // Exact match
  if (text.toLowerCase().includes(pattern.toLowerCase())) {
    return true;
  }

  // Fuzzy match using trigrams
  const textTrigrams = new Set(generateTrigrams(text.toLowerCase()));
  const patternTrigrams = new Set(generateTrigrams(pattern.toLowerCase()));

  // Calculate Jaccard similarity
  const intersection = new Set(
    [...patternTrigrams].filter(t => textTrigrams.has(t))
  );
  const union = new Set([...textTrigrams, ...patternTrigrams]);

  const jaccardSimilarity = intersection.size / union.size;

  return jaccardSimilarity >= threshold;
}

/**
 * Find fuzzy matches in a list of strings
 * Returns matches sorted by similarity score
 */
export function findFuzzyMatches(
  candidates: string[],
  pattern: string,
  threshold: number = 0.7,
  maxResults: number = 10
): Array<{ text: string; score: number }> {
  const matches = candidates
    .map(candidate => ({
      text: candidate,
      score: similarityScore(candidate, pattern)
    }))
    .filter(match => match.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  return matches;
}

/**
 * Extract code identifiers from text for indexing
 * Identifies: CamelCase, snake_case, kebab-case, etc.
 */
export function extractIdentifiers(text: string): string[] {
  const identifiers: Set<string> = new Set();

  // Match CamelCase with acronyms and digits (e.g., HTTPServer2, StreamingTextResponse)
  const camelCaseRegex = /[A-Z][A-Za-z0-9]*([A-Z][a-z0-9]+)*/g;
  const camelMatches = text.match(camelCaseRegex) || [];
  camelMatches.forEach(id => identifiers.add(id));

  // Match snake_case allowing digits (e.g., streaming_text_response, snake2_case)
  const snakeCaseRegex = /[a-z0-9]+(?:[_][a-z0-9]+)+/g;
  const snakeMatches = text.match(snakeCaseRegex) || [];
  snakeMatches.forEach(id => identifiers.add(id));

  // Match kebab-case allowing digits (e.g., streaming-text-response, kebab2-case)
  const kebabCaseRegex = /[a-z0-9]+(?:[-][a-z0-9]+)+/g;
  const kebabMatches = text.match(kebabCaseRegex) || [];
  kebabMatches.forEach(id => identifiers.add(id));

  // Match UPPER_CASE constants with digits (e.g., MAX_TOKENS, API_KEY_2)
  const upperCaseRegex = /[A-Z0-9]+(?:[_][A-Z0-9]+)+/g;
  const upperMatches = text.match(upperCaseRegex) || [];
  upperMatches.forEach(id => identifiers.add(id));

  // Match dotted identifiers (e.g., @ai-sdk/openai)
  const dottedRegex = /[@a-z0-9]+(?:[/.][a-z0-9-]+)+/gi;
  const dottedMatches = text.match(dottedRegex) || [];
  dottedMatches.forEach(id => identifiers.add(id));

  return Array.from(identifiers);
}

/**
 * Normalize identifier for searching
 * Converts to lowercase and handles variations
 */
export function normalizeIdentifier(identifier: string): string {
  return identifier
    .toLowerCase()
    .replace(/[-_.\\/@]/g, '') // Remove common separators and scopes
    .trim();
}

/**
 * Check if two identifiers are similar (ignoring case and separators)
 * Example: "StreamingTextResponse" matches "streaming_text_response"
 */
export function identifiersSimilar(id1: string, id2: string): boolean {
  return normalizeIdentifier(id1) === normalizeIdentifier(id2);
}
