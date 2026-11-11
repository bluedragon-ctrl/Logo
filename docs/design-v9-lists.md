# Blue Logo v9 — Words and Lists (design)

Status: **agreed direction, not scheduled** (November 2026, written after v8.11).
Implementation comes later, as its own release series. Nothing in this document is in the code yet.

**Guiding rule: follow UCBLogo** (Berkeley Logo 6, Brian Harvey's *Computer Science Logo Style*) wherever Blue Logo has no strong reason to differ. Each open question of the first draft is decided that way (§11). The few deliberate differences that remain are listed in §12.

This is step 3 of the missing-features list in `TODO.md` → Language. Steps 1 (v8.9) and 2 (v8.11) added commands without changing existing programs. This step changes what a *value* is, and it brings two UCBLogo rules that change existing programs (§6, §9). That is why it is a **MAJOR** release.

---

## 1. Goals and non-goals

**Goals**
- Values are **numbers, words or lists**, as in UCBLogo, so that teaching programs can work with names, sentences, scores, colour lists and points.
- The UCBLogo list words with their UCBLogo names and behaviour:
  - `FIRST`, `BUTFIRST`, `LAST`, `BUTLAST`, `ITEM`, `COUNT`;
  - `EMPTYP`, `SENTENCE`, `LIST`, `FPUT`, `LPUT`, `WORD`, `MEMBERP`, `PICK`;
  - `RUN`, `FOREACH`.
  Each predicate is spelled both `…P` and `…?`.
- Turtle state as lists: `PENCOLOR` → `[r g b]`, `POS` → `[x y]`, and `SETPENCOLOR` / `SETPOS` accepting a list.
- A program written for UCBLogo that uses only the words Blue Logo has runs the same way.
- Error messages stay as clear as today: they name the wrong kind of value ("FIRST of an empty list", "[1 2] is a list, not a number").

**Non-goals (not in v9)**
- Mutable lists or arrays (`.SETFIRST`, `ARRAY`, `SETITEM`). In UCBLogo these are advanced features, so they are left out here (§3.3).
- Property lists, `DEFINE` / `TEXT`, macros.
- `MAP`, `FILTER`, `REDUCE`, `APPLY`. The template machinery that `FOREACH` needs (§5.1) makes them cheap later, so they are the first candidates for v9.x.
- Console input (`READWORD`, `READLIST`). They need a prompt line in the UI and can come later.
- Unicode-aware `WORD` splitting beyond JavaScript code points.

---

## 2. The value model

```ts
type Value = number | Word | List;
type Word  = string;               // the text, case kept: "Ann → 'Ann'
type List  = readonly Value[];     // frozen JS array, nested freely
```

- **Number**: as today (an IEEE double). `PRINT` and `LABEL` still format it with `formatNum`.
- **Word**: a JS string, case kept. `"Ann` is the word `Ann`. `"` alone is the empty word (today it is an error, "Empty word").
- **List**: a frozen array. `[]` is the empty list.

**Words that look like numbers are numbers** (UCBLogo). `"10` and `10` are interchangeable: `"10 + 1` is 11, and `FIRST 123` is the word `1`, which can be used as the number 1. A number in a list literal `[1 2 3]` is stored as a number (§4.1).
- One helper `num(v, who)` turns a value into a number or throws `who + ': ' + show(v) + ' is a word / list, not a number'`.
- Every command that needs a number calls it (FD, RT, SETPOS, REPEAT …) instead of taking a number straight from `evalExpr` as today.

**Truth values are the words `true` and `false`** (UCBLogo).
- Comparisons, `AND` / `OR` / `NOT` and every predicate output `true` or `false`. So `PRINT 3 > 2` shows `true`, and `PRINT PENDOWNP` shows `true`.
- `IF`, `IFELSE`, `WHILE` and `AND` / `OR` / `NOT` accept only `true` or `false`, case ignored, as in UCBLogo.
  - Anything else is an error: `IF: 1 is not true or false`.
  - Because the message names the rule, the old style `IF :FLAG` with 0 / 1 fails loudly instead of silently doing something else.
- Arithmetic on `true` / `false` is an error (they are words).

**Variables** (`Scope`) hold any `Value`. `MAKE "NAME "Ann` and `MAKE "L [1 2 3]` work.

---

## 3. Semantics

### 3.1 Equality and comparison

- `=` / `EQUALP` / `EQUAL?` / `!=` / `<>` / `NOTEQUALP` work on any two values (UCBLogo `EQUALP`):
  - **numbers**: by value; Blue Logo keeps its ~12-digit tolerance, `approxEq`, so `0.1 + 0.2 = 0.3` stays `true` (§12);
  - **words**: by text, ignoring upper / lower case (UCBLogo's default, `CASEIGNOREDP` is `true`), so `"Ann = "ANN`;
  - **number-like word and number**: compared as numbers;
  - **lists**: equal when they have the same length and their items are equal one by one;
  - **different kinds** (a list and a word): `false`, not an error.
- `<` `>` `<=` `>=` and `LESSP` / `GREATERP` compare **numbers only**; a word or a list is an error.
- `BEFOREP` / `BEFORE?` compares two words alphabetically. In UCBLogo this is case-sensitive unless `CASEIGNOREDP` is set; Blue Logo has no `CASEIGNOREDP`, so it ignores case, consistent with `=`.
- `MEMBERP` uses the same equality.

### 3.2 Printing

As UCBLogo:

| Command | `[a [b c] 3]` | `"Ann` | `3 > 2` |
|---|---|---|---|
| `PRINT` / `PR` | `a [b c] 3` (outer brackets dropped) | `Ann` | `true` |
| `SHOW` | `[a [b c] 3]` | `Ann` | `true` |
| `TYPE` | like PRINT, but no line break: the next `TYPE` / `PRINT` continues the same console line | | |
| `LABEL` | `a [b c] 3` | `Ann` | `true` |

- `(PRINT a b …)` / `(SHOW …)` / `(TYPE …)` / `(LABEL …)` join their inputs with spaces (v8.11 for PRINT / LABEL).
- The console prefix (`PRINT → `) is unchanged.
- An empty list prints as an empty line; `SHOW []` shows `[]`.
- Numbers are formatted with `formatNum` (`0.1 + 0.2` prints `0.3`), as today.

### 3.3 Lists cannot be changed

`FPUT`, `LPUT`, `BUTFIRST`, `SENTENCE` and the others always **output a new list**; the input list is never changed. This is what UCBLogo does for every word Blue Logo will have (only the dotted `.SETFIRST` family changes lists, and it is a non-goal). Sharing a list between variables is therefore always safe: `MAKE "B :A` cannot be surprised by a later change to `:A`.
- **Implementation:** lists are frozen arrays (`Object.freeze`); `BUTFIRST` is `slice(1)`.
- **Cost:** copying makes `FPUT` / `BUTFIRST` O(n), so recursion over a whole list with `BUTFIRST` is O(n²). At the 100 000-item cap (§8) that is about 5·10⁹ copied items, slow but stoppable. Teaching programs use lists of tens of items.
- If this is ever measured to matter, an internal persistent list (cons cells, as UCBLogo uses) can replace the arrays without changing the language.

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

- **Statement blocks are unchanged.** The `[ ]` after `REPEAT n`, `IF`, `WHILE`, `FOR`, `FOREVER` and `IFELSE` are still taken by the control words as code (`extractBlock`). Only `parsePrimary` gains a `[` case, so no existing program changes meaning there: a `[` where a value was expected was always an error.
  - In UCBLogo those blocks are lists too, run by the control word. With list values, Blue Logo can also accept a **list-valued expression** as a block (`REPEAT 4 :BODY`). This is proposed for phase B, with the literal-block path kept as the fast path.
- **IFELSE as a value** (v8.9) keeps its meaning: the chosen block is *run*, giving its value (`PRINT IFELSE 1 = 1 [10] [20]` → 10). UCBLogo does the same.
- **Case is kept inside lists.** Today `tokenize()` uppercases every token except `"words`, so `[Ann Bob]` would become `[ANN BOB]`.
  - Each token gets a second field, `raw` (the source text). A list literal builds its words from `raw`.
  - Everywhere else `text` (uppercase) is used, so commands stay case-insensitive.
- **Beautify keeps the source case of every word inside `[ ]`** (decided, §11). UCBLogo never rewrites what was typed. Beautify cannot tell a data list from a code block, and changing the case of data changes what a program prints.
  - Outside brackets beautify still uppercases commands and variable names.
  - Inside brackets it only indents and spaces.
  - The "beautify does not change the drawing" test gets a twin: "nor the console output".
- **Inside a list literal** (as UCBLogo):
  - `-5` is the number −5 (the tokenizer's `~` marker is turned back into a minus);
  - `:X` is the word `:X`;
  - `"A` is the word `"A`, quote included;
  - `(` `)` are words;
  - `;` still starts a comment;
  - a list literal may span lines.

### 4.2 Words

`"Ann` is a word value anywhere a value is expected: `MAKE "N "Ann`, `PRINT WORD "Ann "e`. The v8 error "`"size` is a word, not a number — for a variable write `:size`" stays, but only where a number is really needed (`FD "size`).

### 4.3 Inputs of built-in functions (UCBLogo binding, breaking)

In UCBLogo every input of a prefix function, built-in or user-defined, is a **full expression**, because infix operators bind tighter than prefix calls:

```logo
PRINT SQRT 16 + 9      ; UCBLogo: SQRT 25 = 5      (Blue Logo v8: (SQRT 16) + 9 = 13)
PRINT SIN :A * 2       ; UCBLogo: SIN (:A * 2)     (Blue Logo v8: (SIN :A) * 2)
PRINT RANDOM 6 + 1     ; UCBLogo: RANDOM 7         (Blue Logo v8: (RANDOM 6) + 1)
```

v9 follows UCBLogo. One-input functions (`SIN`, `SQRT`, `ABS`, `RANDOM`, …) take a full expression, like two-input functions (`MAX`, `DISTANCE`, …) and user procedures already do.
- One rule everywhere: **a prefix word takes everything up to the next input or the end of the expression; use `( )` to stop it early**, as in `(SQRT 16) + 9`.
- This reverses the v8.0 rule "single-input functions bind to one operand" (§6).
- The list words follow the same rule from the start: `FIRST :L + 1` is `FIRST (:L + 1)`, an error, so you write `(FIRST :L) + 1`.

### 4.4 What stays the same

- `:x` reads a variable.
- `*` `/` before `+` `-`, before comparisons, before `AND` / `OR`.
- `MAKE "x` names a variable.
- `(PRINT …)` / `(LABEL …)` / `(PROC …)` work as in v8.11.

---

## 5. New and changed primitives

All names and behaviour as in UCBLogo. "thing" is a list or a word.

| Word | Inputs → output | Notes / errors |
|---|---|---|
| `FIRST` / `LAST` | thing → value | Error on `[]` / the empty word: "FIRST of an empty list" |
| `BUTFIRST` / `BF`, `BUTLAST` / `BL` | thing → thing | Error on empty |
| `ITEM n thing` | number, thing → value | 1-based; "ITEM 5 of a list of 3 items" |
| `COUNT` | thing → number | |
| `EMPTYP` / `EMPTY?` | value → true / false | `[]` and the empty word |
| `LIST a b` | value, value → list | `(LIST a b c …)` takes any number |
| `SENTENCE` / `SE a b` | → list | Flattens one level: `SE [a b] "c` → `[a b c]`; also `(SE …)` |
| `FPUT x list`, `LPUT x list` | value, list → list | |
| `WORD a b` | word, word → word | `(WORD …)` takes any number |
| `MEMBERP` / `MEMBER? x thing` | → true / false | Uses `=` (§3.1) |
| `PICK list` | list → value | Random item; error on `[]` |
| `WORDP` / `LISTP` / `NUMBERP` (also `?` forms) | value → true / false | |
| `EQUALP` / `EQUAL?`, `NOTEQUALP`, `LESSP`, `GREATERP`, `BEFOREP` / `BEFORE?` | → true / false | Prefix forms of `=` `!=` `<` `>`, and word order (§3.1) |
| `AND a b`, `OR a b`, `NOT a` | true / false | UCBLogo's prefix forms; `(AND a b c …)` takes any number. Infix `a AND b` stays as a Blue Logo extension (§12). |
| `TRUE` / `FALSE` | | The words `true` / `false`; `"true` works too |
| `SHOW value`, `TYPE value` | commands | §3.2 |
| `RUN list` | command, or a value when the list outputs one | Runs a list as code: `RUN [FD 50 RT 90]`. Errors name the line of the `RUN` call. |
| `FOREACH list template` | loop | UCBLogo form, §5.1 |
| `PENCOLOR` / `PC` | → `[r g b]` | Was not possible in v8 |
| `POS` | → `[x y]` | |
| `SETPENCOLOR list` (and SETCOLOR / SETPC), `SETBG list` | `[r g b]` | Besides a name and `r g b` |
| `SETPOS list` | `[x y]` | UCBLogo's form. The v8 form `SETPOS x y` stays (§12): SETPOS reads its first input, and a number means a second input follows. `SETXY x y` is UCBLogo's two-number form. |
| `READCHAR` / `RC` | → word | UCBLogo: waits for one key and outputs it as a one-character word (`a`, `A`, `7`, a space). Enter gives `CHAR 13`, Escape `CHAR 27`, Backspace `CHAR 8`. Arrow keys have no character, so READCHAR skips them; `READKEY` (v8.11 key codes) stays for arrows. |
| `CHAR n` / `ASCII word` | number ↔ one-character word | UCBLogo, e.g. `ASCII "A` = 65, so `READKEY` and `READCHAR` results can be compared |
| `PENDOWNP` | → true / false | UCBLogo's name for `PENDOWN?`; the v8 `?` names stay as aliases |

Every new name becomes a built-in word, so programs with `TO FIRST`, `TO LIST`, `TO COUNT` and so on stop working (§9). Each word gets a Commands-panel card in a new **"Words and lists"** group, with examples and see-also links (the reference test enforces this). The `…P` / `…?` pairs are forms of one card.

### 5.1 FOREACH and templates

UCBLogo form: `FOREACH list template`. The template is a list run once per item. Inside it:
- `?` is the current item;
- `#` is its position (1, 2, …), like `REPCOUNT`;
- `?REST` is the rest of the list after the current item.

```logo
FOREACH [RED GREEN BLUE] [ SETPENCOLOR ? FD 50 RT 120 ]
FOREACH [10 20 30] [ PRINT # * ? ]
FOREACH "Ann [ PRINT ? ]                     ; a word: letter by letter
FOREACH [3 4 5] [[N] REPEAT :N [ FD 40 RT 360 / :N ]]   ; named-slot template
```

- **Named-slot templates** `[[N] … :N …]` (UCBLogo 6) are supported, because `?` inside nested REPEATs is confusing for beginners. The examples use them.
- `BREAK` / `CONTINUE` work as in other Blue Logo loops (an extension; UCBLogo has no BREAK).
- `?`, `#` and `?REST` are only valid inside a template. Elsewhere they are errors.
- Implementation: a `runStack` frame `isForeach`, added to `isLoopFrame`. The same template code later serves `MAP` / `FILTER` (non-goals here).

---

## 6. Binding of function inputs (breaking)

Decided: **UCBLogo binding** (§4.3). Every input of every prefix function is a full expression, so the v8 special case for one-input functions goes away. Two-input functions (`DISTANCE`, `MAX`, …) are unchanged, since they already take full expressions.

What changes, and how to write it so it works in both versions:

| v8 (one-operand rule) | v9 (UCBLogo) | Write instead |
|---|---|---|
| `SIN :A * :H` = `(SIN :A) * :H` | `SIN (:A * :H)` | `:H * SIN :A` or `(SIN :A) * :H` |
| `SQRT 16 + 9` = 13 | 5 | `(SQRT 16) + 9` |
| `RANDOM 6 + 1` = 1 … 6 | `RANDOM 7` = 0 … 6 | `1 + RANDOM 6` |
| `ABS XCOR + ABS YCOR` | `ABS (XCOR + ABS YCOR)` | `(ABS XCOR) + ABS YCOR` |

**Known places to update:**
- **Example 28** (DOT — Sine Wave Scatter): `MAKE "Y SIN :A * :H` becomes `MAKE "Y :H * SIN :A`.
- **Example 17** (Sine Wave): its comment explains the v8 rule; the code is already `180 * SIN :X`, which works in both versions.
- **Commands panel:** the RANDOM card ("RANDOM 6 + 1 is a dice throw") and the ARC case in `tests/cases.js` (`ABS XCOR + ABS YCOR`).
- **`tests/cases.js`:** "unary function binds tight" (`SIN 30 * 2`).
- **lang-spec:** §3 (precedence table) and §3.3.

**Migration help:**
- The phase D test run lists every example whose drawing changes.
- The Commands-panel cards of the math functions show the `( )` form.
- The v9.0 changelog lists the rule first.
- A console hint for a few common patterns (a function followed by `*` or `+`) would be nice, but it cannot be reliable, so it is optional.

---

## 7. Implementation outline

Order matters. Phases A–C add things without changing existing programs; phase D brings the two UCBLogo rule changes. Each phase leaves `npm test` green.

**Phase A — value model (no new words, no behaviour change)**
1. `types.ts`: `Value`, `Scope` holding `Value`, `Token.raw`.
2. `expr.ts`: the parser returns `Value`.
   - `parsePrimary` gains `[` (list literal) and `"word`.
   - Operators call `num()`.
   - `=` uses the new equality.
   - Skip mode is unchanged (a skipped part yields 0).
   - `evalExpr` → `{ value: Value, nextIdx }`; a typed wrapper `evalNum` keeps the 25 numeric call sites in `commands.ts` and the 9 in `runtime.ts` short.
3. `scope.ts`: `formatValue` (PRINT form) and `showValue` (SHOW form) next to `formatNum`.
4. `commands.ts`: PRINT / LABEL / `(PRINT …)` print values; `wordArg` goes away (a `"word` is now just a value).
5. `tokenizer.ts`: `raw`. `beautify.ts` / `logo-language.ts`: keep the case inside brackets (§4.1), and highlight `[ ]` contents as data.
6. All of `tests/cases.js` and the example snapshots must pass unchanged at this point (truth values are still 1 / 0). This proves phase A breaks nothing by accident.

**Phase B — words and lists**
- The primitives of §5 in a new module `interpreter/lists.ts` (a table with arity per word), plus `SHOW`, `TYPE`, `RUN`, `FOREACH` with templates (§5.1), and list-valued blocks for the control words (§4.1).
- Caps (§8).

**Phase C — turtle and input integration**
- `PENCOLOR`, `POS`, list forms of SETPENCOLOR / SETBG / SETPOS, `READCHAR` / `RC`, `CHAR`, `ASCII`, `PENDOWNP`.

**Phase D — UCBLogo rules (breaking)**
1. Truth values `true` / `false` (§2):
   - predicates, comparisons and `AND` / `OR` / `NOT` output words;
   - conditions require them;
   - prefix `AND` / `OR` / `NOT` and the `…P` names.
   `tests/cases.js` expectations such as `PRINT → 1` become `PRINT → true`. The examples need checking for numeric conditions; the reference examples are checked by the "every example runs" test.
2. Function-input binding (§6): one-input functions parse their input with `parseBinary(p, 1)` instead of `parseUnary`. Update example 28, the reference cards and the cases listed in §6.
3. lang-spec: §1.2, §3 and the error table in §8.

**Docs and UI**
- lang-spec: §1.2 Values rewritten; a new §2.x "Words and lists"; the errors in §8; the limitations in §7; a new short section "Differences from UCBLogo" (from §12).
- impl-spec: the value model, the parser and the list module.
- CLAUDE.md "Language rules that are easy to get wrong".
- Commands panel: a "Words and lists" group; Examples topic "Words and lists".

**Release shape**: phases A–D on one branch (or several PRs into a `v9` branch), released once as **v9.0**, so users meet the breaking changes once.

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
- `IF: 1 is not true or false` / `IF: [1 2] is a list, not true or false`
- `FPUT: the second input must be a list, got "abc`
- `? used outside a FOREACH template`
- `RUN: … (in the list run by RUN, line 7)`, which names the line of the `RUN` call
- `List too long (more than 100 000 items)`

---

## 9. What breaks (migration notes for the v9.0 changelog)

| v8.11 | v9.0 | Who is affected |
|---|---|---|
| `PRINT 3 > 2` → `1`; predicates (`PD?`, `KEYP`, `BUTTONP` …) output 1 / 0 | `true` / `false` | Programs that print a comparison, or do arithmetic with a predicate (`:N + (3 > 2)`) |
| `IF 1 [ … ]`, `IF :FLAG [ … ]` with 0 / 1, `WHILE [1] [ … ]` | error: `1 is not true or false` | Programs that use numbers as conditions. Write `IF :FLAG = 1`, or store `"true` / `"false` |
| `SIN :A * 2` = `(SIN :A) * 2` (one-input functions take one operand) | `SIN (:A * 2)` (§6) | Programs with an operator after a one-input function's input; example 28 |
| `TO FIRST`, `TO LIST`, `TO COUNT`, `TO ITEM`, `TO WORD`, `TO PICK`, `TO SHOW`, `TO TYPE`, `TO RUN`, `TO POS`, `TO CHAR`, `TO TRUE` … allowed | error: built-in word | Programs that defined these names |
| `MAKE "N "abc` → error | works (a word) | Nobody (a relaxation) |
| `PRINT [1 2]` → error | prints `1 2` | Nobody |
| `"` alone → "Empty word" error | the empty word | Nobody |

---

## 10. Testing plan

- **Phase A:**
  - the whole existing suite, including the snapshots, passes unchanged;
  - new cases for words as values, number-like words, list literals (case kept, nesting, negative numbers, `:X` as a word), `=` on words and lists (case ignored), and PRINT / SHOW / LABEL of lists.
- **Phase B:**
  - one case per primitive, including every error message in §8;
  - `RUN` (as a command, as a value, error line);
  - `FOREACH` with `?`, `#`, `?REST`, named slots, a word as input, and BREAK / CONTINUE;
  - list-valued blocks (`REPEAT 4 :BODY`);
  - immutability (`MAKE "B :A` then `FPUT` onto `:A` leaves `:B` unchanged);
  - the caps.
- **Phase C:**
  - unit tests: `PENCOLOR` round trip through `SETPENCOLOR`, `SETPOS POS`, `CHAR` / `ASCII`;
  - a browser check that `READCHAR` gets a real key press.
- **Phase D:**
  - cases for `true` / `false` output and for conditions rejecting numbers;
  - cases for the binding table in §6;
  - every example's snapshot: example 28 is updated and must draw the same picture as in v8.11, and any other change must be explained in the changelog.
- **Beautify:**
  - keeps the case inside brackets;
  - idempotent;
  - does not change the drawing, nor the console output, of any example.
- **UCBLogo conformance:** a small set of programs from *Computer Science Logo Style* vol. 1 (word games, list recursion), with the output UCBLogo gives, as cases.
- **New examples:**
  - "Word games": reverse a word with recursion (`FIRST` / `BUTFIRST` / `WORD`), and count the vowels with `FOREACH` and `MEMBERP`;
  - "Colour list": `FOREACH [RED ORANGE …] [ SETPENCOLOR ? … ]`, `PICK` for random colours;
  - "Shapes from points": a polygon from a list of `[x y]` points with `SETPOS`, filled with BEGINFILL.

---

## 11. Decisions (open questions of the first draft, decided by the UCBLogo rule)

| # | Question | Decision |
|---|---|---|
| 1 | Truth values | UCBLogo: predicates and comparisons output `true` / `false`; conditions accept only those (§2). Breaking, phase D. |
| 2 | Case in `=` | UCBLogo default: case ignored (`"Ann = "ANN`) (§3.1). |
| 3 | `READCHAR` | UCBLogo: one-character word; Enter / Escape / Backspace as `CHAR 13` / `27` / `8`; arrows are not characters, so they stay with `READKEY`. Alias `RC`; `CHAR` / `ASCII` added (§5). |
| 4 | Beautify and case in lists | UCBLogo never rewrites input, so beautify keeps the source case of every word inside `[ ]` (§4.1). |
| 5 | Binding change | UCBLogo binding: every prefix function input is a full expression. This drops the v8 one-operand rule for one-input functions; two-input functions stay as they are (§4.3, §6). |
| 6 | `FOREACH` form | UCBLogo: `FOREACH list template` with `?`, `#`, `?REST`, plus named-slot templates `[[x] …]` (§5.1). The `FOR`-like form of the first draft is dropped. |
| 7 | Release shape | Not a UCBLogo question. One v9.0 with all phases, so the breaking changes arrive together. |

---

## 12. Deliberate differences from UCBLogo that stay

These are Blue Logo features that existing programs and the examples rely on, and they do not conflict with UCBLogo programs:

| Blue Logo | UCBLogo | Why it stays |
|---|---|---|
| Infix `a AND b`, `a OR b`, `!=` | Prefix `AND a b`, `OR a b`; `NOTEQUALP` | Easier to read for beginners. v9 adds the prefix forms, so UCBLogo programs run too. |
| Approximate `=` for numbers (~12 digits) | Exact | `0.1 + 0.2 = 0.3` should be true in a classroom |
| `SETCOLOR r g b` with 0–255, 17 colour names | `SETPENCOLOR` with a palette number or `[r g b]` in 0–100 | 0–255 is what pupils meet elsewhere (and FMSLogo uses it). The palette numbers 0–15 could be added later. |
| `SETPOS x y` | `SETPOS [x y]` only | Both work in v9 (§5) |
| `REPEAT 2.5` runs 3 times (rounding) | Truncates | Avoids surprises from floating-point drift |
| `CIRCLE` / `ARC` walk the turtle | `ARC` draws around a turtle that stays put | Consistent with each other; documented since v8.9 |
| `MAKE :x 5` sets `x` | Sets the variable *named by* the value of `:x` | Kept as a shortcut for beginners (examples use `"x`). Could warn in v9.x. |
| `BREAK` / `CONTINUE` | No such words (`STOP` / `OUTPUT` only) | Kept as extensions; they do not clash with UCBLogo names |
| `WAIT n` in seconds | `WAIT n` in 60ths of a second | Kept: seconds are simpler to teach. A UCBLogo program waits 60 times longer — listed in the lang-spec differences section |
