# Static continuation recovery from Classic Pool

The Classic Pool swap wrapper calls an uncaptured literal through `CALLXARGS 9 -1`.
The target is known even though the opcode leaves its return count variable.
Recovery extracts and independently analyses that target, then requires its argument
count to equal the encoded isolated width. Fixed-result literal calls also require
the inferred return count to match. The caller's saved stack remains outside the call.
Runtime targets and incompatible widths retain explicit diagnostics.

The legacy protected swap saves c4/c5/c7, captures five operand slots and composes
the success arm with c1. This compiler envelope now recovers as ordinary `try/catch`.
The handler receives only captured slots, exception value and exception code.
A small bare TRY with stack-only arms is also supported. Bare TRY with register
writes remains unsupported because source-language TRY would introduce a different
register restoration policy.

Cell validation uses `CTOS DROP` inside a protected arm. Its unused result must not
remove the runtime type check. Recovery emits an impure CTOS primitive there.

Validation on 2026-10-09:

- 112 Kotlin tests pass, including literal bare TRY and dynamic-call diagnostics.
- `tolk:static-calls`: eight positive cases, 39 Tolk getter probes and 34 FunC getter
  probes; raw/normalized BOC and gas match, and original/recompiled behavior matches.
- Six negative cases retain diagnostics: bare register writes, reading outside
  CALLXARGS isolation, fixed return mismatch, CALLXVARARGS isolation and unbounded width.
- The existing ten TRY scenarios pass 75 getter probes, including captured values,
  nested rethrows, and c4/c5/c7 restoration.
- DeDust recovery retains 17/21 exact readable contracts and 138 passing Acton tests.

These parser changes recover the complete Classic Pool swap logic. They do not yet
make its full readable recompilation byte-identical; that remains a separate gate.
