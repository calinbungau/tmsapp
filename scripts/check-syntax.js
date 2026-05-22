import fs from 'fs';

const content = fs.readFileSync('app/admin/tms/orders/new/page.tsx', 'utf-8');
const lines = content.split('\n');

// Track brace/paren/bracket nesting, ignoring strings and comments
let braces = 0, parens = 0, brackets = 0;
let inString = false, stringChar = '', inTemplate = false;
let inLineComment = false, inBlockComment = false;
let jsxDepth = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  inLineComment = false;
  
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    const next = line[j + 1] || '';
    const prev = j > 0 ? line[j - 1] : '';
    
    // Skip block comments
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; j++; }
      continue;
    }
    
    // Skip line comments
    if (inLineComment) continue;
    
    // Skip strings
    if (inString) {
      if (ch === '\\') { j++; continue; }
      if (ch === stringChar) { inString = false; }
      continue;
    }
    
    // Skip template literals
    if (inTemplate) {
      if (ch === '\\') { j++; continue; }
      if (ch === '`') { inTemplate = false; }
      continue;
    }
    
    // Detect comment starts
    if (ch === '/' && next === '/') { inLineComment = true; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; j++; continue; }
    
    // Detect string starts
    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }
    if (ch === '`') { inTemplate = true; continue; }
    
    // Track nesting
    if (ch === '{') braces++;
    if (ch === '}') braces--;
    if (ch === '(') parens++;
    if (ch === ')') parens--;
    if (ch === '[') brackets++;
    if (ch === ']') brackets--;
    
    if (braces < 0 || parens < 0 || brackets < 0) {
      console.log(`[v0] MISMATCH at line ${i + 1}: braces=${braces} parens=${parens} brackets=${brackets}`);
      console.log(`[v0] Line content: ${line.trim()}`);
    }
  }
  
  // Log at key boundaries
  if (line.includes('renderOrderForm') || line.includes('renderExecutionMode') || line.includes('renderDetailsMode') || line.includes('MAIN RETURN')) {
    console.log(`[v0] Line ${i + 1}: braces=${braces} parens=${parens} brackets=${brackets} | ${line.trim()}`);
  }
}

console.log(`[v0] Final: braces=${braces} parens=${parens} brackets=${brackets}`);
if (braces !== 0 || parens !== 0 || brackets !== 0) {
  console.log('[v0] FILE HAS MISMATCHED BRACKETS!');
}

// Also check for semicolons right after arrow functions in potentially bad spots
for (let i = 0; i < lines.length; i++) {
  const trimmed = lines[i].trim();
  if (trimmed === '};' && i + 1 < lines.length) {
    const nextNonEmpty = lines.slice(i + 1).find(l => l.trim().length > 0);
    if (nextNonEmpty && nextNonEmpty.trim().startsWith('//')) {
      // fine
    }
  }
  // Check for stray semicolons inside JSX
  if (trimmed === ';') {
    console.log(`[v0] STRAY SEMICOLON at line ${i + 1}`);
  }
}
