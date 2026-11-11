// ── Commands reference ────────────────────────────────────────────────────────
// The content of the Commands panel, as data. ui/reference-panel.ts renders it
// into one aligned, searchable table; tests/unit/reference.test.ts checks that
// every built-in word of the interpreter is listed here and that every word
// listed here exists.
//
// syntax: how the command is written. UPPERCASE words are Logo words (they are
//         what the coverage test reads); lowercase words are the inputs.
// desc:   what it does, in plain words, starting lowercase.
// try:    optional runnable line, put into direct mode by a click.

export interface RefEntry { syntax: string; desc: string; try?: string }
export interface RefSection { title: string; entries: RefEntry[] }

export const REFERENCE: RefSection[] = [
  { title: 'Motion', entries: [
    { syntax: 'FORWARD / FD n',       desc: 'move forward n steps', try: 'FD 100' },
    { syntax: 'BACK / BK n',          desc: 'move back n steps', try: 'BK 50' },
    { syntax: 'RIGHT / RT n',         desc: 'turn right n degrees', try: 'RT 90' },
    { syntax: 'LEFT / LT n',          desc: 'turn left n degrees', try: 'LT 45' },
    { syntax: 'SETHEADING / SETH n',  desc: 'face heading n (0 = up, 90 = right)', try: 'SETH 90' },
    { syntax: 'HOME',                 desc: 'go back to the centre, heading 0 (draws nothing)', try: 'HOME' },
    { syntax: 'SETPOS x y',           desc: 'move straight to x y (draws if the pen is down)', try: 'SETPOS 100 -50' },
    { syntax: 'SETXY x y',            desc: 'the same as SETPOS', try: 'SETXY -100 50' },
    { syntax: 'SETX x  /  SETY y',    desc: 'move straight to a new x / y; the other stays', try: 'SETX 120' },
    { syntax: 'XCOR / YCOR',          desc: 'the turtle\'s x / y position', try: 'PRINT XCOR' },
    { syntax: 'HEADING',              desc: 'the turtle\'s heading in degrees (0 to 359)', try: 'PRINT HEADING' },
    { syntax: 'TOWARDS x y',          desc: 'the heading that faces point x y', try: 'SETH TOWARDS 0 0' },
    { syntax: 'DISTANCE x y',         desc: 'the distance to point x y', try: 'PRINT DISTANCE 0 0' },
    { syntax: 'SCRWIDTH / SCRHEIGHT', desc: 'canvas width / height (the centre is 0 0)', try: 'PRINT SCRWIDTH' },
  ]},
  { title: 'Pen and drawing', entries: [
    { syntax: 'PENUP / PU',           desc: 'lift the pen: move without drawing', try: 'PU' },
    { syntax: 'PENDOWN / PD',         desc: 'put the pen down: draw when moving', try: 'PD' },
    { syntax: 'PENDOWN? / PD?',       desc: '1 if the pen is down, else 0', try: 'PRINT PD?' },
    { syntax: 'PENUP? / PU?',         desc: '1 if the pen is up, else 0', try: 'PRINT PU?' },
    { syntax: 'SETCOLOR / SC r g b',  desc: 'pen colour from red, green, blue (0 to 255 each)', try: 'SETCOLOR 200 50 50' },
    { syntax: 'SETCOLOR / SC name',   desc: 'pen colour by name, see Colours below', try: 'SETCOLOR BLUE' },
    { syntax: 'SETPC / SETPENCOLOR',  desc: 'other names for SETCOLOR', try: 'SETPC RED' },
    { syntax: 'SETWIDTH / SW n',      desc: 'pen width in pixels', try: 'SETWIDTH 4' },
    { syntax: 'SETPENSIZE n',         desc: 'the same as SETWIDTH', try: 'SETPENSIZE 2' },
    { syntax: 'PENSIZE',              desc: 'the pen width', try: 'PRINT PENSIZE' },
    { syntax: 'SETBG / SETBACKGROUND name', desc: 'canvas colour by name or r g b (CS keeps it)', try: 'SETBG NAVY' },
    { syntax: 'CIRCLE r',             desc: 'draw a circle of radius r, turning right', try: 'CIRCLE 50' },
    { syntax: 'ARC angle r',          desc: 'draw part of a circle: angle degrees, radius r, turning right', try: 'ARC 90 80' },
    { syntax: 'DOT',                  desc: 'a filled dot at the turtle (size = pen width)', try: 'DOT' },
    { syntax: 'DOT x y',              desc: 'a filled dot at x y; the turtle stays put', try: 'DOT 50 50' },
    { syntax: 'LABEL "word',          desc: 'write a word at the turtle (case kept)', try: 'LABEL "Hello' },
    { syntax: 'LABEL value',          desc: 'write a number at the turtle', try: 'LABEL 2 * 21' },
    { syntax: 'CLEARSCREEN / CS',     desc: 'clear the canvas and reset the turtle', try: 'CS' },
    { syntax: 'HIDETURTLE / HT',      desc: 'hide the turtle', try: 'HT' },
    { syntax: 'SHOWTURTLE / ST',      desc: 'show the turtle', try: 'ST' },
  ]},
  { title: 'Loops', entries: [
    { syntax: 'REPEAT n [ … ]',            desc: 'run the block n times', try: 'REPEAT 4 [ FD 80 RT 90 ]' },
    { syntax: 'REPCOUNT',                  desc: 'which time round REPEAT this is (1 to n)', try: 'REPEAT 3 [ PRINT REPCOUNT ]' },
    { syntax: 'REPCOUNTMAX',               desc: 'the n of the current REPEAT', try: 'REPEAT 3 [ PRINT REPCOUNTMAX ]' },
    { syntax: 'FOR :v start end [ … ]',    desc: 'count :v from start to end (step 1 or -1)', try: 'FOR :I 1 5 [ PRINT :I ]' },
    { syntax: 'FOR :v start end step [ … ]', desc: 'count with your own step', try: 'FOR :I 0 100 25 [ PRINT :I ]' },
    { syntax: 'FOREVER [ … ]',             desc: 'run the block again and again (BREAK or STOP leaves)', try: 'FOREVER [ FD 4 RT 10 IF REPCOUNT = 36 [ BREAK ] ]' },
    { syntax: 'WHILE [ cond ] [ … ]',      desc: 'run the block while the condition is true', try: 'MAKE :N 1 WHILE [ :N < 50 ] [ MAKE :N :N * 2 ] PRINT :N' },
    { syntax: 'BREAK',                     desc: 'leave the innermost loop now' },
    { syntax: 'CONTINUE',                  desc: 'skip to the next round of the innermost loop' },
  ]},
  { title: 'Decisions', entries: [
    { syntax: 'IF cond [ … ]',             desc: 'run the block if the condition is true', try: 'IF 3 > 2 [ PRINT "yes ]' },
    { syntax: 'IFELSE cond [ … ] [ … ]',   desc: 'run the first block if true, else the second', try: 'IFELSE 1 > 2 [ PRINT "yes ] [ PRINT "no ]' },
    { syntax: '> < = >= <= != <>',         desc: 'compare: 1 if true, 0 if false', try: 'PRINT 3 > 2' },
    { syntax: 'IFELSE cond [ a ] [ b ]',   desc: 'as a value: a if true, else b', try: 'PRINT IFELSE 3 > 2 [ 10 ] [ 20 ]' },
    { syntax: 'AND OR NOT',                desc: 'combine conditions (1 / 0); NOT covers a whole comparison', try: 'PRINT NOT 1 > 2' },
    { syntax: 'a AND b  /  a OR b',        desc: 'b is not worked out when a already decides', try: 'MAKE :X 0 PRINT :X != 0 AND 10 / :X > 1' },
  ]},
  { title: 'Procedures', entries: [
    { syntax: 'TO name :in1 :in2 … / END', desc: 'define a procedure with inputs; a call as the last step may repeat forever' },
    { syntax: 'STOP',                      desc: 'leave the current procedure now' },
    { syntax: 'OUTPUT / OP value',         desc: 'leave the procedure and give back a value' },
  ]},
  { title: 'Variables', entries: [
    { syntax: 'MAKE :x value',             desc: 'set x: updates an existing x, else creates a global one', try: 'MAKE :SIZE 50' },
    { syntax: 'MAKE "x value',             desc: 'the same as MAKE :x' },
    { syntax: ':x',                        desc: 'the value of x', try: 'MAKE :X 7 PRINT :X * 2' },
    { syntax: 'LOCALMAKE :x value',        desc: 'create x just for the current procedure' },
    { syntax: 'LOCAL :x :y …',             desc: 'declare variables just for the current procedure' },
  ]},
  { title: 'Console and time', entries: [
    { syntax: 'PRINT / PR value',          desc: 'show a value in the console', try: 'PRINT 2 + 3 * 4' },
    { syntax: 'PRINT "word',               desc: 'show a word in the console', try: 'PRINT "Hello' },
    { syntax: 'CLEARTEXT / CT',            desc: 'empty the console', try: 'CT' },
    { syntax: 'WAIT n',                    desc: 'pause for n seconds', try: 'WAIT 0.5' },
    { syntax: 'SPEED n',                   desc: 'animation speed: 0 (slowest) to 4 (instant)', try: 'SPEED 2' },
    { syntax: '; comment',                 desc: 'the rest of the line is ignored' },
  ]},
  { title: 'Maths', entries: [
    { syntax: '+ - * /',                   desc: '* and / before + and -, then left to right', try: 'PRINT 2 + 3 * 4' },
    { syntax: '( … )',                     desc: 'work this part out first', try: 'PRINT (2 + 3) * 4' },
    { syntax: '-5  -:x',                   desc: 'minus glued to a value is a negative sign', try: 'SETPOS 0 -100' },
    { syntax: 'a MOD b  /  MOD a b',       desc: 'the remainder of a divided by b', try: 'PRINT 17 MOD 5' },
    { syntax: 'PI',                        desc: '3.14159…', try: 'PRINT 2 * PI * 50' },
    { syntax: 'POWER a b',                 desc: 'a to the power b', try: 'PRINT POWER 2 10' },
    { syntax: 'MAX a b  /  MIN a b',       desc: 'the larger / smaller of two values', try: 'PRINT MAX 3 7' },
    { syntax: 'SQRT n',                    desc: 'square root', try: 'PRINT SQRT 2' },
    { syntax: 'ABS n',                     desc: 'n without its sign', try: 'PRINT ABS -5' },
    { syntax: 'INT n',                     desc: 'n with the fraction cut off', try: 'PRINT INT 3.7' },
    { syntax: 'ROUND n',                   desc: 'the nearest whole number', try: 'PRINT ROUND 3.5' },
    { syntax: 'FLOOR n  /  CEILING n',     desc: 'round down / up to a whole number', try: 'PRINT FLOOR 3.7' },
    { syntax: 'RANDOM n / RND n',          desc: 'a random whole number from 0 to n - 1', try: 'PRINT RANDOM 6' },
    { syntax: 'SIN n  COS n  TAN n',       desc: 'sine / cosine / tangent of n degrees', try: 'PRINT SIN 30' },
    { syntax: 'ARCSIN n  ARCCOS n  ARCTAN n', desc: 'the angle in degrees for a sine / cosine / tangent', try: 'PRINT ARCTAN 1' },
    { syntax: 'LN n  /  LOG n',            desc: 'natural / base-10 logarithm', try: 'PRINT LOG 1000' },
    { syntax: 'EXP n',                     desc: 'e to the power n', try: 'PRINT EXP 1' },
  ]},
];

// Logo words named in a syntax string (the uppercase words, e.g. 'PENDOWN? / PD? x' → PENDOWN?, PD?).
export function syntaxWords(syntax: string): string[] {
  return syntax.match(/[A-Z][A-Z0-9]+\??/g) ?? [];
}
