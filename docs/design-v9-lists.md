# Blue Logo v9 — Words and Lists, and UCBLogo compatibility (design)

Status: **decided, not scheduled** (November 2026, written after v8.11).
Nothing in this document is in the code yet.

**Guiding rules**

1. **UCBLogo programs should run.** Blue Logo is not a 1:1 copy of UCBLogo (Berkeley Logo 6, Brian Harvey's *Computer Science Logo Style*):
- It keeps its own extra words and friendlier syntaxes (infix `AND`, `SETCOLOR RED`, `FOR :i 1 10 [ … ]`, `BREAK`, …) as long as they do not stop a UCBLogo program from working.
- Where the two **clash**, so that a UCBLogo program fails or silently does something else, Blue Logo aligns with UCBLogo.
  - It does so by **accepting the UCBLogo form as well** wherever possible.
  - It changes an existing Blue Logo rule only when both cannot coexist **and** the UCBLogo rule is not harder to understand (rule 2).

2. **Keep the current approach when it is simpler and clearer.** Where Blue Logo's own rule is easier to teach, it stays, even if a UCBLogo program then behaves differently. The difference is documented (§12), and the UCBLogo form is accepted as well wherever that costs nothing in clarity. This settled `ARC`, `WAIT`, the binding of function inputs, quoted-word delimiters and `MAKE :x`.

§13 reviews the whole language by these rules. Most fixes need no lists and can ship first as a non-breaking **v8.12** (§7, phase 0). Words and lists (§2–§5) are the big step and ship as **v9.0**. Apart from the new built-in names (§9), it changes no existing program.

These are steps 3 (v8.12) and 4 (v9.0) of the missing-features list in `TODO.md` → Language.

---

## 1. Goals and non-goals

**Goals**
- Values are **numbers, words or lists**, as in UCBLogo, so that teaching programs can work with names, sentences, scores, colour lists and points.
- The UCBLogo list words with their UCBLogo names and behaviour:
  - `FIRST`, `BUTFIRST`, `LAST`, `BUTLAST`, `ITEM`, `COUNT`;
  - `EMPTYP`, `SENTENCE`, `LIST`, `FPUT`, `LPUT`, `WORD`, `MEMBERP`, `PICK`;
  - `RUN`, `FOREACH`.
  Predicates are spelled both `…P` and `…?`.
- Turtle state as lists: `PENCOLOR` → `[r g b]`, `POS` → `[x y]`, and `SETPENCOLOR` / `SETPOS` / `TOWARDS` accepting a list.
- A program from UCBLogo teaching material that uses only the words Blue Logo has runs and draws the same picture (§13 lists the exceptions).
- Every existing Blue Logo program keeps working (except for procedures named like the new built-in words).
- Error messages stay as clear as today.

**Non-goals (not in v9)**
- Mutable lists or arrays (`.SETFIRST`, `ARRAY`, `SETITEM`).
- Property lists, `DEFINE` / `TEXT`, macros.
- `MAP`, `FILTER`, `REDUCE`, `APPLY`. The template machinery of `FOREACH` (§5.1) makes them cheap later, so they are the first candidates for v9.x.
- Console input (`READWORD`, `READLIST`). They need a prompt line in the UI and can come later.
- Changing Blue Logo rules that are simpler than UCBLogo's (§12): function-input binding, `ARC`, `WAIT`, `MAKE :x`.
- Screen and environment words with no meaning here (`SETSCRUNCH`, `TEXTSCREEN`, `SPLITSCREEN`, `BYE`, `EDIT`, `SAVE`, `LOAD`). They could become no-ops with an info line, so UCBLogo programs do not stop on them (§13).

---

## 2. The value model

```ts
type Value = number | Word | List;
type Word  = string;               // the text, case kept: "Ann → 'Ann'
type List  = readonly Value[];     // frozen JS array, nested freely
```

- **Number**: as today (an IEEE double). `PRINT` and `LABEL` still format it with `formatNum`.
- **Word**: a JS string, case kept. `"Ann` is the word `Ann`. `"` alone is the empty word (today that is an error, "Empty word").
- **List**: a frozen array. `[]` is the empty list.

**Words that look like numbers are numbers** (UCBLogo). `"10` and `10` are interchangeable: `"10 + 1` is 11, and `FIRST 123` is the word `1`, which can be used as the number 1. A number in a list literal `[1 2 3]` is stored as a number (§4.1).
- One helper `num(v, who)` turns a value into a number or throws `who + ': ' + show(v) + ' is a word / list, not a number'`.
- Every command that needs a number calls it (FD, RT, SETPOS, REPEAT …) instead of taking a number straight from `evalExpr` as today.

**Truth values: both UCBLogo's and Blue Logo's work.**
- **Conditions** (`IF`, `IFELSE`, `WHILE`, `UNTIL`, `TEST`, `AND` / `OR` / `NOT`) accept the words `true` / `false` (any case), as UCBLogo, **and** numbers (0 false, anything else true), as Blue Logo always has. Any other word, or a list, is an error: `IF: [1 2] is not true or false`.
- So the usual UCBLogo patterns run:
  - a flag `MAKE "DONE "false … IF :DONE [ … ]`;
  - a user predicate that does `OUTPUT "true`;
  - `IF EMPTYP :L [ … ]`.
- **Outputs stay 1 / 0.** Comparisons and built-in predicates keep outputting 1 / 0, so `PRINT 3 > 2` shows `1` (UCBLogo shows `true`) and existing programs that count with predicates keep working.
  - `=` treats `"true` as equal to 1 and `"false` as equal to 0, so a UCBLogo test like `IF (EMPTYP :L) = "true` still works.
  - This is a deliberate difference in what is printed, not in what runs (§12).

**Variables** (`Scope`) hold any `Value`. `MAKE "NAME "Ann` and `MAKE "L [1 2 3]` work.

---

## 3. Semantics

### 3.1 Equality and comparison

- `=` / `EQUALP` / `EQUAL?` / `!=` / `<>` / `NOTEQUALP` work on any two values (UCBLogo `EQUALP`):
  - **numbers**: by value, keeping Blue Logo's ~12-digit tolerance, `approxEq` (§12);
  - **words**: by text, ignoring case (UCBLogo's default, `CASEIGNOREDP` is `true`), so `"Ann = "ANN`;
  - **number-like word and number**: as numbers;
  - **`"true` / `"false` against 1 / 0**: equal (§2);
  - **lists**: equal when they have the same length and their items are equal one by one;
  - **different kinds**: not equal, without an error.
- `<` `>` `<=` `>=` / `LESSP` / `GREATERP` compare numbers only.
- `BEFOREP` / `BEFORE?` compares two words alphabetically, ignoring case like `=`.
- `MEMBERP` uses the same equality.

### 3.2 Printing

As UCBLogo:

| Command | `[a [b c] 3]` | `"Ann` |
|---|---|---|
| `PRINT` / `PR` | `a [b c] 3` (outer brackets dropped) | `Ann` |
| `SHOW` | `[a [b c] 3]` | `Ann` |
| `TYPE` | like PRINT, but no line break: the next `TYPE` / `PRINT` continues the same console line | |
| `LABEL` | `a [b c] 3` | `Ann` |

- `(PRINT a b …)` / `(SHOW …)` / `(TYPE …)` / `(LABEL …)` join their inputs with spaces.
- The console prefix (`PRINT → `) is unchanged.
- An empty list prints as an empty line; `SHOW []` shows `[]`.
- Numbers are formatted with `formatNum` as today.

### 3.3 Lists cannot be changed

`FPUT`, `LPUT`, `BUTFIRST`, `SENTENCE` and the others always **output a new list**, as every non-dotted UCBLogo word does. Sharing a list between variables is therefore always safe.
- **Implementation:** frozen arrays (`Object.freeze`); `BUTFIRST` is `slice(1)`.
- **Cost:** copying makes `FPUT` / `BUTFIRST` O(n), so recursion over a whole list with `BUTFIRST` is O(n²). At the 100 000-item cap (§8) that is about 5·10⁹ copied items, slow but stoppable. Teaching programs use lists of tens of items.
- If it ever matters, cons cells (as UCBLogo uses) can replace the arrays without changing the language.

### 3.4 Words as sequences

As UCBLogo, `FIRST`, `LAST`, `BUTFIRST`, `BUTLAST`, `ITEM`, `COUNT` and `EMPTYP` also work on words, letter by letter: `FIRST "Ann` → `A`. Numbers count as words here: `COUNT 1234` → 4. `WORD "ab "cd` → `abcd`.

---

## 4. Syntax

### 4.1 List literals

Where a **value** is expected, `[ … ]` is a list literal. Its contents are **not evaluated**: every token becomes a word, and number tokens become numbers.

```logo
MAKE "COLOURS [RED GREEN BLUE]
PRINT FIRST [10 20 30]          ; 10
MAKE "P [[0 0] [100 0] [50 80]] ; nested lists
```

- **Statement blocks still work as today.** The `[ ]` after `REPEAT n`, `IF`, `WHILE`, `FOR`, `FOREVER` and `IFELSE` are taken by the control words as code. Only `parsePrimary` gains a `[` case, so no existing program changes meaning.
  - In UCBLogo those blocks are lists too, so they may also be **list-valued expressions** (`REPEAT 4 :BODY`, `RUN :CMDS`). This is accepted from phase B, with the literal-block path kept as the fast path.
- **IFELSE as a value** keeps its meaning: the chosen block is run, giving its value. UCBLogo does the same.
- **Case is kept inside lists.** Today `tokenize()` uppercases every token except `"words`, so `[Ann Bob]` would become `[ANN BOB]`.
  - Each token gets a second field, `raw` (the source text). A list literal builds its words from `raw`; everywhere else `text` (uppercase) is used.
- **Beautify keeps the source case of every word inside `[ ]`.** It cannot tell data from code, and UCBLogo never rewrites what was typed.
  - Outside brackets beautify still uppercases commands and variable names.
  - Inside brackets it only indents and spaces.
- **Inside a list literal** (as UCBLogo):
  - `-5` is the number −5;
  - `:X` is the word `:X`;
  - `"A` is the word `"A`, quote included;
  - `(` `)` are words;
  - `;` starts a comment;
  - a list literal may span lines.

### 4.2 Words

`"Ann` is a word value anywhere a value is expected: `MAKE "N "Ann`, `PRINT WORD "Ann "e`. The v8 error "`"size` is a word, not a number — for a variable write `:size`" stays, but only where a number is really needed (`FD "size`).

**Quoted-word delimiters stay as today.** A `"word` ends at a space, a bracket or parenthesis, or an operator character (`+ - * / = < >`), the same delimiters as everywhere else, so there is one rule. UCBLogo ends a quoted word only at a space, bracket or parenthesis, so `"a-b` is one word there and two tokens here. That rarely matters in teaching programs; it is listed in §12.

### 4.3 Inputs of built-in functions (unchanged)

Blue Logo keeps its v8.0 rule: a **one-input function takes the one operand after it**, as in maths notation, so `SIN :A * 2` is `(SIN :A) * 2` and `SQRT 16 + 9` is 13. Two-input functions and user procedures take full expressions.

UCBLogo gives every prefix input a full expression (`SQRT 16 + 9` = 5). The Blue Logo rule is kept because it reads like the maths pupils know (guiding rule 2). A UCBLogo program that relies on the other reading needs `( )`, as in `SQRT (:X * :X + :Y * :Y)`, which works the same in both. Listed in §12.

The new list words follow Blue Logo's rule for their kind:
- one-input words (`FIRST`, `BUTFIRST`, `COUNT`, `EMPTYP`, …) take one operand, so `COUNT :L + 1` is `(COUNT :L) + 1`;
- two-input words (`ITEM`, `FPUT`, `WORD`, …) take full expressions, like `MAX`.

### 4.4 What stays the same

- `:x` reads a variable.
- `*` `/` before `+` `-`, before comparisons, before `AND` / `OR`.
- `MAKE "x` names a variable.
- `(PRINT …)` / `(LABEL …)` / `(PROC …)` work as in v8.11.
- Optional inputs `TO P :A [:B 10]` work as in v8.11 (the UCBLogo form already).

---

## 5. New and changed primitives (v9.0)

All names and behaviour as in UCBLogo. "thing" is a list or a word. The UCBLogo words that need no lists are in §13 (phase 0).

| Word | Inputs → output | Notes / errors |
|---|---|---|
| `FIRST` / `LAST` | thing → value | Error on `[]` / the empty word: "FIRST of an empty list" |
| `BUTFIRST` / `BF`, `BUTLAST` / `BL` | thing → thing | Error on empty |
| `ITEM n thing` | number, thing → value | 1-based; "ITEM 5 of a list of 3 items" |
| `COUNT` | thing → number | |
| `EMPTYP` / `EMPTY?` | value → 1 / 0 | `[]` and the empty word |
| `LIST a b` | value, value → list | `(LIST a b c …)` takes any number |
| `SENTENCE` / `SE a b` | → list | Flattens one level: `SE [a b] "c` → `[a b c]`; also `(SE …)` |
| `FPUT x list`, `LPUT x list` | value, list → list | |
| `WORD a b` | word, word → word | `(WORD …)` takes any number |
| `MEMBERP` / `MEMBER? x thing` | → 1 / 0 | Uses `=` (§3.1) |
| `PICK list` | list → value | Random item; error on `[]` |
| `WORDP` / `LISTP` / `NUMBERP` (also `?` forms) | value → 1 / 0 | |
| `EQUALP` / `EQUAL?`, `NOTEQUALP`, `BEFOREP` / `BEFORE?` | → 1 / 0 | §3.1 |
| `THING "x` | word → value | The value of the variable named x (UCBLogo; `:x` is short for `THING "x`) |
| `SHOW value`, `TYPE value` | commands | §3.2 |
| `RUN list` | command, or a value when the list outputs one | `RUN [FD 50 RT 90]`. Errors name the line of the `RUN` call. |
| `FOREACH list template` | loop | §5.1 |
| `PENCOLOR` / `PC` | → `[r g b]` | |
| `POS` | → `[x y]` | |
| `SETPENCOLOR list` (and SETCOLOR / SETPC), `SETBG list` | `[r g b]` | Besides a name, a palette number (§13) and `r g b` |
| `SETPOS list` | `[x y]` | UCBLogo's form. `SETPOS x y` stays: SETPOS reads its first input, and a number means a second input follows. |
| `TOWARDS list`, `DISTANCE list` | `[x y]` | UCBLogo's form of TOWARDS; `TOWARDS x y` stays, with the same rule as SETPOS. DISTANCE gets the same list form. |
| `READCHAR` / `RC` | → word | UCBLogo: waits for a key and outputs it as a one-character word. Enter / Escape / Backspace give `CHAR 13` / `27` / `8`. Arrows have no character: READCHAR skips them, and `READKEY` (v8.11) stays for them. |
| `CHAR n` / `ASCII word` | number ↔ one-character word | `ASCII "A` = 65 |
| Rest inputs `TO P :A [:REST]` | | UCBLogo: a `[:name]` with no default collects the remaining inputs of a `( … )` call as a list |

Indirect `MAKE` (UCBLogo: `MAKE :V 5` sets the variable named by the word in `:V`) is **not** added. `MAKE :X 5` keeps meaning "set X", the simpler rule. `THING :V` gives indirect access when it is needed (§12).

Every new name becomes a built-in word, so programs with `TO FIRST`, `TO LIST`, `TO COUNT` and so on stop working (§9). Each word gets a Commands-panel card in a new **"Words and lists"** group. The `…P` / `…?` pairs are forms of one card.

### 5.1 FOREACH and templates

UCBLogo form: `FOREACH list template`. The template is a list run once per item. Inside it:
- `?` is the current item;
- `#` is its position;
- `?REST` is the rest of the list.

```logo
FOREACH [RED GREEN BLUE] [ SETPENCOLOR ? FD 50 RT 120 ]
FOREACH [10 20 30] [ PRINT # * ? ]
FOREACH "Ann [ PRINT ? ]                                  ; a word: letter by letter
FOREACH [3 4 5] [[N] REPEAT :N [ FD 40 RT 360 / :N ]]     ; named-slot template (UCBLogo 6)
```

- Named-slot templates are supported because `?` inside nested REPEATs is confusing for beginners. The examples use them.
- `BREAK` / `CONTINUE` work as in other Blue Logo loops (an extension).
- `?` outside a template is an error.
- Implementation: a `runStack` frame `isForeach`, added to `isLoopFrame`.

---

## 6. Binding of function inputs (decided: unchanged)

The first draft proposed UCBLogo's binding, where every prefix input is a full expression. It is **dropped** by guiding rule 2: Blue Logo's one-operand rule for one-input functions (`SIN :A * 2` = `(SIN :A) * 2`) is the clearer one for pupils. It stays, and no example, card or case needs rewriting. The difference is documented in lang-spec §3.3 / §7 and in §12 here, with the advice to use `( )` for a function's input, which reads the same in both.

---

## 7. Implementation outline

**Phase 0 — v8.12: UCBLogo compatibility without lists (non-breaking, can start now)**

Everything marked *v8.12* in §13. None of it needs list values:
- `FOR [i 1 10 2] [ … ]`;
- `~` line continuation;
- the prefix arithmetic and logic words;
- `MODULO` / `REMAINDER` / `LOG10`;
- the palette numbers for SETPC / SETBG;
- `PENERASE` / `PENPAINT`;
- `CLEAN`, `SHOWNP`, `UNTIL` / `DO.WHILE` / `DO.UNTIL`, `TEST` / `IFTRUE` / `IFFALSE`, `FILLED`;
- no-ops for screen words;

The new names become built-in words, which is minor: programs with `TO SUM` and the like.

**Phase A — value model (no new words, no behaviour change)**
1. `types.ts`: `Value`, `Scope` holding `Value`, `Token.raw`.
2. `expr.ts`: the parser returns `Value`.
   - `parsePrimary` gains `[` (list literal) and `"word`.
   - Operators call `num()`.
   - `=` uses the new equality.
   - Skip mode is unchanged.
   - `evalExpr` → `{ value: Value, nextIdx }`; a typed wrapper `evalNum` keeps the 25 numeric call sites in `commands.ts` and the 9 in `runtime.ts` short.
   - Conditions accept `true` / `false`.
3. `scope.ts`: `formatValue` (PRINT form) and `showValue` (SHOW form) next to `formatNum`.
4. `commands.ts`: PRINT / LABEL / `(PRINT …)` print values; `wordArg` goes away.
5. `tokenizer.ts`: `raw`. `beautify.ts` / `logo-language.ts`: keep the case inside brackets, and highlight `[ ]` contents as data.
6. All of `tests/cases.js` and the example snapshots must pass unchanged.

**Phase B — words and lists**
- The primitives of §5 in a new module `interpreter/lists.ts`, plus `SHOW`, `TYPE`, `RUN`, `FOREACH`, list-valued blocks, `THING`, rest inputs.
- Caps (§8).

**Phase C — turtle and input integration**
- `PENCOLOR`, `POS`, list forms of SETPENCOLOR / SETBG / SETPOS / TOWARDS / DISTANCE, `READCHAR` / `RC`, `CHAR`, `ASCII`.

**Docs and UI**
- lang-spec: §1.2 Values rewritten; a new §2.x "Words and lists"; the errors in §8; the limitations in §7; a new section "Blue Logo and UCBLogo" (from §12 and §13).
- impl-spec: the value model, the parser and the list module.
- CLAUDE.md "Language rules that are easy to get wrong".
- Commands panel: a "Words and lists" group; Examples topic "Words and lists".

**Release shape**: phase 0 as v8.12; phases A–C on one branch, released once as **v9.0**.

---

## 8. Limits and errors

| Limit | Value | Why |
|---|---|---|
| Items in one list | 100 000 | A runaway `LPUT` loop fails with a clear error instead of eating memory |
| Letters in one word | 100 000 | Same for `WORD` |
| List nesting for printing / `=` | 500 levels (like `MAX_EXPR_DEPTH`) | Recursive printing and comparison stay off the JS stack limit |

New error messages, in the style of lang-spec §8:
- `FIRST of an empty list` / `… of an empty word`
- `ITEM 5 of a list of 3 items` / `ITEM 0: positions start at 1`
- `[1 2] is a list, not a number` / `"abc is a word, not a number`
- `IF: "maybe is not true or false` / `IF: [1 2] is a list, not true or false`
- `FPUT: the second input must be a list, got "abc`
- `? used outside a FOREACH template`
- `RUN: … (in the list run by RUN, line 7)`
- `List too long (more than 100 000 items)`

---

## 9. What breaks (migration notes)

**v8.12** (phase 0):
- New built-in names (`SUM`, `PRODUCT`, `CLEAN`, `TEST`, `UNTIL`, `FILLED`, `PE`, …) can no longer be procedure names.

**v9.0:**

| v8 | v9.0 | Who is affected |
|---|---|---|
| `TO FIRST`, `TO LIST`, `TO COUNT`, `TO ITEM`, `TO WORD`, `TO PICK`, `TO SHOW`, `TO TYPE`, `TO RUN`, `TO POS`, `TO CHAR`, `TO THING` … allowed | error: built-in word | Programs that defined these names |
| `MAKE "N "abc`, `PRINT [1 2]`, `"` alone, `IF "true […]` → errors | work | Nobody (relaxations) |

Nothing else changes: comparisons keep outputting 1 / 0, the binding of function inputs is unchanged, and `MAKE :x` keeps its meaning.

---

## 10. Testing plan

- **Phase 0:**
  - one case per added form (`FOR [i 1 5]`, `~` continuation, `SUM 1 2`, `REMAINDER -7 3`, `SETPC 4`, `PE`, `UNTIL`, `TEST` / `IFTRUE`, `FILLED`, the no-ops);
  - every example snapshot unchanged.
- **Phase A:**
  - the whole existing suite, including the snapshots, passes unchanged;
  - new cases for words as values, number-like words, list literals (case kept, nesting, negative numbers, `:X` as a word), `=` on words and lists (case ignored, `"true` = 1), PRINT / SHOW / LABEL of lists, and `true` / `false` conditions.
- **Phase B:**
  - one case per primitive, including every error message in §8;
  - `RUN`;
  - `FOREACH` with `?`, `#`, `?REST`, named slots, a word as input, and BREAK / CONTINUE;
  - list-valued blocks;
  - `THING`, rest inputs;
  - immutability;
  - the caps.
- **Phase C:**
  - unit tests: `PENCOLOR` round trip, `SETPOS POS`, `TOWARDS [0 0]`, `CHAR` / `ASCII`;
  - a browser check for `READCHAR`.
- **Beautify:**
  - keeps the case inside brackets;
  - idempotent;
  - does not change the drawing or the console output of any example.
- **UCBLogo conformance suite:** a set of short programs in UCBLogo style, from *Computer Science Logo Style* vol. 1 and common worksheets, each with the output or drawing UCBLogo gives. It grows with each phase; that is how "UCBLogo programs should run" is checked.
- **New examples:**
  - "Word games": reverse a word with recursion, and count the vowels with `FOREACH` and `MEMBERP`;
  - "Colour list": `FOREACH` with `SETPENCOLOR ?`, and `PICK`;
  - "Shapes from points": a polygon from a list of `[x y]` points, filled with BEGINFILL.

---

## 11. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Truth values | Conditions accept UCBLogo's `true` / `false` and Blue Logo's numbers. Outputs stay 1 / 0, and `"true` = 1 in `=` (§2). Not breaking. |
| 2 | Case in `=` | Ignored, UCBLogo's default (§3.1). |
| 3 | `READCHAR` | UCBLogo one-character word; `CHAR` / `ASCII`; arrows stay with `READKEY` (§5). |
| 4 | Beautify and case in lists | Keep the source case of every word inside `[ ]` (§4.1). |
| 5 | Function-input binding | Unchanged: Blue Logo's maths-like rule stays (guiding rule 2, §4.3, §6). |
| 6 | `FOREACH` form | UCBLogo's `FOREACH list template`, with `?`, `#`, `?REST` and named slots (§5.1). A `FOR`-style form is not needed, since `FOR :x …` stays for counting. |
| 7 | Release shape | v8.12 for the non-breaking UCBLogo fixes (§13), then one v9.0 for words and lists. |
| 8 | `ARC` | Unchanged: the turtle walks the arc (§12). |
| 9 | `WAIT` | Unchanged: seconds, no hint (§12). |
| 10 | Quoted-word delimiters, `MAKE :x` | Unchanged (§4.2, §5). |

---

## 12. Deliberate differences from UCBLogo that stay

Blue Logo extras that UCBLogo programs never notice, differences only in what is printed, and simpler Blue Logo rules kept by guiding rule 2:

| Blue Logo | UCBLogo | Why it is fine |
|---|---|---|
| Infix `a AND b`, `a OR b`, `!=`, `FOR :i 1 10 [ … ]`, `FOREVER`, `BREAK`, `CONTINUE`, colour names, `SETCOLOR`, `DOT`, `CIRCLE`, `BEGINFILL` … | Not in UCBLogo, or prefix only | Extras; the UCBLogo forms work too (§13) |
| Comparisons output `1` / `0` | `true` / `false` | Only what is printed differs; conditions accept both (§2) |
| Approximate `=` for numbers (~12 digits) | Exact | `0.1 + 0.2 = 0.3` should be true in a classroom; no UCBLogo program relies on it being false |
| `SETCOLOR r g b` with 0–255 (also `[r g b]` in v9) | `[r g b]` in 0–100 | 0–255 is what pupils meet elsewhere (FMSLogo uses it too). A UCBLogo RGB list draws in a darker shade, still visible. Palette numbers match UCBLogo (§13). |
| One-input functions take one operand: `SQRT 16 + 9` = 13 | Full expression: 5 | Reads like maths. Use `( )` for a function's input, which works the same in both (§4.3). |
| `ARC angle r`: the turtle walks the arc and ends turned | The turtle stays at the centre; the arc is drawn around it | Consistent with `CIRCLE`; a UCBLogo ARC picture comes out shifted |
| `WAIT n` in seconds | `WAIT n` in 60ths of a second | Seconds are simpler to teach. A UCBLogo `WAIT 60` waits 30 s here (the cap). |
| `"a-b` is `"a`, `-`, `b` | One word `a-b` | One set of delimiters everywhere |
| `MAKE :X 5` sets X | Sets the variable named by the value of `:X` | The simpler rule; use `THING` for indirect access (v9) |
| `REPEAT 2.5` runs 3 times | Whole numbers expected | Only affects fractional counts |

---

## 13. UCBLogo compatibility review (all of Blue Logo, by the guiding rule)

Verdicts:
- **OK**: same in both.
- **extra**: Blue Logo only, harmless.
- **v8.12** / **v9.0**: aligned in that release.
- **differs**: kept, with the reason.

| Area | UCBLogo | Blue Logo v8.11 | Verdict |
|---|---|---|---|
| Motion: FD BK RT LT SETH HOME SETXY SETX SETY XCOR YCOR HEADING | | Same (`HOME` draws since v8.11) | OK |
| `SETPOS [x y]`, `POS`, `TOWARDS [x y]` | Lists | `SETPOS x y`, `TOWARDS x y`; no POS | v9.0: both forms (§5) |
| `ARC angle radius` | Turtle at the centre, does not move | Turtle walks the arc (v8.9) | differs, kept (§12) |
| `CIRCLE` | Not in UCBLogo 6 core (some versions have it, centred) | Walks the circle | extra |
| Pen: PU PD PENDOWNP | | `PD?` names | v8.12: `PENDOWNP` alias |
| `PENERASE` / `PE`, `PENPAINT` / `PPT`, `PENREVERSE` / `PX` | Erase / paint / invert | Missing | v8.12: PE draws in the background colour, PPT back to normal. PX is not planned (needs pixel XOR); it becomes an info line and draws normally. |
| `SETPENCOLOR n` / `SETPC n`, `SETBG n` (palette 0–15) | Palette number | Error, or eats the next tokens as g b | **v8.12**: one number not followed by another value on its line is a palette index, with UCBLogo's 16 colours (0 black, 1 blue, 2 green, 3 cyan, 4 red, 5 magenta, 6 yellow, 7 white, 8 brown, 9 tan, 10 forest, 11 aqua, 12 salmon, 13 purple, 14 orange, 15 grey) |
| `SETPENSIZE n` | | Same | OK |
| `CLEARSCREEN` / `CS`, `CLEAN` | CLEAN keeps the turtle where it is | No CLEAN | v8.12: `CLEAN` |
| `SHOWTURTLE` `HIDETURTLE` `SHOWNP` | | No SHOWNP | v8.12: `SHOWNP` / `SHOWN?` |
| `LABEL`, `SETLABELHEIGHT` | | No SETLABELHEIGHT | v8.12 (cheap): `SETLABELHEIGHT n` sets the LABEL font size |
| `FILL`, `FILLED colour [ … ]` | Flood fill; FILLED fills the shape drawn by the list | BEGINFILL / ENDFILL | v8.12: `FILLED colour [ … ]` built on BEGINFILL. Flood `FILL` is not planned; it becomes an info line, not an error. |
| `WRAP` `WINDOW` `FENCE` | | Same (v8.11) | OK |
| `SETSCRUNCH`, `TEXTSCREEN`, `SPLITSCREEN`, `FULLSCREEN` | Screen layout | Unknown command | v8.12: accepted as no-ops with an info line, so UCBLogo programs do not stop |
| `REPEAT`, `REPCOUNT`, `#` in templates | | Same (`REPCOUNT`) | OK |
| `FOR [i 1 10 2] [ … ]` | Control list | Only `FOR :i 1 10 2 [ … ]` | **v8.12**: accept the control-list form too: a name without colon, then 2–3 expressions inside `[ ]`. Both forms stay. |
| `WHILE [cond] [ … ]`, `UNTIL`, `DO.WHILE`, `DO.UNTIL` | | WHILE only | v8.12: the other three |
| `FOREVER` | In UCBLogo 6 | Same | OK |
| `IF`, `IFELSE`, `TEST` / `IFTRUE` / `IFT` / `IFFALSE` / `IFF` | | IF / IFELSE | v8.12: TEST and IFTRUE / IFFALSE |
| `true` / `false` | Words | Numbers 1 / 0 | v9.0: conditions accept the words (§2) |
| `AND a b`, `OR a b`, `NOT a`, `(AND a b c)` | Prefix | Infix `AND` / `OR`, prefix NOT | v8.12: prefix forms too (a parser case: AND at the start of an operand) |
| `SUM`, `DIFFERENCE`, `PRODUCT`, `QUOTIENT`, `MINUS`, `(SUM a b c)` | Prefix arithmetic | Missing | v8.12 |
| `REMAINDER` (sign of dividend), `MODULO` (sign of divisor) | | `MOD` (= MODULO) | v8.12: both names |
| `LOG10`, `LN`, `EXP`, `SQRT`, `POWER`, `INT`, `ROUND`, `ABS`, trig in degrees, `ARCTAN` | | Same, plus `LOG` = log10 | v8.12: `LOG10` alias |
| `RANDOM n`, `(RANDOM a b)` | | `RANDOM n` | v8.12: the two-input range form `(RANDOM a b)` |
| One-input function binding | Full expression | One operand | differs, kept (§6, §12) |
| `PRINT` `SHOW` `TYPE` | | PRINT only | v9.0 (needs values) |
| `"word` delimiters | Space, brackets, parentheses | Also `+ - * / = < >` | differs, kept (§4.2) |
| `~` at the end of a line | Line continuation | An error | **v8.12** |
| `;` comments | | Same | OK |
| `TO` / `END`, inputs, `[:opt default]` | | Same (v8.11) | OK |
| Rest inputs `[:rest]` | | Missing | v9.0 (§5) |
| `OUTPUT` / `OP`, `STOP` | | Same | OK |
| `MAKE "x`, `LOCAL`, `LOCALMAKE`, `:x`, `THING`, `NAME value "x` | | No THING / NAME | v8.12: `NAME value "x` (MAKE with its inputs swapped). v9.0: `THING`. Indirect `MAKE :v` is not added (§12). |
| Dynamic scope | | Same | OK |
| `WAIT n` | 60ths of a second | Seconds | differs, kept (§12) |
| `KEYP`, `READCHAR` / `RC`, `READWORD`, `READLIST`, `MOUSEPOS`, `BUTTONP`, `CLICKPOS` | | KEYP, READKEY (codes), MOUSEX / MOUSEY, BUTTONP | v9.0: READCHAR / RC; `MOUSEPOS` / `CLICKPOS` as lists. READWORD / READLIST later (non-goal). |
| `BYE`, `EDIT`, `SAVE`, `LOAD`, `ERASE`, `PO` | Workspace | Missing | Not planned; workspace handling is the editor and files UI |
| Property lists, macros, `CATCH` / `THROW`, arrays | | Missing | Not planned (TODO.md) |
