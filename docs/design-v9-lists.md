# Blue Logo v9 — Words and Lists (design)

Status: **proposal, not scheduled** (November 2026, written after v8.11).
Implementation comes later, as its own release series. Nothing in this document is in the code yet.

This is step 3 of the missing-features list in `TODO.md` → Language. Steps 1 (v8.9) and 2 (v8.11) added commands without changing existing programs. This step changes what a *value* is, and it also carries the one breaking change that was saved for it. That is why it is a **MAJOR** release.

---

## 1. Goals and non-goals

**Goals**
- Values can be **numbers, words or lists**, as in UCBLogo, so that teaching programs can work with names, sentences, scores, colour lists and points.
- The usual Logo list words: `FIRST`, `BUTFIRST`, `LAST`, `BUTLAST`, `ITEM`, `COUNT`, `EMPTY?`, `SENTENCE`, `LIST`, `FPUT`, `LPUT`, `WORD`, `MEMBER?`, `PICK`, plus `RUN` and `FOREACH`.
- Turtle state as lists: `PENCOLOR` → `[r g b]`, `POS` → `[x y]`, and `SETCOLOR` / `SETPOS` accepting a list.
- Every v8.11 program that does not use the few changed rules (§9) runs unchanged and draws the same picture. The example snapshots prove it.
- Error messages stay as clear as today: they name the wrong kind of value ("FIRST of an empty list", "[1 2] is a list, not a number").

**Non-goals (not in v9)**
- Mutable lists or arrays (`.SETFIRST`, `ARRAY`, `SETITEM`). Lists cannot be changed in place (§3.3).
- Property lists, `DEFINE` / `TEXT`, macros, `APPLY` / `MAP` / `FILTER` with templates. These may come later and would build on this value model.
- Strings with spaces as one value. A sentence is a list of words, as in Logo.
- Unicode-aware `WORD` splitting beyond JavaScript code points. Emoji are allowed but nobody needs to count them.

---

## 2. The value model

```ts
type Value = number | Word | List;
type Word  = string;               // the text, case kept: "Ann → 'Ann'
type List  = readonly Value[];     // frozen JS array, nested freely
```

- **Number**: as today (an IEEE double). `PRINT` and `LABEL` still format it with `formatNum`.
- **Word**: a JS string, case kept. `"Ann` is the word `Ann`. The empty word is `"` alone (today that is an error, "Empty word").
- **List**: a frozen array. `[]` is the empty list.

**Words that look like numbers are numbers.** As in UCBLogo, `"10` and `10` are interchangeable: `"10 + 1` is 11, and `FIRST 123` is the word `1`, which can be used as the number 1. A number in a list literal `[1 2 3]` is stored as a number (§4.1).
- One helper `num(v, who)` turns a value into a number or throws `who + ': ' + show(v) + ' is a word / list, not a number'`.
- Every command that needs a number calls it: FD, RT, SETPOS, REPEAT …. Today those handlers take a number from `evalExpr`; in v9 they call `num()`.

**Truth**: `IF` / `WHILE` / `AND` / `OR` / `NOT` keep treating 0 as false and any other number as true. The words `"true` / `"false` are also accepted (case ignored), because UCBLogo programs use them. A list, or any other word, as a condition is an error. Comparisons and `?` predicates still output 1 / 0, so existing programs keep working.

**Variables** (`Scope`) hold any `Value`. `MAKE "NAME "Ann` and `MAKE "L [1 2 3]` work.

---

## 3. Semantics

### 3.1 Equality and comparison

- `=` / `!=` / `<>` work on any two values:
  - **numbers**: as today (`approxEq`);
  - **words**: by text, ignoring upper / lower case, as in UCBLogo's default `CASEIGNOREDP`, so `"Ann = "ANN`;
  - **number-like word and number**: compared as numbers;
  - **lists**: equal when they have the same length and their items are equal one by one;
  - **different kinds** (a list and a word): not equal. This is not an error.
- `<` `>` `<=` `>=` stay **numbers only**, with an error for a word or list. `BEFORE?` (alphabetical order of two words) may be added for word comparison.
- `MEMBER?` uses the same equality.

### 3.2 Printing

| Command | `[a [b c] 3]` | `"Ann` | `0.1 + 0.2` |
|---|---|---|---|
| `PRINT` | `a [b c] 3` (outer brackets dropped) | `Ann` | `0.3` |
| `SHOW` (new) | `[a [b c] 3]` | `Ann` | `0.3` |
| `LABEL` | `a [b c] 3` | `Ann` | `0.3` |

- `(PRINT a b …)` / `(LABEL …)` (v8.11) join their inputs with spaces as today; a list input is shown without its outer brackets.
- The console prefix (`PRINT → `) is unchanged.
- An empty list prints as an empty line; `SHOW []` shows `[]`.

### 3.3 Lists cannot be changed

`FPUT`, `LPUT`, `BUTFIRST`, `SENTENCE` … always **output a new list**. The input list is never changed, so sharing it between variables is always safe: `MAKE "B :A` cannot be surprised by a later change to `:A`.
- **Implementation:** lists are frozen arrays (`Object.freeze`); `BUTFIRST` is `slice(1)`.
- **Cost:** copying makes `FPUT` / `BUTFIRST` O(n). With the caps in §8, recursion over a whole list is at most O(n²) = 10¹⁰ in theory, but teaching programs use lists of tens of items. If this is ever measured to matter, an internal persistent list (cons cells) can replace the arrays without changing the language.

### 3.4 Words as sequences

`FIRST`, `LAST`, `BUTFIRST`, `BUTLAST`, `ITEM`, `COUNT` and `EMPTY?` also work on words, letter by letter (`FIRST "Ann` → `A`). Numbers count as words here: `COUNT 1234` → 4. `WORD "ab "cd` → `abcd`.

---

## 4. Syntax

### 4.1 List literals

Where a **value** is expected, `[ … ]` is a list literal. Its contents are **not evaluated**: every token becomes a word, and number tokens become numbers.

```logo
MAKE "COLOURS [RED GREEN BLUE]
PRINT FIRST [10 20 30]          ; 10
MAKE "P [[0 0] [100 0] [50 80]] ; nested lists
```

- **Statement blocks are unchanged.** The `[ ]` after `REPEAT n`, `IF`, `WHILE`, `FOR`, `FOREVER` and `IFELSE` are still code blocks, taken by the control words exactly as today (`extractBlock`). Only `parsePrimary` gains a `[` case, so no existing program changes meaning: a `[` where a value was expected was always an error.
- **IFELSE as a value** (v8.9) keeps its meaning: the chosen block is *run*, giving its value (`PRINT IFELSE 1 [10] [20]` → 10). That is the same as UCBLogo, where the block is run as code.
- **Case must be kept inside lists.** Today `tokenize()` uppercases every token except `"words`, so `[Ann Bob]` would become `[ANN BOB]`.
  - Each token gets a second field, `raw` (the source text). A list literal builds its words from `raw`.
  - Everywhere else `text` (uppercase) is used, so commands stay case-insensitive.
  - `beautify` must not uppercase inside list literals either, but it does not know which `[` is data. Rule: beautify keeps the source case of every word inside `[ ]` that follows a value position. A simpler alternative: beautify never changes the case of words inside brackets that are not known command words. To be decided when implementing; the "beautify does not change the drawing" test, and a new "nor the output" test, will guard it.
- **Inside a list literal:**
  - `-5` is the number −5 (the tokenizer's `~` marker is turned back into a minus);
  - `:X` is the word `:X`;
  - `"A` is the word `"A` (UCBLogo keeps the quote);
  - `(` `)` are words;
  - `;` still starts a comment;
  - a list literal may span lines.

### 4.2 Words

`"Ann` is a word value anywhere a value is expected: `MAKE "N "Ann`, `PRINT WORD "Ann "e`. The v8 error "`"size` is a word, not a number — for a variable write `:size`" stays, but only where a number is really needed (`FD "size`).

### 4.3 What stays the same

- `:x` reads a variable.
- Precedence is unchanged; operators work on numbers (and number-like words).
- `MAKE "x` names a variable.
- `(PRINT …)` / `(LABEL …)` / `(PROC …)` work as in v8.11.

---

## 5. New and changed primitives

All take full values. "list|word" means either kind.

| Word | Inputs → output | Notes / errors |
|---|---|---|
| `FIRST` / `LAST` | list\|word → value | Error on `[]` / the empty word: "FIRST of an empty list" |
| `BUTFIRST` / `BF`, `BUTLAST` / `BL` | list\|word → list\|word | Error on empty |
| `ITEM n thing` | number, list\|word → value | 1-based; "ITEM 5 of a list of 3 items" |
| `COUNT` | list\|word → number | |
| `EMPTY?` | value → 1 / 0 | `[]` and the empty word |
| `LIST a b` | value, value → list | `(LIST a b c …)` takes any number (v8.11 parentheses) |
| `SENTENCE` / `SE a b` | → list | Flattens one level: `SE [a b] "c` → `[a b c]`; also `(SE …)` |
| `FPUT x list`, `LPUT x list` | value, list → list | |
| `WORD a b` | word, word → word | `(WORD …)` takes any number |
| `MEMBER? x thing` | → 1 / 0 | Uses `=` (§3.1) |
| `PICK list` | list → value | Random item; error on `[]` |
| `WORD?` / `LIST?` / `NUMBER?` | value → 1 / 0 | |
| `SHOW value` | command | §3.2 |
| `RUN list` | command, or a value when the list outputs one | Runs a list as code: `RUN [FD 50 RT 90]`. The list is turned back into tokens: words keep their case, and the line numbers of the `RUN` call are used for errors. `RUN` of a list built at run time is the one place where code comes from data. |
| `FOREACH :item list [ … ]` | loop | Like `FOR`: the variable exists only inside the loop; `REPCOUNT` is not set (use `FOR` for a counter); `BREAK` / `CONTINUE` work. Reads like `FOR` instead of UCBLogo's `?` templates (a deliberate difference). |
| `PENCOLOR` / `PC` | → `[r g b]` | Was not possible in v8 |
| `POS` | → `[x y]` | |
| `SETCOLOR list`, `SETBG list` | `[r g b]` | Besides name and `r g b` |
| `SETPOS list` | `[x y]` | Besides `x y`. SETPOS reads its first input: a 2-item list is the point; a number means a second input (the y) follows. |
| `READCHAR` | → word | The next key as a word (`"a`, `"A`, `"Space"`?, `"Left` …); `READKEY` (number codes, v8.11) stays |
| `BEFORE?` (maybe) | word, word → 1 / 0 | Alphabetical, case ignored |

Every new name becomes a built-in word, so programs with `TO FIRST`, `TO LIST`, `TO COUNT` … stop working (§9). Each word gets a Commands-panel card in a new **"Words and lists"** group, with examples and see-also links (the reference test enforces this).

---

## 6. Two-input functions bind like one-input functions (breaking)

Today `DISTANCE`, `TOWARDS`, `MAX`, `MIN`, `POWER` and prefix `MOD` take two *full expressions*. So `DISTANCE 0 0 > 5` means `DISTANCE 0 (0 > 5)` (lang-spec §3.3, §7), unlike `SQRT 16 + 9` = `(SQRT 16) + 9`.

**Proposal**: in v9 each input of these functions is **one operand**, as for `SQRT`:
- `DISTANCE 0 0 > 5` → `(DISTANCE 0 0) > 5`;
- `MAX :A :B + 1` → `(MAX :A :B) + 1`.

Use `( )` for an expression input: `MAX (:A + 1) :B`.

The new list words with two inputs (`ITEM`, `FPUT`, `LPUT`, `WORD`, `LIST`, `SENTENCE`, `MEMBER?`) follow the same rule from the start, so every built-in function binds the same way. **User procedures keep taking full expressions** (`FACT :N - 1` = `FACT (:N - 1)`): that is how Logo programs are written, and changing it would break most recursive procedures. The difference is documented, as it is today for `SQRT` vs a procedure.

Migration help: when a program fails or looks suspicious, a one-time hint in the console names the rule, e.g. "MAX takes one value per input since v9 — write MAX (:A + 1) :B". The exact trigger is to be decided; at least the examples and the Commands panel use the new form.

---

## 7. Implementation outline

Order matters: the value model first, then the list words, then turtle integration. Each phase leaves `npm test` green.

**Phase A — value model (no new words yet)**
1. `types.ts`: `Value`, `Scope` holding `Value`, `Token.raw`.
2. `expr.ts`: the parser returns `Value`.
   - `parsePrimary` gains `[` (list literal) and `"word`.
   - Operators call `num()`.
   - `=` uses the new equality.
   - Skip mode is unchanged (a skipped part yields 0).
   - `evalExpr` → `{ value: Value, nextIdx }`; a typed wrapper `evalNum` keeps the 25 numeric call sites in `commands.ts` and the 9 in `runtime.ts` short.
3. `scope.ts`: `formatValue` (PRINT form) and `showValue` (SHOW form) next to `formatNum`.
4. `commands.ts`: PRINT / LABEL / `(PRINT …)` print values; `wordArg` goes away (a `"word` is now just a value).
5. `tokenizer.ts`: `raw`. `beautify.ts` / `logo-language.ts`: list-literal case rule, and highlighting of `[ ]` contents as data.
6. All of tests/cases.js and the example snapshots must pass unchanged at this point. This proves phase A breaks nothing by accident.

**Phase B — words and lists**
- The primitives of §5: a new table `LIST_FNS` in a new module `interpreter/lists.ts`, with arity and binding per word.
- `RUN`: list → tokens → `runStack` frame, or `runExpr`-style when used as a value.
- `FOREACH`: a new frame `isForeach` in `runStack`, added to `isLoopFrame`.
- Caps (§8).

**Phase C — turtle and input integration**
- `PENCOLOR`, `POS`, list forms of SETCOLOR / SETBG / SETPOS, `READCHAR`.

**Phase D — binding change (§6)**
- `BINARY2` inputs parsed with `parseUnary` instead of `parseBinary`.
- Update the examples that rely on the old binding. The snapshot tests show which ones; the Chase example is the known case.
- Update lang-spec §3.3 / §7.

**Docs and UI**
- lang-spec: §1.2 Values rewritten, a new §2.x "Words and lists", the errors in §8 and the limitations in §7.
- impl-spec: the value model, the parser and the list module.
- CLAUDE.md "Language rules that are easy to get wrong".
- Commands panel: a "Words and lists" group; Examples topic "Words and lists".

**Release shape**: build phases A–D on one branch (or in several PRs into a `v9` branch) and release once as **v9.0**, so users see one breaking change, not four.

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
- `IF: [1 2] is a list, not a condition (true / false / 1 / 0)`
- `FPUT: the second input must be a list, got "abc`
- `RUN: … (in the list run by RUN, line 7)`, which names the line of the `RUN` call
- `List too long (more than 100 000 items)`

---

## 9. What breaks (migration notes for the v9.0 changelog)

| v8.11 | v9.0 | Who is affected |
|---|---|---|
| `DISTANCE 0 0 > 5` = `DISTANCE 0 (0 > 5)` | `(DISTANCE 0 0) > 5` | Programs with an operator after the last input of DISTANCE / TOWARDS / MAX / MIN / POWER / prefix MOD (§6) |
| `TO FIRST`, `TO LIST`, `TO COUNT`, `TO ITEM`, `TO WORD`, `TO PICK`, `TO SHOW`, `TO RUN`, `TO POS` … allowed | error: built-in word | Programs that defined these names |
| `MAKE "N "abc` → error | works (a word) | Nobody (a relaxation) |
| `PRINT [1 2]` → error | prints `1 2` | Nobody |
| `"` alone → "Empty word" error | the empty word | Nobody |
| `IF "true [ … ]` → error | runs | Nobody |

Everything else, including every v8.11 example except possibly Chase (§6), should run unchanged. The phase A test run is meant to prove that.

---

## 10. Testing plan

- **Phase A:**
  - the whole existing suite, including the snapshots, passes unchanged;
  - new cases for words as values, number-like words, list literals (case kept, nesting, negative numbers, `:X` as a word), `=` on words and lists, PRINT / SHOW / LABEL of lists.
- **Phase B:**
  - one case per primitive, including every error message in §8;
  - `RUN` (as a command, as a value, error line);
  - `FOREACH` with BREAK / CONTINUE and scoping like FOR;
  - immutability (`MAKE "B :A` then `FPUT` onto `:A` leaves `:B` unchanged);
  - the caps.
- **Phase C:**
  - unit tests: `PENCOLOR` round trip through `SETCOLOR`, and `SETPOS POS`;
  - a browser check that `READCHAR` gets a real key press.
- **Phase D:**
  - cases for the new binding;
  - every example's snapshot (any change must be explained in the changelog).
- **Beautify:**
  - keeps the case inside list literals;
  - idempotent;
  - does not change the drawing, nor the console output, of any example.
- **New examples:**
  - "Word games": reverse a word with recursion (`FIRST` / `BUTFIRST` / `WORD`), and count the vowels with `FOREACH` and `MEMBER?`;
  - "Colour list": `FOREACH :C [RED ORANGE …] [ SETCOLOR :C … ]`, `PICK` for random colours;
  - "Shapes from points": a polygon from a list of `[x y]` points with `SETPOS`, filled with BEGINFILL.

---

## 11. Open questions (decide before Phase A)

1. **Truth words.** Accept `"true` / `"false` as conditions (proposed: yes, input only; predicates still output 1 / 0)? Or should predicates output `true` / `false`, as in UCBLogo? That would change what `PRINT 3 > 2` shows (`true` instead of `1`). This document proposes to keep 1 / 0.
2. **Word case in `=`.** Ignore case (UCBLogo default, proposed) or exact?
3. **`READCHAR` names for special keys.** UCBLogo gives raw characters. Proposed: printable keys as themselves; Enter, Escape and the arrows as words such as `"ENTER`, `"ESCAPE`, `"LEFT`.
4. **Beautify and list case.** Which of the two rules in §4.1?
5. **Binding change (§6).** Confirm it goes into v9.0, or leave the two-input functions as they are and only document them.
6. **`FOREACH` form.** `FOREACH :item list [ … ]` (proposed, like FOR) vs UCBLogo's `FOREACH list [ … ? … ]`. Could both be accepted?
7. **Release shape.** One v9.0 with all phases (proposed) vs v9.0 = phases A–C and v9.1 = binding change.
