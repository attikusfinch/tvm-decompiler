# Library provenance

| Library | Source / version | Use |
| --- | --- | --- |
| FunC standard library | `func/stdlib.fc`, unchanged copy from the published recovery archive | Common cell, dictionary and TVM primitives for Classic |
| Tolk standard library | `@ton/tolk-js` **1.4.0**, pinned by npm integrity | Exact contract compilation |
| Acton + test stdlib | Acton **1.2.1**, initialized into each project's ignored `.acton` | Modern Tolk test compilation and local TVM emulation |
| TON core / crypto | **0.63.1 / 3.3.0**, npm integrity pinned | Cell, BOC, address and proof tooling |
| Legacy StateInit hashing | `uranus/contracts/common/state-init-v2.tolk`, `cpmm/contracts/pool-v2/stdlib-legacy-stateinit.tolk` | Adapted Tolk 1.1 primitives; source URL and LGPL notices remain in each file |
| Testing utilities | `testing/chain.tolk` | Authored archived-message decoding and VM assertions |

The FunC stdlib declares **LGPL v2 or later** in its original header. The legacy Tolk
module identifies its upstream commit and license. These notices are retained;
normalization does not relicense upstream code or claim ownership of protocol sources.
On-chain library references in contracts remain references to their deployed code
hashes; tests register freshly compiled code in the local emulator only.
