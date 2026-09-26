import type { RepairLog, SignatureDefinition } from '../../types/fileTypes';

export interface DocumentRepairResult {
  reconstructedBytes: Uint8Array;
  logs: RepairLog[];
  fixesCount: number;
  confidenceScore: number;
}

/**
 * Advanced Document Repair Engine
 * 
 * Handles text/JSON/XML/HTML/CSV/Markdown corruption:
 * 1. Null byte and BOM stripping
 * 2. Character encoding normalization
 * 3. JSON deep syntax repair (bracket balancing, quote fixing, key repair)
 * 4. XML/HTML tag balancing and structure recovery
 * 5. CSV delimiter detection and row repair
 * 6. Binary garbage extraction - recovers readable text from mixed binary/text
 */
export function repairDocument(
  buffer: Uint8Array,
  signature: SignatureDefinition
): DocumentRepairResult {
  const logs: RepairLog[] = [];
  let fixesCount = 0;
  let confidenceScore = 80;

  // === Phase 1: Extract readable text from potentially corrupted bytes ===
  let text = extractReadableText(buffer);
  const originalText = text;

  // === Phase 2: Strip null bytes and control characters ===
  if (text.includes('\0')) {
    const originalLen = text.length;
    text = text.replace(/\0/g, '');
    const strippedCount = originalLen - text.length;
    fixesCount++;
    logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'repair',
      message: `Null Byte Cleansing: Purged ${strippedCount} corrupted binary null bytes (0x00) from text stream.`,
    });
  }

  // Strip BOM markers
  if (text.charCodeAt(0) === 0xFEFF || text.startsWith('\uFEFF')) {
    text = text.substring(1);
    fixesCount++;
    logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'repair',
      message: 'BOM Marker Stripped: Removed Unicode Byte Order Mark from text stream.',
    });
  }

  // Strip non-printable control characters (except newlines, tabs)
  const controlCharRegex = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
  const controlMatches = text.match(controlCharRegex);
  if (controlMatches && controlMatches.length > 0) {
    text = text.replace(controlCharRegex, '');
    fixesCount++;
    logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'repair',
      message: `Control Character Cleanup: Removed ${controlMatches.length} non-printable control character(s) from document stream.`,
    });
  }

  // === Phase 3: Format-specific repair ===
  const ext = signature.extension?.toLowerCase() || '';
  const mime = signature.mime || '';
  const isJson = mime === 'application/json' || ext === 'json' ||
                 text.trim().startsWith('{') || text.trim().startsWith('[');
  const isXmlHtml = mime === 'text/xml' || mime === 'text/html' ||
                    ext === 'xml' || ext === 'html' || ext === 'htm' ||
                    text.trim().startsWith('<');
  const isCsv = ext === 'csv' || mime === 'text/csv';

  if (isJson) {
    const jsonRepair = repairJsonSyntax(text);
    if (jsonRepair.fixes > 0) {
      text = jsonRepair.reconstructedText;
      fixesCount += jsonRepair.fixes;
      logs.push(...jsonRepair.logs);
      confidenceScore = 95;
    } else {
      logs.push({
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleTimeString(),
        type: 'info',
        message: 'JSON Structure verified syntactically valid.',
      });
    }
  } else if (isXmlHtml) {
    const xmlRepair = repairXmlStructure(text, ext);
    if (xmlRepair.fixes > 0) {
      text = xmlRepair.reconstructedText;
      fixesCount += xmlRepair.fixes;
      logs.push(...xmlRepair.logs);
    }
  } else if (isCsv) {
    const csvRepair = repairCsvStructure(text);
    if (csvRepair.fixes > 0) {
      text = csvRepair.reconstructedText;
      fixesCount += csvRepair.fixes;
      logs.push(...csvRepair.logs);
    }
  }

  // === Phase 4: Line ending normalization ===
  if (text.includes('\r\n') && text.includes('\n') && !text.includes('\r\n')) {
    // Mixed line endings
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    fixesCount++;
    logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'repair',
      message: 'Line Ending Normalization: Unified mixed CR/LF/CRLF line endings to LF.',
    });
  }

  // === Phase 5: Recover text that was lost in binary garbage ===
  if (text.trim().length === 0 && buffer.length > 0) {
    // The entire file was binary garbage - try harder extraction
    text = bruteForceTextExtraction(buffer);
    if (text.length > 0) {
      fixesCount += 2;
      logs.push({
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleTimeString(),
        type: 'repair',
        message: `Deep Text Recovery: Extracted ${text.length} characters of readable text from corrupted binary data using pattern analysis.`,
      });
      confidenceScore = 70;
    } else {
      text = `[Cypher Recovery Report]\n\nOriginal file size: ${buffer.length} bytes\nRecoverable text content: None found\nFile was entirely binary corrupted data.\n\nReconstruction Date: ${new Date().toLocaleString()}`;
      fixesCount++;
      confidenceScore = 50;
      logs.push({
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleTimeString(),
        type: 'warning',
        message: 'No recoverable text content found in the corrupted file. Generated recovery report.',
      });
    }
  }

  if (text !== originalText && fixesCount === 0) {
    fixesCount = 1;
  }

  const encoder = new TextEncoder();
  const reconstructedBytes = encoder.encode(text);

  return {
    reconstructedBytes,
    logs,
    fixesCount,
    confidenceScore: Math.min(100, Math.max(50, confidenceScore + fixesCount * 3)),
  };
}

/**
 * Extract readable text from binary buffer, handling encoding issues
 */
function extractReadableText(buffer: Uint8Array): string {
  // Try UTF-8 first
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(buffer);
  } catch {
    // UTF-8 failed - use non-fatal mode
  }

  // Non-fatal UTF-8
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let text = decoder.decode(buffer);

  // Check if result looks like text (>60% printable)
  let printable = 0;
  for (let i = 0; i < Math.min(text.length, 1000); i++) {
    const c = text.charCodeAt(i);
    if ((c >= 32 && c <= 126) || c === 10 || c === 13 || c === 9 || (c >= 128 && c <= 65535)) {
      printable++;
    }
  }

  const sampleLen = Math.min(text.length, 1000);
  if (sampleLen > 0 && printable / sampleLen < 0.5) {
    // Mostly binary - try to extract readable portions
    text = bruteForceTextExtraction(buffer);
  }

  return text;
}

/**
 * Brute-force extraction of readable ASCII/UTF-8 sequences from binary data
 */
function bruteForceTextExtraction(buffer: Uint8Array): string {
  const parts: string[] = [];
  let currentRun = '';

  for (let i = 0; i < buffer.length; i++) {
    const b = buffer[i];
    if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9) {
      currentRun += String.fromCharCode(b);
    } else {
      if (currentRun.trim().length >= 4) {
        parts.push(currentRun);
      }
      currentRun = '';
    }
  }

  if (currentRun.trim().length >= 4) {
    parts.push(currentRun);
  }

  return parts.join('\n');
}

/**
 * Deep JSON syntax repair engine
 */
function repairJsonSyntax(raw: string): { reconstructedText: string; fixes: number; logs: RepairLog[] } {
  const logs: RepairLog[] = [];
  let fixes = 0;
  let text = raw.trim();

  // Quick validation
  try {
    JSON.parse(text);
    return { reconstructedText: text, fixes: 0, logs: [] };
  } catch {
    // Needs repair
  }

  // === Fix 1: Remove JavaScript-style comments ===
  const commentRegex = /\/\/.*?$/gm;
  const blockCommentRegex = /\/\*[\s\S]*?\*\//g;
  if (commentRegex.test(text) || blockCommentRegex.test(text)) {
    text = text.replace(commentRegex, '').replace(blockCommentRegex, '');
    fixes++;
    logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'repair',
      message: 'JSON Comment Stripping: Removed non-standard JavaScript comments from JSON stream.',
    });
  }

  // === Fix 2: Convert single quotes to double quotes ===
  // More sophisticated approach: track string boundaries
  let result = '';
  let inString = false;
  let stringChar = '';
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      result += ch;
      escaped = true;
      continue;
    }

    if (!inString) {
      if (ch === "'") {
        result += '"';
        inString = true;
        stringChar = "'";
        if (fixes === 0 || !logs.some(l => l.message.includes('single quotes'))) {
          fixes++;
          logs.push({
            id: crypto.randomUUID(),
            timestamp: new Date().toLocaleTimeString(),
            type: 'repair',
            message: 'JSON Quote Normalization: Converted single-quoted strings to standard double-quoted JSON strings.',
          });
        }
        continue;
      } else if (ch === '"') {
        result += ch;
        inString = true;
        stringChar = '"';
        continue;
      }
    } else {
      if (ch === stringChar) {
        result += '"';
        inString = false;
        continue;
      }
      // Escape unescaped double quotes inside single-quoted strings
      if (stringChar === "'" && ch === '"') {
        result += '\\"';
        continue;
      }
    }

    result += ch;
  }
  text = result;

  // === Fix 3: Quote unquoted keys ===
  const unquotedKeyRegex = /(?<=[{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*:)/g;
  const beforeUnquoted = text;
  text = text.replace(unquotedKeyRegex, '"$1"');
  if (text !== beforeUnquoted) {
    fixes++;
    logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'repair',
      message: 'JSON Key Quoting: Restored double quotes around unquoted identifier keys.',
    });
  }

  // === Fix 4: Remove trailing commas ===
  const trailingCommaRegex = /,\s*([}\]])/g;
  const beforeTrailing = text;
  text = text.replace(trailingCommaRegex, '$1');
  if (text !== beforeTrailing) {
    fixes++;
    logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'repair',
      message: 'JSON Trailing Comma Cleansing: Stripped illegal trailing commas before closing brackets.',
    });
  }

  // === Fix 5: Add missing commas between elements ===
  // Pattern: "value"\n"key" or "value"\n{ or ]\n[
  text = text.replace(/("|\d|true|false|null)\s*\n\s*(")/g, '$1,\n  $2');
  text = text.replace(/("})\s*\n\s*(")/g, '$1,\n  $2');

  // === Fix 6: Balance brackets and braces ===
  let braceDepth = 0;
  let bracketDepth = 0;
  inString = false;
  escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (!inString) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
      else if (ch === '[') bracketDepth++;
      else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    }
  }

  if (inString) {
    text += '"';
    fixes++;
    logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'repair',
      message: 'JSON String Closure: Closed dangling unclosed string literal at file boundary.',
    });
  }

  if (bracketDepth > 0 || braceDepth > 0) {
    // Remove any trailing comma before closing
    text = text.trimEnd();
    if (text.endsWith(',')) {
      text = text.slice(0, -1);
    }
    let suffix = '';
    for (let i = 0; i < bracketDepth; i++) suffix += ']';
    for (let i = 0; i < braceDepth; i++) suffix += '}';
    text += suffix;
    fixes++;
    logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'repair',
      message: `JSON Structural Balancing: Appended ${bracketDepth + braceDepth} missing closing token(s): "${suffix}".`,
    });
  }

  // === Fix 7: Replace undefined/NaN with null ===
  text = text.replace(/:\s*undefined/g, ': null');
  text = text.replace(/:\s*NaN/g, ': null');

  // === Final validation and pretty-print ===
  try {
    const parsed = JSON.parse(text);
    text = JSON.stringify(parsed, null, 2);
    logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'success',
      message: 'JSON Validation Passed: Repaired JSON parsed successfully and formatted into pretty-printed output.',
    });
    fixes++;
  } catch {
    logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'warning',
      message: 'JSON Best-Effort: Applied all available repairs. Some structural issues may remain.',
    });
  }

  return { reconstructedText: text, fixes, logs };
}

/**
 * XML/HTML structure repair engine
 */
function repairXmlStructure(raw: string, ext: string): { reconstructedText: string; fixes: number; logs: RepairLog[] } {
  const logs: RepairLog[] = [];
  let fixes = 0;
  let text = raw;

  // Add XML declaration if missing
  if (ext === 'xml' && !text.trim().startsWith('<?xml')) {
    text = '<?xml version="1.0" encoding="UTF-8"?>\n' + text;
    fixes++;
    logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'repair',
      message: 'XML Header Restored: Injected <?xml version="1.0"?> declaration signature.',
    });
  }

  // Add HTML doctype if missing
  if ((ext === 'html' || ext === 'htm') && !text.trim().toLowerCase().startsWith('<!doctype')) {
    text = '<!DOCTYPE html>\n' + text;
    fixes++;
    logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'repair',
      message: 'HTML DOCTYPE Restored: Injected <!DOCTYPE html> declaration.',
    });
  }

  // Fix unclosed tags
  const openTags: string[] = [];
  const selfClosing = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']);
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*\/?>/g;
  let tagMatch;

  while ((tagMatch = tagRegex.exec(text)) !== null) {
    const fullTag = tagMatch[0];
    const tagName = tagMatch[1].toLowerCase();

    if (selfClosing.has(tagName) || fullTag.endsWith('/>')) continue;

    if (fullTag.startsWith('</')) {
      // Closing tag
      const lastOpen = openTags.lastIndexOf(tagName);
      if (lastOpen >= 0) {
        openTags.splice(lastOpen, 1);
      }
    } else {
      // Opening tag
      openTags.push(tagName);
    }
  }

  // Close unclosed tags
  if (openTags.length > 0) {
    const closingTags = openTags.reverse().map(t => `</${t}>`).join('\n');
    text += '\n' + closingTags;
    fixes++;
    logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'repair',
      message: `XML/HTML Tag Balancing: Closed ${openTags.length} unclosed tag(s): ${openTags.map(t => `<${t}>`).join(', ')}.`,
    });
  }

  // Fix broken attributes (missing quotes)
  const brokenAttrRegex = /(\s[a-zA-Z-]+)=([^"'\s>][^\s>]*)/g;
  const beforeAttr = text;
  text = text.replace(brokenAttrRegex, '$1="$2"');
  if (text !== beforeAttr) {
    fixes++;
    logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'repair',
      message: 'HTML/XML Attribute Quoting: Added missing quotes around unquoted attribute values.',
    });
  }

  return { reconstructedText: text, fixes, logs };
}

/**
 * CSV structure repair engine
 */
function repairCsvStructure(raw: string): { reconstructedText: string; fixes: number; logs: RepairLog[] } {
  const logs: RepairLog[] = [];
  let fixes = 0;
  let text = raw;

  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return { reconstructedText: text, fixes: 0, logs: [] };

  // Detect delimiter
  const delimiters = [',', '\t', ';', '|'];
  let bestDelimiter = ',';
  let bestConsistency = 0;

  for (const delim of delimiters) {
    const counts = lines.slice(0, Math.min(10, lines.length)).map(l => l.split(delim).length);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    if (avg > 1) {
      const variance = counts.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / counts.length;
      const consistency = avg / (1 + variance);
      if (consistency > bestConsistency) {
        bestConsistency = consistency;
        bestDelimiter = delim;
      }
    }
  }

  // Count columns in header
  const headerCols = lines[0].split(bestDelimiter).length;

  // Fix rows with wrong number of columns
  let fixedRows = 0;
  const repairedLines = lines.map((line) => {
    const cols = line.split(bestDelimiter);
    if (cols.length === headerCols) return line;

    if (cols.length < headerCols) {
      // Add empty columns
      while (cols.length < headerCols) cols.push('');
      fixedRows++;
      return cols.join(bestDelimiter);
    } else {
      // Too many columns - try to merge extras (likely unescaped delimiters in values)
      while (cols.length > headerCols && cols.length > 1) {
        // Merge the last two columns
        const last = cols.pop()!;
        cols[cols.length - 1] = `"${cols[cols.length - 1]}${bestDelimiter}${last}"`;
      }
      fixedRows++;
      return cols.join(bestDelimiter);
    }
  });

  if (fixedRows > 0) {
    text = repairedLines.join('\n');
    fixes++;
    logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'repair',
      message: `CSV Structure Repair: Fixed column count in ${fixedRows} row(s) to match ${headerCols}-column header (delimiter: "${bestDelimiter === '\t' ? 'TAB' : bestDelimiter}").`,
    });
  }

  // Fix unbalanced quotes
  const unbalancedQuoteLines: number[] = [];
  const finalLines = text.split('\n').map((line, idx) => {
    const quoteCount = (line.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      unbalancedQuoteLines.push(idx + 1);
      return line + '"';
    }
    return line;
  });

  if (unbalancedQuoteLines.length > 0) {
    text = finalLines.join('\n');
    fixes++;
    logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'repair',
      message: `CSV Quote Balancing: Fixed unbalanced quotes on ${unbalancedQuoteLines.length} line(s).`,
    });
  }

  return { reconstructedText: text, fixes, logs };
}
