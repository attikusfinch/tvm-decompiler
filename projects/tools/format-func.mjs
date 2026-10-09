import assert from 'node:assert/strict';

// A conservative layout pass for recovered FunC. Non-whitespace tokens,
// string suffixes, assembler strings and nested comments stay byte-identical.
export function tokens(source) {
  const result = [];
  for (let i = 0; i < source.length;) {
    const start = i;
    if (/\s/.test(source[i])) { i++; continue; }
    if (source.startsWith(';;', i)) {
      while (i < source.length && source[i] !== '\n') i++;
    } else if (source.startsWith('{-', i)) {
      i += 2;
      let depth = 1;
      while (i < source.length && depth) {
        if (source.startsWith('{-', i)) { depth++; i += 2; }
        else if (source.startsWith('-}', i)) { depth--; i += 2; }
        else i++;
      }
      assert.equal(depth, 0, 'Unterminated FunC comment');
    } else if (source[i] === '"' || source[i] === '`') {
      const quote = source[i++];
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') i++;
        i++;
      }
      assert.ok(i < source.length, 'Unterminated FunC string');
      i++;
      if (quote === '"') while (/[a-zA-Z]/.test(source[i] ?? '')) i++;
    } else if ('(){};,'.includes(source[i])) i++;
    else {
      while (i < source.length && !/[\s(){};,"`]/.test(source[i]) &&
        !source.startsWith(';;', i) && !source.startsWith('{-', i)) i++;
    }
    result.push(source.slice(start, i));
  }
  return result;
}

export function formatFunc(source) {
  const input = tokens(source);
  const lines = [];
  let line = '', depth = 0, continuation = false;
  const flush = () => {
    if (line.trim()) lines.push('    '.repeat(depth + Number(continuation)) + line.trim());
    line = '';
  };
  const put = (value, space = true) => {
    if (space && line && !line.endsWith(' ')) line += ' ';
    line += value;
  };
  for (let i = 0; i < input.length; i++) {
    const t = input[i], previous = input[i - 1], next = input[i + 1];
    if (t.startsWith(';;') || t.startsWith('{-')) { flush(); put(t, false); flush(); continue; }
    if (t === '{') { put(t); flush(); depth++; continuation = false; }
    else if (t === '}') {
      flush(); depth--; continuation = false; assert.ok(depth >= 0);
      put(t, false);
      if (next !== 'else' && next !== 'elseif' && next !== ';') {
        flush(); if (!depth) lines.push('');
      }
    } else if (t === ';') {
      put(t, false); flush(); continuation = false;
    } else if (t === ',') {
      put(t, false);
      if (line.length + 4 * depth > 90) { flush(); continuation = true; }
      else line += ' ';
    } else if (t === '(') put(t, /^(if|elseif|while|until|repeat|return|catch|asm|[-=<>+*/|&^]+)$/.test(previous ?? ''));
    else if (t === ')') put(t, false);
    else {
      if (t.startsWith('.') && line.length + t.length + depth * 4 > 90) { flush(); continuation = true; }
      put(t, previous !== '(' && !(t.startsWith('.') && previous === ')'));
    }
  }
  flush();
  assert.equal(depth, 0);
  const formatted = lines.join('\n').trimEnd() + '\n';
  assert.deepEqual(tokens(formatted), input, 'Formatting must not change FunC tokens');
  return formatted;
}
