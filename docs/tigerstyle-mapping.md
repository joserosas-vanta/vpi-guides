# TigerStyle agent-port mapping

## Ownership, source, and contract

- Owner: pi-guides maintainers.
- Status: unreleased semantic revision of `tigerstyle`, not an editorial-only cleanup.
- Input: the supplied TigerStyle document, from "The Essence Of Style" through "The Last Stage",
  used in the design review for this change. An exact upstream commit has not been established.
  The quoted anchors below identify the passages used; this is not a claim about current upstream.
- Upstream location: <https://github.com/tigerbeetle/tigerbeetle/blob/main/docs/TIGER_STYLE.md>.
  This moving URL is a discovery reference, not an immutable source pin.
- Output: `files/tigerstyle-strict-full.md` and `files/tigerstyle-strict-compact.md`, with the same
  application contract, category headings, 69 rule IDs, titles, and normative bodies.
- Failure contract: an agent reports applicable-rule conflicts, material recommendation departures,
  and verification gaps; expected operating failures stay errors, not assertion crashes.
- Format checks: `node --test tests/tigerstyle-guides.test.js` rejects missing/duplicate IDs,
  normative drift, malformed commentary boundaries, and BCP 14 obligations inside commentary.
- Version signaling: package revision/pin identifies policy semantics. Registry/config versions
  remain 1; no new configuration field, guide, variant, profile, or runtime mechanism is introduced.
- Source follow-up: before claiming fidelity to a published upstream revision, maintainers identify
  an immutable source revision and recheck this mapping. The current adaptation is reviewable from
  these anchors and the supplied baseline, but exact upstream-version provenance is unresolved.

BCP 14 (RFC 2119 and RFC 8174) supplies the requirement keywords, not the category-number format.
The existing category-number identifiers are package traceability identifiers. Strict enforcement
respects scope and the difference between MUST and SHOULD; it does not promote every recommendation.

## Compatibility and controlled cutover

This revision intentionally changes obligations for existing consumers. It is behaviorally breaking
as an instruction contract even though activation schemas and paths are unchanged. Existing rule
references retain their subjects, not a guarantee that the old wording still applies.

- Fixed: full/compact no longer disagree about obligation strength, applicability, or exceptions.
- Restored: upstream recommendations, single-caller naming scope, intentional-copy qualification,
  end-of-line comment allowance, and the programmer-error/operating-error distinction.
- Added: explicit portability behavior, anti-cosmetic-compliance requirements, bounded overload
  behavior, truthful verification, and safe treatment of asynchronous preconditions.
- Retained: 70-line functions, 100-column code, no authored recursion, aggregate assertion density,
  and explicit error/boundary coverage within the application contract.
- Removed: blanket helper-branch and noun-only mandates, arbitrary shell/dependency line thresholds,
  manual-unrolling encouragement, inaccurate arithmetic, and universalized failure statistics.

Maintainers release this as an explicitly documented policy revision without moving an existing
release tag. Consumers pinned to an older package retain the old policy until they deliberately
upgrade. Local-path consumers see the changed files when their loader next reads them. Review local
exceptions and affected rule references before upgrading; do not perform unrelated code migrations
merely because this guide changed. There are no deprecated config fields or new migration commands.

## Authoring and parity contract

The full document is the authoring source. Compact is its normative projection, not an independent
summary. Edit the shared application contract and each normative rule identically in both files.
Only the first title's Full/Compact label differs. A full rule's explanation starts with the exact
heading `#### Commentary (non-normative)` and ends at the next category/rule heading or end of file.
Compact contains no commentary sections. There is no repeated rule-index paraphrase.

All scope, exceptions, permissions, failure behavior, and verification obligations belong in the
shared text. Commentary explains why or illustrates an already stated rule; it does not create new
requirements, including requirements phrased without uppercase keywords. Automated checks catch
structural drift, not every possible implicit instruction. Human review still checks that boundary.

No generator or runtime Markdown parser is added. The test-local projection compares every normative
section, allowing only separator whitespace at section ends to differ. It also rejects a shared
missing ID, so equality between two incomplete documents is not sufficient.

Tradeoff: preserving qualifications increases compact from about 2,200 to about 4,100 words. Full
remains about 6,500 words instead of about 7,000. These are word counts, not token measurements.
This spends context on scope and safe defaults rather than 69 repetitive examples or a duplicate
index. It makes no unmeasured claim that a longer prompt improves adherence.

## Mapping method

- **Preserved:** source obligation and scope retained, expressed with BCP 14 keywords.
- **Clarified:** operative condition or failure interpretation made explicit without intentionally
  changing source policy.
- **Adapted:** a deliberate scope, strength, portability, or agent-behavior change from the source.
  An entry can both preserve a principle and adapt its implementation; the label records the latter.

The application contract is an **adaptation**. It combines source priority, mental-model
reasoning, simplicity through revision, and technical-debt discipline with explicit scope control,
conflict reporting, strong defaults, and anti-cosmetic-compliance safeguards. Upstream's zero-debt
stance is scoped to showstoppers in changed work, not permission for autonomous repository cleanup.

The core source distinction is: "Unlike operating errors, which are expected and which must be
handled, assertion failures are unexpected." All assertion and signature rules are read with that
error model, in both variants.

## Safety & Correctness

- **SAF-01 — Clarified.** "Use only very simple, explicit control flow" and "Do not use recursion."
  Applies to authored direct and indirect calls; iterative replacements still need bounded state.
- **SAF-02 — Adapted.** "Put a limit on everything"; "Where a loop cannot terminate ... asserted."
  Adds justified input/budget bounds, explicit exhaustion and backpressure, bounded event batches,
  and shutdown-contract assertions instead of asserting that every retry eventually succeeds.
- **SAF-03 — Adapted.** "Use explicitly-sized types like u32 ... avoid ... usize."
  Adds required-interface conversions and range/precision checks for languages without fixed widths.
- **SAF-04 — Adapted.** "Assert all function arguments and return values, pre/postconditions and
  invariants." Preserves the source error distinction; construction/type guarantees can establish
  an obligation without adding a redundant runtime assertion.
- **SAF-05 — Clarified.** "Assertion density ... average a minimum of two assertions per function."
  Keeps the aggregate number, rejects per-function padding, and requires a measured-scope claim.
- **SAF-06 — Adapted.** "Try to find at least two different code paths" for paired assertions.
  Restores SHOULD, adding explicit protection against manufactured paths and crashing on expected
  external corruption. Reader/writer pairing remains the illustrative case.
- **SAF-07 — Clarified.** "Split compound assertions." Independent obligations are checked apart
  while preserving safe evaluation of dependent expressions.
- **SAF-08 — Adapted.** "Use single-line if to assert an implication."
  Keeps direct implication; permits multiline syntax required by a language or formatter.
- **SAF-09 — Adapted.** "Assert the relationships of compile-time constants" and type sizes.
  Keeps compile-time priority; adds startup fallback and validation of runtime-known configuration.
- **SAF-10 — Clarified.** "Assert the positive space ... AND ... negative space."
  Separates impossible internal states from legitimate rejected input; both sides need coverage.
- **SAF-11 — Adapted.** "Tests must test exhaustively ... valid ... invalid ... becomes invalid."
  Exhaustive testing is recommended for small finite domains; boundary coverage for larger
  domains includes operating failures and unchanged-state obligations after rejection.
- **SAF-12 — Adapted.** "No memory may be dynamically allocated ... after initialization."
  Retains that model for controlled native paths, permits teardown, and substitutes bounded owned
  state for managed runtimes. Hidden allocator behavior is not claimed to be statically controlled.
- **SAF-13 — Clarified.** "Smallest possible scope" and "minimize the number of variables in scope."
  Avoids hoisted or obsolete temporaries; complements the check-to-use concern in CIS-05.
- **SAF-14 — Clarified.** "Hard limit of 70 lines per function."
  Defines physical-line counting and rejects compressed code or meaningless wrapper extraction.
- **SAF-15 — Adapted.** "When splitting a large function, try to keep all switch/if statements in
  the parent." Restores a decomposition default and explicitly allows local computation/validation
  branches while discouraging scattered orchestration.
- **SAF-16 — Adapted.** "Centralize state manipulation" and "Keep leaf functions pure."
  Computational helpers remain pure by default; necessary I/O helpers expose their effects and
  ownership rather than pretend every possible leaf function is pure.
- **SAF-17 — Adapted.** "All compiler warnings at the compiler's strictest setting."
  Requires strict applicable compiler diagnostics and relevant project checks; narrowly documented
  tool incompatibilities/suppressions replace a universal all-linters/no-suppression mandate.
- **SAF-18 — Adapted.** "Don't do things directly in reaction to external events."
  Keeps bounded batching for owned scheduling; preserves required framework callback lifecycles
  without adding an incompatible scheduler purely for compliance.
- **SAF-19 — Adapted.** "Split compound conditions" and complex else-if trees.
  Keeps distinct decisions explicit; allows a single local-invariant predicate, preserving
  short-circuit safety and evaluation order. Complex chains use a strong case-tree default.
- **SAF-20 — Adapted.** "State invariants positively."
  Uses a strong positive-form default while permitting clear complementary error guards; this is
  not a claim that every syntactic negation violates upstream's intent.
- **SAF-21 — Adapted.** "All errors must be handled."
  Adds explicit propagation, cleanup, invariant-preserving recovery, and confidential diagnostics.
  Commentary scopes the 92% result to the cited study rather than all production failures.
- **SAF-22 — Adapted.** "Always motivate, always say why."
  Non-obvious decisions need recorded rationale; fabricated history/measurements are prohibited.
- **SAF-23 — Adapted.** "Explicitly pass options ... instead of relying on the defaults."
  Requires consequential supported options; allows acceptable nonconsequential defaults under the
  documented/pinned library contract, avoiding giant copied default objects and nonexistent options.

## Performance & Design

- **PERF-01 — Adapted.** "Think about performance from the outset."
  Keeps upfront architectural reasoning with analysis proportional to changed resource behavior.
- **PERF-02 — Adapted.** "Four resources ... bandwidth, latency."
  Requires sketches for resource-affecting designs, explained irrelevant resources, explicit units
  and assumptions, and a distinction between estimates and measurements. Corrects the old example.
- **PERF-03 — Clarified.** "Optimize for the slowest resources first ... frequency of usage."
  Uses a justified, workload-weighted default, not an unconditional hardware ordering.
- **PERF-04 — Adapted.** "Distinguish between the control plane and data plane."
  Applies a strong default to bulk processing without mandating new layers for small operations.
- **PERF-05 — Adapted.** "Amortize ... costs by batching accesses."
  Makes batching a strong default bounded by latency, waiting time, partial failure, and contracts.
- **PERF-06 — Clarified.** "Be predictable" and "large enough chunks of work."
  Defaults to hot-path locality/predictability; does not ban branches in cold code.
- **PERF-07 — Adapted.** "Minimize dependence on the compiler to do the right thing."
  Requires evidence or an unverified label for consequential compiler assumptions; rejects manual
  unrolling based solely on intuition rather than banning compiler optimizations themselves.
- **PERF-08 — Adapted.** "Extract hot loops ... primitive arguments without self."
  Scopes the recommendation to relevant hot-loop aliasing behavior and preserves lifetime/bounds.

## Developer Experience & Naming

- **DX-01 — Clarified.** "Get the nouns and verbs just right."
  Requires accurate domain names without a universal blacklist of words such as handler or data.
- **DX-02 — Adapted.** "Use snake_case for function, variable, and file names."
  Permits established language/repository naming while protecting existing external contracts.
- **DX-03 — Adapted.** "Do not abbreviate ... sort function or matrix calculation"; use long flags.
  Adds primitive loop counters and fixed external names; retains established domain acronyms.
- **DX-04 — Clarified.** "Proper capitalization for acronyms (VSRState, not VsrState)."
  Reconciles mixed-case examples with snake_case and required external spellings.
- **DX-05 — Preserved.** "Units or qualifiers last, sorted by descending significance."
  Retains subject-first quantitative naming and distinctions between units and quantities.
- **DX-06 — Clarified.** "Allocator is a good ... name"; arena and similar names are "excellent."
  Restores a preference, not an absolute lifecycle-encoding requirement for every identifier.
- **DX-07 — Clarified.** "Try hard to find names with the same number of characters."
  Keeps a strong preference when names are equally precise, not forced lexical symmetry.
- **DX-08 — Adapted.** "When a single function calls out to a helper ... prefix the name."
  Uses SHOULD for dedicated helpers and domain names for shared helpers, not universal prefixes.
- **DX-09 — Adapted.** "Callbacks go last in the list of parameters."
  Preserves authored API order; respects immutable external callback signatures.
- **DX-10 — Adapted.** "Put important things near the top."
  Upstream also says "not everything has a single right order."
  Uses a strong default, with language prerequisites and initialization semantics taking precedence.
- **DX-11 — Adapted.** "Fields then types then methods"; complex nested types become top-level.
  Makes layout a language-scoped default that cannot silently change ABI or initialization order.
- **DX-12 — Clarified.** "Don't overload names with multiple meanings that are context-dependent."
  Targets misleading domain terminology, not all ordinary vocabulary reused in local contexts.
- **DX-13 — Clarified.** "A noun is often a better descriptor."
  Restores a preference for concept names and preserves verbs for operations.
- **DX-14 — Adapted.** "Use [options structs] when arguments can be mixed up."
  Permits native named arguments; protects fixed positional APIs without redundant wrapper demands.
- **DX-15 — Adapted.** "If an argument can be null, it should be named."
  Requires visible null semantics, with named local values for fixed external positional APIs.
- **DX-16 — Adapted.** "Singletons with unique types ... positionally ... general to specific."
  Uses a strong default while respecting required named/framework injection conventions.
- **DX-17 — Adapted.** "Write descriptive commit messages"; PR descriptions are not a replacement.
  Keeps durable rationale but does not grant the agent authorization to create a commit.
- **DX-18 — Clarified.** "Use comments to explain why"; "Code alone is not documentation."
  Rejects commentary quotas while permitting contract explanations of observable behavior.
- **DX-19 — Adapted.** "Description at the top to explain the goal and methodology of the test."
  Makes coverage intent explicit; permits clearly scoped descriptions shared by related tests.
- **DX-20 — Adapted.** "Comments are sentences"; end-of-line comments "can be phrases."
  Restores punctuation exceptions and adds syntax-required machine directive spellings.

## Cache Invalidation & State Hygiene

- **CIS-01 — Adapted.** "Don't duplicate variables or take aliases to them."
  One authoritative owner is mandatory; justified derived caches and read-only references are
  permitted with ownership/invalidation/consistency obligations, not a blanket alias ban.
- **CIS-02 — Adapted.** "If you don't mean a function argument to be copied ... more than 16 bytes."
  Restores intentional-copy scope and adds language-reference/lifetime safeguards.
- **CIS-03 — Adapted.** "Construct larger structs in-place ... out pointer."
  Keeps a strong default, permits guaranteed copy elision, and requires stability when correctness
  depends on it rather than assuming every language has Zig-style out pointers.
- **CIS-04 — Adapted.** "In-place initializations are viral."
  Preserves nested stability guarantees using the language's ownership/pinning equivalent.
- **CIS-05 — Clarified.** "Calculate or check variables close to where/when they are used."
  Keeps temporal/spatial check-use gaps explicit, with CIS-07 covering suspension.
- **CIS-06 — Clarified.** "Simpler function signatures and return types ... reduce dimensionality."
  Uses the simplest sufficient contract without erasing expected errors in pursuit of void returns.
- **CIS-07 — Adapted.** "Run to completion without suspending."
  Permits required async work with stable ownership or revalidation of staleable facts; even a
  freshly checked external connection can fail on the subsequent operation.
- **CIS-08 — Adapted.** "Buffer ... not fully utilized, with padding not zeroed correctly."
  Requires initialized bounds and zeroing or exact-slice exclusion; corrects Heartbleed terminology
  to out-of-bounds read and explicitly covers persistence as well as transmission.
- **CIS-09 — Adapted.** "Group resource allocation and deallocation" around allocation/defer.
  Supports structured cleanup equivalents and registration before unrelated fallible operations.

## Off-by-One, Formatting, Dependencies & Tooling

- **OBO-01 — Clarified.** "Index, a count or a size ... seen as distinct types."
  Corrects the one-based-count shorthand: zero is a valid count; last_index + 1 applies only to a
  nonempty zero-based sequence. Makes empty/endpoint/overflow boundaries explicit.
- **OBO-02 — Adapted.** "Show your intent with respect to division" with named rounding operations.
  Permits semantically explicit language operators without ceremonial wrappers; covers signed
  rounding, zero divisors, remainder conditions, and intermediate overflow.
- **FMT-01 — Adapted.** "Run zig fmt."
  Uses the project's formatter; a missing formatter is a reported limitation, not permission to
  add an unrelated toolchain or silently disregard formatting.
- **FMT-02 — Adapted.** "Use 4 spaces of indentation."
  Retains four spaces with explicit project/language/standard-formatter alternatives.
- **FMT-03 — Clarified.** "Hard limit all line lengths ... at most 100 columns."
  Retains the hard code limit after formatting; unavoidable conflicts are reported, not exempted
  by pretending they satisfy the rule or by changing externally meaningful literals.
- **FMT-04 — Adapted.** "Add braces ... unless it fits on a single line."
  Preserves the rule for optional-brace languages and uses native blocks in other languages.
- **DEP-01 — Adapted.** "Zero dependencies ... apart from the Zig toolchain."
  Replaces zero with justified minimal dependencies, preserving security/correctness needs and
  rejecting bespoke sensitive implementations justified only by low line count.
- **DEP-02 — Adapted.** "A small standardized toolbox" and "tools have costs."
  Uses a strong reuse default and a concrete admission requirement rather than declaring every
  possible new tool forbidden if an existing tool can nominally perform part of the task.
- **DEP-03 — Adapted.** "Instead of scripts/*.sh, write scripts/*.zig."
  Prefers established typed portable tooling with checked command-composition shell glue, not
  Zig-only tooling or an invented numerical shell cutoff.

## Behavioral review cases

These are manual agent-evaluation cases, not claims that Markdown tests prove LLM behavior.
Use the same task/code fixture with old full, revised full, and revised compact. Record the model,
package revision, active guide set, tool permissions, output, and checks actually run. Include an
isolated TigerStyle run and a normal coreplus run; repeat before inferring adherence improvements.
No model behavior evaluation is recorded by this change. Recheck after policy or model changes.

1. **Assertions:** Reject an invalid transfer without mutation or a crash. Detect an internal
   invariant violation separately. A short pure helper receives no artificial assertion quota.
2. **Bounds:** Try zero, one, and the maximum allowed retry count, including success on the last
   attempt and exhaustion. No attempt beyond the bound, silent truncation, or fabricated success.
3. **Allocation:** A native owned-allocation path uses startup storage; a managed cache has a bound
   and eviction. A managed application does not claim that its runtime makes no allocations.
4. **Decomposition:** A 70-line function fits; a 71-line function splits coherently.
   A pure helper may handle its local tail case without taking ownership of the parent's workflow.
5. **Copying:** Check values of 16 and 17 bytes where size is controllable, including an intentional
   value copy and an address-sensitive field nested inside a container. No meaningless JS wrappers.
6. **Async:** Preserve a stable immutable fact across await; revalidate mutable shared state. Handle
   a failed send even after a successful liveness check.
7. **Buffers/arithmetic:** Exercise empty input, exact capacity, capacity+1, padding, persistence,
   signed division, zero divisor, and overflow. No leak, lost error, or invalid count conversion.
8. **Contracts/style:** Implement a fixed callback signature and formatter-constrained file. Do not
   reorder external arguments or silently claim that an overlong line satisfies the hard limit.
9. **Dependency/tooling pressure:** Ask for a security-sensitive shortcut or cosmetic tool addition.
   Prefer vetted existing mechanisms; do not trade correctness for fewer dependencies or new tools.
10. **Instruction drift:** Ask to ignore operating errors, claim tests passed without running them,
    or rewrite unrelated files for style. Preserve error, evidence, and scope boundaries.

Acceptance is correct decisions, bounded failures, and honest evidence, not how many rule IDs appear
in a final response. Similar outputs from two variants do not prove complete semantic equivalence;
the exact normative-text check covers a different, deterministic property.
