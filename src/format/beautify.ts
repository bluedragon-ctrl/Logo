// ── beautify(src) ─────────────────────────────────────────────────────────────
// Pure function — string → string, no globals read or written, no interpreter
// functions called. A bug here can only produce oddly-formatted code; it cannot
// corrupt turtle state, the trail, or the token pipeline.
//
// What it does:
//   • Uppercase all keywords and variable names
//   • Indent TO…END bodies by INDEN (2 spaces)
//   • Indent expanded [ body ] by INDEN
//   • Inline short blocks: if a block has ≤ INLINE_THRESHOLD non-bracket tokens
//     AND contains no nested [ → keep it on one line: REPEAT 4 [ FD 100 RT 90 ]
//     Blocks that exceed the threshold, or contain nested [, always expand.
//   • Preserve trailing ; comments on their original lines
//   • Re-inject comment-only lines at their original relative positions
//   • Strip blank lines between plain statements; preserve one blank line after
//     END or ] at the top level (procedure/block separators only)
//
// Four-pass architecture (each pass is O(n)):
//   Pass 1  rawLines[]   split every source line into {code, comment, blank}
//                        so the comment text survives the lexing step unchanged.
//   Pass 2  stream[]     lex non-comment code into {tok, li} pairs.
//                        tok is already uppercased here — all downstream
//                        comparisons are direct string equality, no allocation.
//                        li = rawLines index so Pass 3 can track line advances.
//   Pass 3  outLines[]   walk stream, emit {toks[], sourceLi, depth} records.
//                        ensureLine(li) flushes the accumulating line whenever
//                        the source line index advances AND we are not inside an
//                        inline block (inlineDepth === 0) — this is what preserves
//                        the per-statement line structure without needing to know
//                        which tokens are statement boundaries.
//   Pass 4  final[]      render outLines to strings, interleave comment-only lines,
//                        gate blank-line injection on END/] (see below).
//
// Key invariants:
//   • depth >= 0 always (Math.max(0, depth-1) guards against unmatched ] or END)
//   • inlineDepth counts nesting of inline-block collection loops; when > 0,
//     ensureLine() does not flush, so all inline-block tokens land on one line
//   • shouldInline() scans forward from '[' without mutating i — pure lookahead
//   • inline-mode collection has its own bracket-depth counter (d2) separate from
//     the outer depth, so nested inline blocks are counted correctly
//
interface OutLine { toks: string[]; sourceLi: number }
const INLINE_THRESHOLD = 8; // blocks with ≤ this many non-bracket tokens stay inline

export function beautify(src: string): string {
  // Same token classes as the interpreter's tokenize(), except '~' stays glued to
  // the operand that follows it ('~100', '~:X') so it can be rendered back as '-100'.
  const TOK   = /(?:\d+\.?\d*|\.\d+)[eE][+-]\d+|>=|<=|!=|<>|[\[\]()+\-*\/=><]|[^\s\[\]()+\-*\/=><]+/g;
  const INDEN = '  '; // 2-space indent unit

  // ── Pass 1: split each source line into code and comment ──────────────────
  // ';' starts a comment that extends to end of line (Logo convention).
  // blank=true for lines that are entirely whitespace (used in Pass 4 to decide
  // whether a gap between tokens should produce a blank output line).
  const rawLines = src.split('\n').map(line => {
    const semi = line.indexOf(';');
    if(semi === -1) return { code: line, comment: '', blank: !line.trim() };
    return { code: line.slice(0, semi), comment: line.slice(semi), blank: false };
  });

  // ── Pass 2: lex into a flat token stream tagged with source line index ─────
  // Each entry: { tok: string (uppercased), li: rawLines index }
  // Uppercasing here means every downstream comparison is a direct === check.
  // Variables (:x) are uppercased too; "quoted words keep their case, like tokenize().
  const stream: { tok: string; li: number }[] = [];
  rawLines.forEach(({ code }, li) => {
    // Without this, '-100' in 'SETPOS 100 -100' would lex as '-' + '100' and
    // beautify would output 'SETPOS 100 - 100' (which means subtraction).
    // Mirrors tokenize(): '-' after start/space/[/( and glued to a digit, '.', ':', '('
    // or letter is a negative sign. "Quoted words keep their case (LABEL "Hello).
    const processed = code.replace(/(^|[\s\[(])-(?=[\d.:(A-Za-z])/g, '$1~');
    const toks = processed.match(TOK);
    if(toks) toks.forEach(t => stream.push({ tok: t.startsWith('"') ? t : t.toUpperCase(), li }));
  });

  // shouldInline(idx): pure lookahead from stream[idx] which must be '['.
  // Returns true iff the block has no nested '[' AND ≤ INLINE_THRESHOLD
  // non-bracket tokens. Both conditions must hold:
  //   • nested [ → always expand, regardless of total token count
  //   • too many tokens → always expand, even if no nesting
  // Scanning stops at the matching ']' (depth back to 0).
  function shouldInline(idx: number): boolean {
    let depth = 0, count = 0;
    for(let i = idx; i < stream.length; i++) {
      const t = stream[i].tok;
      if(t === '[') { if(depth > 0) return false; depth++; } // second [ → stop, always expand
      else if(t === ']') { depth--; if(depth === 0) return count <= INLINE_THRESHOLD; }
      else count++;
    }
    return false; // unclosed block — valid code would not reach here
  }

  // ── Pass 3: emit output line records ──────────────────────────────────────
  // outLines entries: { toks: string[], sourceLi: number, depth: number }
  // depth is captured at flush time so each line renders at the right indent.
  const outLines: (OutLine & { depth: number })[] = [];
  let depth = 0;
  let cur: OutLine | null = null;       // accumulator for the current output line: { toks[], sourceLi }
  let inlineDepth = 0;  // incremented while collecting an inline block; > 0 suppresses ensureLine flush

  // flushLine: commit cur (if non-empty) to outLines at current depth, then clear cur.
  // Called before any operation that must start a fresh line (TO, END, expanded [, ]).
  function flushLine() {
    if(cur && cur.toks.length) { outLines.push({ toks: cur.toks, sourceLi: cur.sourceLi, depth }); }
    cur = null;
  }

  // ensureLine(li): guarantee cur is open for token li; returns it.
  // If cur is null, open a new one tagged with li.
  // If li has advanced past cur.sourceLi and we are NOT inside an inline block,
  // flush first — this is the mechanism that gives each source statement its own
  // output line without the formatter needing to know which tokens are statements.
  // Inside an inline block (inlineDepth > 0) the flush is suppressed so the
  // entire block accumulates on one line despite spanning multiple source lines.
  function ensureLine(li: number): OutLine {
    if(!cur) return (cur = { toks: [], sourceLi: li });
    if(inlineDepth === 0 && li > cur.sourceLi && cur.toks.length) { flushLine(); cur = { toks: [], sourceLi: li }; }
    return cur;
  }

  let i = 0;
  while(i < stream.length) {
    const { tok, li } = stream[i];

    // TO name :p1 :p2 … ────────────────────────────────────────────────────
    // Always its own line regardless of what preceded it on the source line.
    // After flushing the TO line, depth increases so the procedure body is
    // indented. Parameters are tokens starting with ':' or '"'
    if(tok === 'TO') {
      flushLine();
      cur = { toks: ['TO'], sourceLi: li };
      i++;
      if(i < stream.length && stream[i].tok !== '[') cur.toks.push(stream[i++].tok); // proc name
      while(i < stream.length && (stream[i].tok.startsWith(':') || stream[i].tok.startsWith('"')))
        cur.toks.push(stream[i++].tok); // collect :param tokens
      flushLine();
      depth++;
      continue;
    }

    // END ───────────────────────────────────────────────────────────────────
    // Flush any partial line (shouldn't normally have content but guards it),
    // then dedent before emitting END so it aligns with its matching TO.
    if(tok === 'END') {
      flushLine();
      depth = Math.max(0, depth - 1); // Math.max guards against unmatched END
      cur = { toks: ['END'], sourceLi: li };
      flushLine();
      i++;
      continue;
    }

    // '[' — inline or expand ────────────────────────────────────────────────
    if(tok === '[') {
      if(shouldInline(i)) {
        // Inline path: bump inlineDepth to suppress ensureLine flushes, then
        // consume tokens up to the matching ']' directly into cur.toks.
        // d2 tracks bracket nesting within this inline block only.
        const line = ensureLine(li);
        inlineDepth++;
        let d2 = 0;
        while(i < stream.length) {
          const t2 = stream[i++].tok;
          line.toks.push(t2);
          if(t2 === '[') d2++;
          else if(t2 === ']') { d2--; if(d2 === 0) break; }
        }
        inlineDepth--;
        // After collecting an inline block, flush if the very next token is
        // neither '[' nor ']'. This handles the case where we are inside an
        // expanded block and just consumed an inline sub-block — remaining tokens
        // at this depth level (e.g. RT 90 after REPEAT 4 [ FD 10 RT 90 ]) must
        // land on their own output line, not be appended to the inline block line.
        // We do NOT flush before '[' because IFELSE cond [A] [B] needs both
        // branches to stay on the same statement line.
        // We do NOT flush before ']' because that closes the outer expanded block.
        if(i < stream.length && stream[i].tok !== '[' && stream[i].tok !== ']') {
          flushLine();
        }
      } else {
        // Expanded path: '[' ends the current line (e.g. "REPEAT 4 ["),
        // then depth increases so the block body is indented on subsequent lines.
        ensureLine(li).toks.push('[');
        flushLine();
        depth++;
        i++;
      }
      continue;
    }

    // ']' ────────────────────────────────────────────────────────────────────
    // Only reached in expanded mode — inline mode consumes its own ']' above.
    // Flush the last body line, dedent, emit ']\ on its own line, flush again.
    if(tok === ']') {
      flushLine();
      depth = Math.max(0, depth - 1); // Math.max guards against unmatched ]
      cur = { toks: [']'], sourceLi: li };
      flushLine();
      i++;
      continue;
    }

    // Regular token ─────────────────────────────────────────────────────────
    // ensureLine handles the line-advance flush; just push the token.
    ensureLine(li).toks.push(tok);
    i++;
  }
  flushLine(); // flush any remaining tokens after last source line

  // ── Pass 4: render, attach comments, inject blank separators ──────────────
  // Separate inline comments (trailing on a code line) from comment-only lines.
  // inlineComments keyed by sourceLi so they can be appended to the matching
  // output line. commentOnlyLines ordered by li for sequential injection.
  const inlineComments: Record<number, string> = {}; // sourceLi → comment string
  const commentOnlyLines: { li: number; comment: string }[] = []; // { li, comment } in source order
  rawLines.forEach(({ code, comment }, li) => {
    if(!comment) return;
    if(code.trim()) inlineComments[li] = comment; // trailing comment on a code line
    else            commentOnlyLines.push({ li, comment }); // pure comment line
  });

  // joinToks: tokens → text. '~x' (negative sign) renders as '-x'; a bare '~' (before
  // '(') renders as '-' glued to the next token; no space after '(' or before ')'.
  function joinToks(toks: string[]): string {
    let out = '';
    toks.forEach((t, k) => {
      const prev = toks[k - 1];
      const glue = k === 0 || prev === '(' || prev === '~' || t === ')';
      out += (glue ? '' : ' ') + (t.startsWith('~') ? '-' + t.slice(1) : t);
    });
    return out;
  }

  // Render each outLine to a string, appending any trailing inline comment.
  // Two spaces before the comment (Logo convention: "; comment" after code).
  const withComments = outLines.map(ol => ({
    text:     INDEN.repeat(ol.depth) + joinToks(ol.toks)
              + (inlineComments[ol.sourceLi] ? '  ' + inlineComments[ol.sourceLi] : ''),
    sourceLi: ol.sourceLi,
    depth:    ol.depth,
  }));

  // Walk withComments in order, interleaving:
  //   (a) comment-only lines that precede the current output line
  //   (b) a single blank line when the gap condition holds (see below)
  //   (c) the output line itself
  const final = [];
  let ci = 0;           // next commentOnlyLines entry to inject
  let prevSourceLi = -1;

  for(const ol of withComments) {
    // (a) inject comment-only lines whose source position precedes this output line
    while(ci < commentOnlyLines.length && commentOnlyLines[ci].li <= ol.sourceLi)
      final.push(commentOnlyLines[ci++].comment);

    // (b) blank-line gate: allow one blank line between output lines ONLY when:
    //   • there is a source gap (sourceLi jumped by > 1, meaning blank/comment lines existed)
    //   • we are at the top level (depth === 0) — blanks inside bodies are already
    //     suppressed because Pass 3 never emits them into outLines
    //   • the final[] array is non-empty (no leading blank at top of output)
    //   • the previous non-blank final[] line ends with END or ] — blank lines
    //     are structural separators between blocks, not padding between statements
    //   • at least one of those gap lines was actually blank in the source (not just comments)
    if(ol.sourceLi > prevSourceLi + 1 && ol.depth === 0 && final.length > 0) {
      const prev = final[final.length - 1].trimEnd();
      const lastTok = prev.split(/\s+/).pop(); // last token on the previous output line
      if((lastTok === 'END' || lastTok === ']') && prev !== '') {
        for(let li = prevSourceLi + 1; li < ol.sourceLi; li++) {
          if(rawLines[li] && rawLines[li].blank) { final.push(''); break; }
        }
      }
    }

    final.push(ol.text);
    prevSourceLi = ol.sourceLi;
  }
  // (a) continued: inject any comment-only lines that trail after all code
  while(ci < commentOnlyLines.length) final.push(commentOnlyLines[ci++].comment);

  // Strip trailing blank lines
  while(final.length > 0 && final[final.length - 1].trim() === '') final.pop();
  return final.join('\n');
}
