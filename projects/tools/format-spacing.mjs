// Add vertical space to already indented source. Never inspect string/comment
// contents as code: in particular, multiline ASM is an opaque compiler input.
function sourceLines(source, language) {
  let quote = '', commentDepth = 0;
  const commentStart = language === 'func' ? '{-' : '/*';
  const commentEnd = language === 'func' ? '-}' : '*/';
  const lineComment = language === 'func' ? ';;' : '//';
  return source.replaceAll('\r\n', '\n').split('\n').map(text => {
    const opaque = Boolean(quote || commentDepth);
    let code = '';
    for (let i = 0; i < text.length;) {
      if (quote) {
        if (text.startsWith(quote, i)) { i += quote.length; quote = ''; }
        else if (text[i] === '\\' && quote.length === 1) i += 2;
        else i++;
        code += ' ';
      } else if (commentDepth) {
        if (text.startsWith(commentStart, i)) { commentDepth++; i += 2; }
        else if (text.startsWith(commentEnd, i)) { commentDepth--; i += 2; }
        else i++;
        code += ' ';
      } else if (text.startsWith(lineComment, i)) break;
      else if (text.startsWith(commentStart, i)) { commentDepth++; i += 2; }
      else if (text[i] === '"' || text[i] === '`') {
        quote = language === 'tolk' && text.startsWith('"""', i) ? '"""' : text[i];
        i += quote.length;
        code += 'literal';
      } else code += text[i++];
    }
    return {text, code: code.trim(), opaque};
  });
}

export function formatSpacing(source, language) {
  const lines = sourceLines(source, language);
  const gaps = new Set();
  let braces = 0, parentheses = 0, brackets = 0, previous = '', topGroup = '';
  const validation = code => /^(assert\b|throw_(?:unless|if)\s*\()/.test(code);
  const completed = code => /[;}]$/.test(code);
  const control = code => /^(?:if|while|repeat|do|try|match)\b/.test(code);
  const terminal = code => /^(?:return|throw|break|continue)\b/.test(code);
  const effect = code => /^(?:contract\.setData|set_data|set_code|set_c3|sendRawMessage|send_raw_message|raw_reserve)\s*\(/.test(code);
  const newBuffer = code => /\b(?:beginParse|begin_parse|beginCell|begin_cell)\s*\(/.test(code) && /\b(?:var|val|slice|cell|builder)\b.*=/.test(code);
  const attached = line => !line.opaque && line.text.trim() &&
    (!line.code || line.code.startsWith('@')) && !line.text.includes('decompiled by');
  const separate = index => {
    // Keep documentation and annotations attached to the following declaration.
    while (index > 0 && attached(lines[index - 1])) index--;
    if (index > 0) gaps.add(index);
  };

  // The attribution is a file header, not documentation of the first import.
  if (lines[0]?.text.includes('decompiled by')) {
    let end = 1;
    while (end < lines.length && !lines[end].code && lines[end].text.trim()) end++;
    if (end < lines.length) gaps.add(end);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], code = line.code;
    if (line.opaque || !code) continue;
    const atBoundary = !parentheses && !brackets;
    const topDeclaration = language === 'func' || /^(?:import|const|global|fun|get\s+fun|struct|type|enum|tolk)\b/.test(code);
    if (atBoundary && !braces && topDeclaration && /^\S/.test(line.text) && !code.startsWith('@')) {
      const group = /^(?:import\b|#include\b)/.test(code) ? 'import' :
        /^#pragma\b/.test(code) ? 'pragma' : /^global\b/.test(code) ? 'global' :
        /^const\b/.test(code) ? 'const' : 'declaration';
      if (topGroup && (group !== topGroup || group === 'declaration')) separate(i);
      topGroup = group;
    } else if (atBoundary && braces && line.text.search(/\S/) === braces * 4 && completed(previous) &&
      !/^(?:[}\]),.;:?]|else\b|elseif\b|catch\b|until\b)/.test(code)) {
      // A do/while tail belongs to its closing brace, just like else/catch.
      const whileTail = previous.endsWith('}') && /^while\b.*;\s*$/.test(code);
      if (!whileTail && (control(code) || terminal(code) || previous.endsWith('}') ||
        validation(code) !== validation(previous) || newBuffer(code) ||
        (effect(code) && !effect(previous)) || /\.(?:assertEnd|end_parse)\s*\([^)]*\);$/.test(previous))) {
        separate(i);
      }
    }
    for (const char of code) {
      if (char === '{') braces++;
      else if (char === '}') braces--;
      else if (char === '(') parentheses++;
      else if (char === ')') parentheses--;
      else if (char === '[') brackets++;
      else if (char === ']') brackets--;
    }
    previous = code;
  }
  const output = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].opaque && !lines[i].text.trim() && output.length && !output.at(-1).trim()) continue;
    if (gaps.has(i) && lines[i].text.trim() && output.length && output.at(-1).trim()) output.push('');
    output.push(lines[i].text);
  }
  return output.join('\n');
}
