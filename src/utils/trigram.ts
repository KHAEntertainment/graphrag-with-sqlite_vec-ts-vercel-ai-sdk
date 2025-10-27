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
  if (text.length < 3) {
    return [text];
  }

  const trigrams: string[] = [];

  // Add padding to capture beginning and end
  const paddedText = `  ${text} `;

  for (let i = 0; i < paddedText.length - 2; i++) {
    const trigram = paddedText.slice(i, i + 3);
    trigrams.push(trigram);
  }

  return Array.from(new Set(trigrams)); // Remove duplicates
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching (typo tolerance)
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  // Create 2D array for dynamic programming
  const dp: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  // Initialize first column and row
  for (let i = 0; i <= len1; i++) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= len2; j++) {
    dp[0][j] = j;
  }

  // Fill the dp table
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;

      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[len1][len2];
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

  // Match CamelCase (e.g., StreamingTextResponse)
  const camelCaseRegex = /[A-Z][a-z]+(?:[A-Z][a-z]+)*/g;
  const camelMatches = text.match(camelCaseRegex) || [];
  camelMatches.forEach(id => identifiers.add(id));

  // Match snake_case (e.g., streaming_text_response)
  const snakeCaseRegex = /[a-z]+(?:_[a-z]+)+/g;
  const snakeMatches = text.match(snakeCaseRegex) || [];
  snakeMatches.forEach(id => identifiers.add(id));

  // Match kebab-case (e.g., streaming-text-response)
  const kebabCaseRegex = /[a-z]+(?:-[a-z]+)+/g;
  const kebabMatches = text.match(kebabCaseRegex) || [];
  kebabMatches.forEach(id => identifiers.add(id));

  // Match UPPER_CASE constants (e.g., MAX_TOKENS)
  const upperCaseRegex = /[A-Z]+(?:_[A-Z]+)+/g;
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
    .replace(/[-_]/g, '') // Remove separators
    .trim();
}

/**
 * Check if two identifiers are similar (ignoring case and separators)
 * Example: "StreamingTextResponse" matches "streaming_text_response"
 */
export function identifiersSimilar(id1: string, id2: string): boolean {
  return normalizeIdentifier(id1) === normalizeIdentifier(id2);
}
