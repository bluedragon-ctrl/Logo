// ── Commands reference ────────────────────────────────────────────────────────
// The content of the Commands panel, as data. ui/reference-panel.ts renders it
// as a list of commands, each opening into a card; tests/unit/reference.test.ts
// checks that every built-in word of the interpreter is listed here, that every
// word listed here exists, that every example runs and every "see" link resolves.
//
// syntax:   how the command is written. UPPERCASE words are Logo words (they are
//           what the coverage test reads); lowercase words are the inputs.
// desc:     what it does, in plain words, starting lowercase, no full stop.
// more:     optional longer explanation for the card: full sentences.
// forms:    optional other ways to write it (aliases, other inputs); their
//           UPPERCASE words count as documented too.
// examples: optional runnable programs. A one-line example gets a Try button
//           (direct mode); every example gets Insert (into the editor).
// see:      optional related commands, by one of their words (e.g. 'FOR').
// tags:     optional extra lowercase search words (synonyms, topics).
//
// The examples that use a command ("Used in" on its card) are not listed here:
// they are found from the example files themselves (src/examples.ts).

export interface RefEntry {
  syntax: string; desc: string; more?: string; forms?: string[];
  examples?: string[]; see?: string[]; tags?: string[];
}
export interface RefSection { id: string; title: string; entries: RefEntry[] }

export const REFERENCE: RefSection[] = [
  { id: 'motion', title: 'Motion', entries: [
    { syntax: 'FORWARD / FD n', desc: 'move forward n steps',
      more: 'The turtle walks n steps the way it is facing, drawing a line if the pen is down. A negative n walks backwards.',
      examples: ['FD 100', 'FD 50 RT 90 FD 50', 'REPEAT 4 [ FD 80 RT 90 ]'],
      see: ['BACK', 'RIGHT', 'SETPOS'], tags: ['move', 'walk', 'go', 'step', 'ahead'] },
    { syntax: 'BACK / BK n', desc: 'move back n steps',
      more: 'The turtle walks backwards without turning round. BK 50 is the same as FD -50.',
      examples: ['BK 50', 'FD 100 BK 50'], see: ['FORWARD'], tags: ['move', 'backwards', 'reverse'] },
    { syntax: 'RIGHT / RT n', desc: 'turn right n degrees',
      more: 'The turtle turns on the spot, clockwise. A full turn is 360 degrees, so RT 90 is a quarter turn.',
      examples: ['RT 90', 'REPEAT 3 [ FD 100 RT 120 ]', 'REPEAT 36 [ FD 10 RT 10 ]'],
      see: ['LEFT', 'SETHEADING', 'HEADING'], tags: ['turn', 'rotate', 'angle', 'clockwise', 'degrees'] },
    { syntax: 'LEFT / LT n', desc: 'turn left n degrees',
      more: 'The turtle turns on the spot, anticlockwise. LT 90 is the same as RT -90.',
      examples: ['LT 45', 'REPEAT 5 [ FD 80 LT 144 ]'],
      see: ['RIGHT', 'SETHEADING'], tags: ['turn', 'rotate', 'angle', 'anticlockwise', 'degrees'] },
    { syntax: 'SETHEADING / SETH n', desc: 'face heading n (0 = up, 90 = right)',
      more: 'Turns the turtle to face a compass direction, wherever it was facing before: 0 is up, 90 right, 180 down, 270 left.',
      examples: ['SETH 90', 'SETH 180 FD 50'], see: ['HEADING', 'TOWARDS', 'RIGHT'], tags: ['turn', 'direction', 'face', 'compass'] },
    { syntax: 'HOME', desc: 'go straight back to the centre, heading 0 (draws if the pen is down)',
      more: 'Puts the turtle back at 0 0, facing up. It walks there in a straight line, so with the pen down it draws one — lift the pen first (PU HOME) to jump.',
      examples: ['FD 80 RT 90 FD 40 HOME'], see: ['SETPOS', 'CLEARSCREEN'], tags: ['centre', 'center', 'start', 'reset'] },
    { syntax: 'SETPOS x y', desc: 'move straight to x y (draws if the pen is down)',
      more: 'Moves the turtle to the point x y in a straight line; its heading stays. 0 0 is the centre of the canvas, x grows to the right, y grows upwards.',
      forms: ['SETXY x y'],
      examples: ['SETPOS 100 -50', 'SETXY -100 50', 'PU SETPOS -100 0 PD SETPOS 100 0'],
      see: ['SETX', 'XCOR', 'HOME'], tags: ['position', 'coordinates', 'jump', 'point', 'goto'] },
    { syntax: 'SETX x  /  SETY y', desc: 'move straight to a new x / y; the other stays',
      more: 'SETX moves sideways to a new x, SETY up or down to a new y, drawing if the pen is down.',
      examples: ['SETX 120', 'SETY -80', 'SETX 100 SETY 100 SETX 0'], see: ['SETPOS'], tags: ['position', 'coordinates'] },
    { syntax: 'XCOR / YCOR', desc: 'the turtle\'s x / y position',
      more: 'Values you can use in expressions: where the turtle is now.',
      examples: ['PRINT XCOR', 'FD 50 PRINT YCOR', 'SETPOS XCOR + 50 YCOR'], see: ['SETPOS', 'HEADING'], tags: ['position', 'coordinates', 'where'] },
    { syntax: 'HEADING', desc: 'the turtle\'s heading in degrees (0 to 359)',
      examples: ['PRINT HEADING', 'RT 45 PRINT HEADING'], see: ['SETHEADING', 'TOWARDS'], tags: ['direction', 'angle'] },
    { syntax: 'TOWARDS x y', desc: 'the heading that faces point x y',
      more: 'Use it with SETH to point the turtle at something: SETH TOWARDS 0 0 faces the centre.',
      examples: ['SETH TOWARDS 0 0', 'PU SETPOS 100 100 PD SETH TOWARDS 0 0 FD DISTANCE 0 0'],
      see: ['DISTANCE', 'SETHEADING'], tags: ['direction', 'aim', 'point', 'angle'] },
    { syntax: 'DISTANCE x y', desc: 'the distance to point x y',
      examples: ['PRINT DISTANCE 0 0', 'FD 30 RT 90 FD 40 PRINT DISTANCE 0 0'], see: ['TOWARDS', 'SQRT'], tags: ['length', 'how far'] },
    { syntax: 'SCRWIDTH / SCRHEIGHT', desc: 'canvas width / height (the centre is 0 0)',
      more: 'The size of the canvas in steps. The edges are at x = ±SCRWIDTH / 2 and y = ±SCRHEIGHT / 2; a program can use them to fit its drawing to the window.',
      examples: ['PRINT SCRWIDTH', 'PU SETX 10 - SCRWIDTH / 2 PD SETX SCRWIDTH / 2 - 10'],
      see: ['SETPOS', 'WRAP'], tags: ['screen', 'size', 'canvas', 'edge', 'window'] },
    { syntax: 'FENCE / WRAP / WINDOW', desc: 'what the canvas edge does: stop (OUCH!), wrap round, or let the turtle out',
      more: 'FENCE is the start setting: at the edge the turtle stops and the program ends with OUCH!. After WRAP, a turtle that leaves on one side comes back in on the other, drawing on. After WINDOW it may walk off the canvas and come back; what it draws out there is not seen. CS keeps the setting; Run and Clear go back to FENCE.',
      examples: ['WRAP RT 30 FD 1000', 'WRAP REPEAT 12 [ FD 400 RT 151 ]', 'WINDOW FD 500 BK 500', 'FENCE'],
      see: ['SCRWIDTH', 'FORWARD'], tags: ['edge', 'border', 'wrap', 'window', 'fence', 'ouch', 'off screen', 'torus'] },
  ]},
  { id: 'pen', title: 'Pen and drawing', entries: [
    { syntax: 'PENUP / PU', desc: 'lift the pen: move without drawing',
      examples: ['PU FD 50 PD FD 50', 'REPEAT 10 [ FD 10 PU FD 10 PD ]'], see: ['PENDOWN', 'PENUP?'], tags: ['pen', 'lift', 'gap', 'jump'] },
    { syntax: 'PENDOWN / PD', desc: 'put the pen down: draw when moving',
      examples: ['PU SETPOS -50 0 PD FD 50'], see: ['PENUP', 'PENDOWN?'], tags: ['pen', 'draw'] },
    { syntax: 'PENDOWN? / PD?', desc: '1 if the pen is down, else 0',
      examples: ['PRINT PD?', 'PU PRINT PD?'], see: ['PENUP?', 'PENDOWN'], tags: ['pen', 'test'] },
    { syntax: 'PENUP? / PU?', desc: '1 if the pen is up, else 0',
      examples: ['PRINT PU?'], see: ['PENDOWN?', 'PENUP'], tags: ['pen', 'test'] },
    { syntax: 'SETCOLOR / SC r g b', desc: 'pen colour: red, green, blue (0 to 255 each) or a name',
      more: 'Three numbers mix red, green and blue light: 0 is none, 255 is full. A colour name (see Colours) works too. Lines drawn after it get the new colour.',
      forms: ['SETCOLOR / SC name', 'SETPC / SETPENCOLOR …  (other names for SETCOLOR)'],
      examples: ['SETCOLOR 200 50 50 FD 80', 'SETCOLOR BLUE FD 80', 'REPEAT 36 [ SETCOLOR REPCOUNT * 7 100 200 FD 100 BK 100 RT 10 ]'],
      see: ['SETWIDTH', 'SETBG'], tags: ['colour', 'color', 'pen', 'rgb', 'red', 'green', 'blue', 'paint'] },
    { syntax: 'SETWIDTH / SW n', desc: 'pen width in pixels',
      forms: ['SETPENSIZE n  (the same as SETWIDTH)'],
      examples: ['SETWIDTH 4 FD 80', 'REPEAT 5 [ SETWIDTH REPCOUNT * 2 FD 30 ]'], see: ['PENSIZE', 'SETCOLOR'], tags: ['thick', 'thin', 'size', 'pen', 'line'] },
    { syntax: 'PENSIZE', desc: 'the pen width',
      examples: ['PRINT PENSIZE', 'SETWIDTH PENSIZE + 2 PRINT PENSIZE'], see: ['SETWIDTH'], tags: ['thick', 'width', 'pen'] },
    { syntax: 'SETBG / SETBACKGROUND name', desc: 'canvas colour by name or r g b (CS keeps it)',
      more: 'Paints the whole canvas in a colour. CS keeps it; Run with "clear screen on run" and Clear go back to the colour chosen in Options.',
      forms: ['SETBG r g b'],
      examples: ['SETBG NAVY', 'SETBG 20 30 50 SETCOLOR YELLOW CIRCLE 60'], see: ['SETCOLOR'], tags: ['background', 'colour', 'color', 'canvas', 'paper'] },
    { syntax: 'CIRCLE r', desc: 'draw a circle of radius r, turning right',
      more: 'The turtle walks round a circle of radius r, starting and ending where it is now, so the circle lies to its right. A negative radius draws it to the left.',
      examples: ['CIRCLE 50', 'REPEAT 12 [ CIRCLE 50 RT 30 ]', 'CIRCLE 40 CIRCLE -40'], see: ['ARC'], tags: ['round', 'ring', 'curve'] },
    { syntax: 'ARC angle r', desc: 'draw part of a circle: angle degrees, radius r, turning right',
      more: 'Walks part of a CIRCLE: ARC 90 r is a quarter circle, ARC 360 r a whole one. The turtle ends turned by angle degrees. A negative angle turns left.',
      examples: ['ARC 90 80', 'REPEAT 2 [ ARC 90 80 RT 90 ]', 'REPEAT 6 [ ARC 60 80 RT 120 ARC 60 80 RT 120 RT 60 ]'],
      see: ['CIRCLE'], tags: ['circle', 'curve', 'round', 'part', 'bend'] },
    { syntax: 'DOT', desc: 'a filled dot at the turtle (size = pen width)',
      more: 'A round dot as wide as the pen. DOT x y puts it at a point without moving the turtle; inputs are read from the same line only.',
      forms: ['DOT x y  (a dot at x y; the turtle stays put)'],
      examples: ['SETWIDTH 10 DOT', 'DOT 50 50', 'SETWIDTH 6 REPEAT 12 [ PU FD 80 DOT BK 80 RT 30 ]'],
      see: ['SETWIDTH', 'SETPOS'], tags: ['point', 'spot', 'plot'] },
    { syntax: 'LABEL "word', desc: 'write a word or a value at the turtle',
      more: 'Writes text on the canvas, starting at the turtle. A "word keeps its upper and lower case; a value is written as a number. In parentheses LABEL takes several words and values and writes them with spaces between.',
      forms: ['LABEL value', '(LABEL a b …)  (several words and values)'],
      examples: ['LABEL "Hello', 'LABEL 2 * 21', '(LABEL "x: XCOR "y: YCOR)', 'REPEAT 4 [ FD 80 LABEL REPCOUNT RT 90 ]'], see: ['PRINT'], tags: ['text', 'write', 'word', 'number'] },
    { syntax: 'BEGINFILL … ENDFILL', desc: 'fill the shape walked in between with the pen colour BEGINFILL saw',
      more: 'BEGINFILL starts remembering the turtle\'s path, with the pen up or down; ENDFILL closes it with a straight line back to the start and fills it. The fill takes the pen colour at BEGINFILL, so you can change colour for the outline. The outline stays on top of the fill.',
      examples: ['BEGINFILL REPEAT 5 [ FD 80 RT 144 ] ENDFILL', 'SETCOLOR GOLD BEGINFILL CIRCLE 50 ENDFILL', 'SETCOLOR YELLOW BEGINFILL SETCOLOR BLACK REPEAT 4 [ FD 80 RT 90 ] ENDFILL'],
      see: ['SETCOLOR', 'CIRCLE'], tags: ['fill', 'filled', 'paint', 'colour in', 'solid', 'shape'] },
    { syntax: 'CLEARSCREEN / CS', desc: 'clear the canvas and reset the turtle',
      more: 'Removes all lines, dots, labels and fills and puts the turtle home with a fresh pen. Variables, procedures, the SETBG colour and WRAP / WINDOW stay.',
      examples: ['FD 50 CS'], see: ['HOME', 'CLEARTEXT'], tags: ['clear', 'erase', 'reset', 'clean', 'wipe'] },
    { syntax: 'HIDETURTLE / HT', desc: 'hide the turtle',
      examples: ['HT', 'HT REPEAT 4 [ FD 80 RT 90 ]'], see: ['SHOWTURTLE'], tags: ['invisible', 'hide'] },
    { syntax: 'SHOWTURTLE / ST', desc: 'show the turtle', examples: ['ST'], see: ['HIDETURTLE'], tags: ['visible', 'show'] },
  ]},
  { id: 'loops', title: 'Loops', entries: [
    { syntax: 'REPEAT n [ … ]', desc: 'run the block n times',
      more: 'Runs the commands in [ ] n times. REPCOUNT says which time round it is. REPEATs can be put inside each other.',
      examples: ['REPEAT 4 [ FD 80 RT 90 ]', 'REPEAT 36 [ FD 10 RT 10 ]', 'REPEAT 8 [ REPEAT 4 [ FD 60 RT 90 ] RT 45 ]'],
      see: ['REPCOUNT', 'FOR', 'FOREVER', 'WHILE'], tags: ['loop', 'again', 'times', 'repeat'] },
    { syntax: 'REPCOUNT', desc: 'which time round REPEAT this is (1 to n)',
      more: 'Inside REPEAT or FOREVER: 1 the first time, 2 the second, and so on. Handy for things that grow.',
      examples: ['REPEAT 3 [ PRINT REPCOUNT ]', 'REPEAT 50 [ FD REPCOUNT * 3 RT 90 ]'], see: ['REPEAT', 'REPCOUNTMAX', 'FOR'], tags: ['loop', 'counter', 'round', 'number'] },
    { syntax: 'REPCOUNTMAX', desc: 'the n of the current REPEAT',
      more: 'How many times the current REPEAT runs in all. Not available inside FOREVER.',
      examples: ['REPEAT 3 [ PRINT REPCOUNTMAX ]', 'REPEAT 6 [ FD 60 RT 360 / REPCOUNTMAX ]'], see: ['REPCOUNT'], tags: ['loop', 'total'] },
    { syntax: 'FOR :v start end [ … ]', desc: 'count :v from start to end (step 1 or -1)',
      more: 'Runs the block once for every value of :v from start to end. With a fourth input, :v goes up (or down) by that step. The variable exists only inside the loop.',
      forms: ['FOR :v start end step [ … ]'],
      examples: ['FOR :I 1 5 [ PRINT :I ]', 'FOR :I 0 100 25 [ PRINT :I ]', 'FOR :S 10 100 10 [ FD :S RT 90 ]'],
      see: ['REPEAT', 'WHILE', 'MAKE'], tags: ['loop', 'count', 'counter', 'step', 'range'] },
    { syntax: 'FOREVER [ … ]', desc: 'run the block again and again (BREAK or STOP leaves)',
      more: 'An endless REPEAT: use BREAK or STOP to leave, or press Stop. REPCOUNT counts the rounds.',
      examples: ['FOREVER [ FD 4 RT 10 IF REPCOUNT = 36 [ BREAK ] ]'], see: ['REPEAT', 'BREAK', 'WHILE'], tags: ['loop', 'endless', 'infinite', 'always'] },
    { syntax: 'WHILE [ cond ] [ … ]', desc: 'run the block while the condition is true',
      more: 'Checks the condition before every round; when it is false the loop ends. If it is false at the start, the block never runs.',
      examples: ['MAKE :N 1 WHILE [ :N < 50 ] [ MAKE :N :N * 2 ] PRINT :N', 'MAKE :S 5 WHILE [ :S < 150 ] [ FD :S RT 60 MAKE :S :S + 5 ]'],
      see: ['REPEAT', 'FOR', 'IF'], tags: ['loop', 'until', 'condition'] },
    { syntax: 'BREAK', desc: 'leave the innermost loop now',
      examples: ['REPEAT 10 [ IF REPCOUNT = 4 [ BREAK ] PRINT REPCOUNT ]'], see: ['CONTINUE', 'FOREVER', 'STOP'], tags: ['loop', 'exit', 'leave', 'end'] },
    { syntax: 'CONTINUE', desc: 'skip to the next round of the innermost loop',
      examples: ['REPEAT 5 [ IF REPCOUNT = 3 [ CONTINUE ] PRINT REPCOUNT ]'], see: ['BREAK'], tags: ['loop', 'skip', 'next'] },
  ]},
  { id: 'decisions', title: 'Decisions', entries: [
    { syntax: 'IF cond [ … ]', desc: 'run the block if the condition is true',
      more: 'A condition is a comparison like :X > 5. Any value other than 0 counts as true.',
      examples: ['IF 3 > 2 [ PRINT "yes ]', 'REPEAT 8 [ IF REPCOUNT MOD 2 = 0 [ SETCOLOR RED ] FD 15 SETCOLOR BLACK FD 15 ]'],
      see: ['IFELSE', 'AND', 'WHILE'], tags: ['condition', 'decide', 'when', 'test', 'choose'] },
    { syntax: 'IFELSE cond [ … ] [ … ]', desc: 'run the first block if true, else the second',
      more: 'One of the two blocks always runs. As a value, IFELSE gives the value of one block: OUTPUT IFELSE :N < 2 [ 1 ] [ :N * 2 ].',
      forms: ['IFELSE cond [ a ] [ b ]  (as a value: a if true, else b)'],
      examples: ['IFELSE 1 > 2 [ PRINT "yes ] [ PRINT "no ]', 'PRINT IFELSE 3 > 2 [ 10 ] [ 20 ]', 'REPEAT 6 [ FD IFELSE REPCOUNT MOD 2 = 0 [ 20 ] [ 60 ] RT 60 ]'],
      see: ['IF'], tags: ['condition', 'else', 'otherwise', 'choose'] },
    { syntax: '> < = >= <= != <>', desc: 'compare: 1 if true, 0 if false',
      more: 'The sign = means equal, != and <> mean not equal. Comparisons ignore tiny rounding differences, so 0.1 + 0.2 = 0.3 is true.',
      examples: ['PRINT 3 > 2', 'PRINT 0.1 + 0.2 = 0.3'], see: ['IF', 'AND'], tags: ['compare', 'equal', 'greater', 'less', 'condition'] },
    { syntax: 'AND OR NOT', desc: 'combine conditions (1 / 0); NOT covers a whole comparison',
      more: 'With AND, a AND b is true when both are; a OR b is true when at least one is; NOT turns true into false. b is not worked out when a already decides, so :X != 0 AND 10 / :X > 1 is safe when :X is 0.',
      forms: ['a AND b  /  a OR b'],
      examples: ['PRINT NOT 1 > 2', 'PRINT 3 > 2 AND 2 > 1', 'MAKE :X 0 PRINT :X != 0 AND 10 / :X > 1'],
      see: ['IF', '>'], tags: ['logic', 'both', 'either', 'condition', 'boolean'] },
  ]},
  { id: 'procedures', title: 'Procedures', entries: [
    { syntax: 'TO name :in1 :in2 … / END', desc: 'define a procedure with inputs; a call as the last step may repeat forever',
      more: 'TO teaches the turtle a new word. The first line names it and its inputs; END closes it. Call it by name with a value for each input. A procedure may call itself (recursion). An input written [:b 10] is optional: a call without parentheses uses 10, a call in parentheses (name 5 20) may pass it.',
      forms: ['TO name :a [:b 10]  (b is optional: name 5 uses b = 10, (name 5 20) gives both)'],
      examples: ['TO SQUARE :SIZE\n  REPEAT 4 [ FD :SIZE RT 90 ]\nEND\n\nSQUARE 50\nSQUARE 100', 'TO STAR :N\n  REPEAT :N [ FD 100 RT 180 - 180 / :N ]\nEND\n\nSTAR 5', 'TO BOX :W [:H 40]\n  REPEAT 2 [ FD :H RT 90 FD :W RT 90 ]\nEND\n\nBOX 60\n(BOX 30 90)'],
      see: ['OUTPUT', 'STOP', 'LOCALMAKE'], tags: ['procedure', 'define', 'function', 'new word', 'recursion', 'subroutine'] },
    { syntax: 'STOP', desc: 'leave the current procedure now',
      more: 'Ends the procedure that is running and goes back to where it was called. Often used with IF to end a recursion.',
      examples: ['TO SPIRAL :S\n  IF :S > 100 [ STOP ]\n  FD :S RT 90\n  SPIRAL :S + 5\nEND\n\nSPIRAL 5'],
      see: ['OUTPUT', 'BREAK', 'TO'], tags: ['exit', 'leave', 'return', 'end'] },
    { syntax: 'OUTPUT / OP value', desc: 'leave the procedure and give back a value',
      more: 'Makes a procedure into a value you can use in expressions, like a maths function.',
      examples: ['TO DOUBLE :N\n  OUTPUT :N * 2\nEND\n\nPRINT DOUBLE 21', 'TO FACT :N\n  OUTPUT IFELSE :N < 2 [ 1 ] [ :N * FACT :N - 1 ]\nEND\n\nPRINT FACT 5'],
      see: ['TO', 'STOP'], tags: ['return', 'value', 'result', 'function', 'give back'] },
  ]},
  { id: 'variables', title: 'Variables', entries: [
    { syntax: 'MAKE :x value', desc: 'set x: updates an existing x, else creates a global one',
      more: 'A variable is a named box for a number. MAKE puts a value in it; :x reads it back. "x and :x both work as the name.',
      forms: ['MAKE "x value  (the same as MAKE :x)'],
      examples: ['MAKE :SIZE 50 FD :SIZE', 'MAKE :N 0 REPEAT 5 [ MAKE :N :N + REPCOUNT ] PRINT :N'],
      see: [':x', 'LOCALMAKE', 'FOR'], tags: ['variable', 'set', 'store', 'assign', 'name'] },
    { syntax: ':x', desc: 'the value of x',
      examples: ['MAKE :X 7 PRINT :X * 2'], see: ['MAKE'], tags: ['variable', 'value', 'read'] },
    { syntax: 'LOCALMAKE :x value', desc: 'create x just for the current procedure',
      more: 'Like MAKE, but the variable belongs to the running procedure and disappears when it ends. Recursive procedures need it for their working values.',
      examples: ['TO BOX :S\n  LOCALMAKE :HALF :S / 2\n  REPEAT 4 [ FD :HALF RT 90 ]\nEND\n\nBOX 100'],
      see: ['LOCAL', 'MAKE'], tags: ['variable', 'local', 'private'] },
    { syntax: 'LOCAL :x :y …', desc: 'declare variables just for the current procedure',
      more: 'Creates procedure-private variables without a value; give them one later with MAKE.',
      examples: ['TO SHOWLOCAL\n  LOCAL :A\n  MAKE :A 5\n  PRINT :A\nEND\n\nSHOWLOCAL'],
      see: ['LOCALMAKE', 'MAKE'], tags: ['variable', 'local', 'private'] },
  ]},
  { id: 'console', title: 'Console and time', entries: [
    { syntax: 'PRINT / PR value', desc: 'show a value or a "word in the console',
      more: 'In parentheses PRINT takes several words and values and shows them on one line with spaces between: (PRINT "Score: :N).',
      forms: ['PRINT "word', '(PRINT a b …)  (several words and values on one line)'],
      examples: ['PRINT 2 + 3 * 4', 'PRINT "Hello', 'MAKE :N 7 (PRINT "Score: :N)', 'REPEAT 3 [ PRINT REPCOUNT * 10 ]'], see: ['LABEL', 'CLEARTEXT'], tags: ['show', 'output', 'write', 'console', 'display'] },
    { syntax: 'CLEARTEXT / CT', desc: 'empty the console', examples: ['CT'], see: ['PRINT', 'CLEARSCREEN'], tags: ['clear', 'console'] },
    { syntax: 'WAIT n', desc: 'pause for n seconds',
      more: 'Stops for a while; decimals work (WAIT 0.5). Stop ends a WAIT at once.',
      examples: ['WAIT 0.5', 'REPEAT 4 [ FD 60 RT 90 WAIT 0.2 ]'], see: ['SPEED'], tags: ['pause', 'delay', 'sleep', 'time', 'slow'] },
    { syntax: 'SPEED n', desc: 'animation speed: 0 (slowest) to 4 (instant)',
      more: 'Changes the speed slider while the program runs; Run puts the slider back afterwards.',
      examples: ['SPEED 2', 'SPEED 0 FD 50 SPEED 4 FD 50'], see: ['WAIT'], tags: ['fast', 'slow', 'animation', 'instant'] },
    { syntax: 'TIMER', desc: 'seconds since the program started (or RESETTIMER)',
      more: 'A clock for games and animations, with fractions of a second. In direct mode every command starts it again.',
      examples: ['WAIT 0.2 PRINT TIMER', 'WHILE [ TIMER < 1 ] [ FD 1 RT 2 ]'], see: ['RESETTIMER', 'WAIT'], tags: ['time', 'clock', 'seconds', 'stopwatch'] },
    { syntax: 'RESETTIMER', desc: 'start TIMER again from 0',
      examples: ['WAIT 0.2 RESETTIMER PRINT TIMER'], see: ['TIMER'], tags: ['time', 'clock', 'reset'] },
    { syntax: '; comment', desc: 'the rest of the line is ignored',
      more: 'Notes for people reading the program. Everything after ; on a line is skipped.',
      examples: ['FD 50 ; this part is ignored'], tags: ['comment', 'note', 'remark'] },
  ]},
  { id: 'input', title: 'Keyboard and mouse', entries: [
    { syntax: 'KEYP', desc: '1 if a key was pressed and not read yet, else 0',
      more: 'Does not wait. While a program runs, key presses wait in a queue for READKEY — click the canvas first, so the keys do not go into the editor.',
      examples: ['PRINT KEYP', 'FOREVER [ IF KEYP [ BREAK ] FD 2 RT 3 IF REPCOUNT = 120 [ BREAK ] ]'], see: ['READKEY'], tags: ['key', 'keyboard', 'pressed', 'game', 'input'] },
    { syntax: 'READKEY', desc: 'wait for a key and give its code: A = 65 … Z = 90, space 32, arrows ← 37 ↑ 38 → 39 ↓ 40',
      more: 'Waits until a key is pressed (Stop ends the wait) and gives its number: letters 65 to 90 (A to Z, whatever the case), digits 48 to 57, space 32, Enter 13, Escape 27, arrows left 37, up 38, right 39, down 40. Use KEYP first to read a key only if there is one.',
      examples: ['IF KEYP [ PRINT READKEY ]', '; steer with ← and →, Escape stops\nFOREVER [\n  IF KEYP [\n    MAKE :K READKEY\n    IF :K = 37 [ LT 15 ]\n    IF :K = 39 [ RT 15 ]\n    IF :K = 27 [ BREAK ]\n  ]\n  FD 2\n  IF REPCOUNT = 150 [ BREAK ]\n]'],
      see: ['KEYP'], tags: ['key', 'keyboard', 'arrow', 'game', 'input', 'code'] },
    { syntax: 'MOUSEX / MOUSEY', desc: 'where the mouse is over the canvas (the centre is 0 0)',
      examples: ['PRINT MOUSEX', '; draw with the mouse button held down, for 2 seconds\nPU\nWHILE [ TIMER < 2 ] [\n  SETPOS MOUSEX MOUSEY\n  IFELSE BUTTONP [ PD ] [ PU ]\n]'], see: ['BUTTONP', 'SETPOS'], tags: ['mouse', 'pointer', 'cursor', 'position', 'input'] },
    { syntax: 'BUTTONP', desc: '1 while the mouse button is pressed on the canvas, else 0',
      examples: ['PRINT BUTTONP'], see: ['MOUSEX'], tags: ['mouse', 'click', 'button', 'input'] },
  ]},
  { id: 'maths', title: 'Maths', entries: [
    { syntax: '+ - * /', desc: '* and / before + and -, then left to right',
      more: 'Like in maths class: 2 + 3 * 4 is 14. Use ( ) to work a part out first.',
      examples: ['PRINT 2 + 3 * 4', 'PRINT 10 - 2 - 3', 'FD 100 / 4'], see: ['( … )', 'MOD'], tags: ['add', 'plus', 'minus', 'times', 'multiply', 'divide', 'arithmetic', 'sum'] },
    { syntax: '( … )', desc: 'work this part out first', examples: ['PRINT (2 + 3) * 4'], see: ['+'], tags: ['brackets', 'parentheses', 'group', 'order'] },
    { syntax: '-5  -:x', desc: 'minus glued to a value is a negative sign',
      more: 'SETPOS 0 -100 reads -100 as one negative number. With spaces on both sides, - subtracts: 5 - 3.',
      examples: ['SETPOS 0 -100', 'MAKE :X 30 FD -:X'], see: ['+', 'ABS'], tags: ['negative', 'minus', 'sign'] },
    { syntax: 'a MOD b  /  MOD a b', desc: 'the remainder of a divided by b',
      more: 'Useful for every-other or every-third patterns: REPCOUNT MOD 2 is 0 on even rounds. The result has the sign of b.',
      examples: ['PRINT 17 MOD 5', 'REPEAT 6 [ PRINT REPCOUNT MOD 3 ]'], see: ['INT', '+'], tags: ['remainder', 'modulo', 'even', 'odd', 'divide'] },
    { syntax: 'PI', desc: '3.14159…', examples: ['PRINT 2 * PI * 50'], see: ['SIN', 'CIRCLE'], tags: ['circle', 'circumference', 'constant'] },
    { syntax: 'POWER a b', desc: 'a to the power b', examples: ['PRINT POWER 2 10', 'PRINT POWER 9 0.5'], see: ['SQRT', 'EXP'], tags: ['exponent', 'squared', 'power'] },
    { syntax: 'MAX a b  /  MIN a b', desc: 'the larger / smaller of two values', examples: ['PRINT MAX 3 7', 'PRINT MIN 3 7'], see: ['ABS'], tags: ['largest', 'smallest', 'bigger', 'smaller', 'limit'] },
    { syntax: 'SQRT n', desc: 'square root', examples: ['PRINT SQRT 2', 'PRINT SQRT (30 * 30 + 40 * 40)'], see: ['POWER', 'DISTANCE'], tags: ['root', 'square'] },
    { syntax: 'ABS n', desc: 'n without its sign', examples: ['PRINT ABS -5'], see: ['MAX'], tags: ['absolute', 'positive', 'sign'] },
    { syntax: 'INT n', desc: 'n with the fraction cut off', examples: ['PRINT INT 3.7', 'PRINT INT -3.7'], see: ['ROUND', 'FLOOR'], tags: ['whole', 'integer', 'truncate'] },
    { syntax: 'ROUND n', desc: 'the nearest whole number', examples: ['PRINT ROUND 3.5', 'PRINT ROUND 2.4'], see: ['INT', 'FLOOR'], tags: ['whole', 'integer', 'nearest'] },
    { syntax: 'FLOOR n  /  CEILING n', desc: 'round down / up to a whole number', examples: ['PRINT FLOOR 3.7', 'PRINT CEILING 3.2'], see: ['ROUND', 'INT'], tags: ['round', 'down', 'up', 'whole', 'integer'] },
    { syntax: 'RANDOM n / RND n', desc: 'a random whole number from 0 to n - 1',
      more: 'A different number each time. RANDOM 6 + 1 is a dice throw.',
      examples: ['PRINT RANDOM 6', 'REPEAT 20 [ FD RANDOM 60 RT RANDOM 360 ]', 'REPEAT 10 [ SETCOLOR RANDOM 256 RANDOM 256 RANDOM 256 DOT RANDOM 200 RANDOM 200 ]'],
      see: ['INT'], tags: ['random', 'chance', 'dice', 'surprise'] },
    { syntax: 'SIN n  COS n  TAN n', desc: 'sine / cosine / tangent of n degrees',
      more: 'Angles are in degrees, like the turtle\'s turns. SIN and COS go up and down between -1 and 1: good for waves and for points on a circle.',
      examples: ['PRINT SIN 30', 'FOR :A 0 360 10 [ SETPOS :A - 180 80 * SIN :A ]', 'PU FOR :A 0 360 30 [ SETPOS 100 * COS :A 100 * SIN :A DOT ]'],
      see: ['ARCSIN', 'PI'], tags: ['trigonometry', 'wave', 'angle', 'curve'] },
    { syntax: 'ARCSIN n  ARCCOS n  ARCTAN n', desc: 'the angle in degrees for a sine / cosine / tangent',
      examples: ['PRINT ARCTAN 1', 'PRINT ARCSIN 0.5'], see: ['SIN', 'TOWARDS'], tags: ['trigonometry', 'angle', 'inverse'] },
    { syntax: 'LN n  /  LOG n', desc: 'natural / base-10 logarithm', examples: ['PRINT LOG 1000', 'PRINT LN EXP 2'], see: ['EXP', 'POWER'], tags: ['logarithm'] },
    { syntax: 'EXP n', desc: 'e to the power n', examples: ['PRINT EXP 1'], see: ['LN', 'POWER'], tags: ['exponential', 'power'] },
  ]},
];

// Logo words named in a syntax string (the uppercase words, e.g. 'PENDOWN? / PD? x' → PENDOWN?, PD?).
export function syntaxWords(syntax: string): string[] {
  return syntax.match(/[A-Z][A-Z0-9]+\??/g) ?? [];
}

// The words an entry documents: from its syntax and its other forms.
export function entryWords(e: RefEntry): string[] {
  return [...new Set([e.syntax, ...(e.forms ?? [])].flatMap(syntaxWords))];
}

// findEntry(word): the entry a "see" link or a command word points at — the first
// whose words include it, or (for symbols like '>' or ':x') whose syntax starts with it.
export function findEntry(word: string): RefEntry | undefined {
  const w = word.toUpperCase();
  const all = REFERENCE.flatMap(s => s.entries);
  return all.find(e => entryWords(e).includes(w)) ?? all.find(e => e.syntax.startsWith(word));
}

// scoreEntry(entry, query): how well an entry matches a search (Commands panel): 0 = no match; higher = better. Every query word must match.
export function scoreEntry(e: RefEntry, query: string): number {
  const words = entryWords(e).map(w => w.toLowerCase());
  const syntax = [e.syntax, ...(e.forms ?? [])].join(' ').toLowerCase();
  const tags = e.tags ?? [], desc = e.desc.toLowerCase();
  let total = 0;
  for(const q of query.toLowerCase().split(/\s+/).filter(Boolean)){
    let s = 0;
    if(words.includes(q)) s = 100;
    else if(words.some(w => w.startsWith(q))) s = 50;
    else if(syntax.includes(q)) s = 30;
    else if(tags.includes(q)) s = 20;
    else if(tags.some(t => t.startsWith(q))) s = 15;
    else if(desc.includes(q)) s = 10;
    if(!s) return 0;
    total += s;
  }
  return total;
}
