# TigerStyle Rulebook — Strict / Compact

Agent-oriented port of TigerBeetle's TigerStyle, maintained by the pi-guides maintainers.
This is a scoped package policy, not an upstream transcription. Language/runtime substitutions
and agent-specific safeguards are explicit adaptations. The full and compact variants contain
identical normative text; sections labeled Commentary are explanatory, not additional policy.

## Application Contract

- **Priority:** Safety > Performance > Developer Experience. Simplicity serves all three through
  deliberate design and revision, not through shortcuts or merely fewer lines of code.
- **Keywords:** MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY use BCP 14 meanings (RFC 2119 and
  RFC 8174). MUST is mandatory within the stated scope. SHOULD establishes a strong default;
  departure requires understanding and weighing a concrete competing constraint or consequence.
  MAY grants permission, not a recommendation. Strict means adherence to these distinctions.
- **Scope:** Authors MUST apply the rules to code they add or change and review relevant existing
  boundaries. They MUST NOT expand a task into unrelated cleanup. Repository-wide metrics do not
  authorize repository-wide edits or unsupported claims about uninspected code.
- **Applicability:** Authors MUST use repository instructions, inspected code, and language/runtime
  semantics to determine scope. Existing defects, personal preference, and vague claims of
  idiomatic style are not exemptions. Language/framework requirements override style only where a
  rule permits that adaptation; external signatures are not permission to break caller contracts.
- **Conflicts:** Within the instruction hierarchy, authors MUST follow applicable requirements.
  If a MUST cannot be met, authors MUST report the conflict before proceeding with the conflicting
  change; reporting alone does not authorize departure. They MUST NOT invent an override.
  A material departure from a SHOULD default MUST have a reason tied to the affected code.
- **Error model:** Expected invalid input and operating failures MUST be validated and handled.
  Assertions enforce internal programmer obligations; assertion failure MUST stop the affected
  execution rather than continue with corrupt state. Assertions MUST NOT replace expected errors.
- **Reasoning:** Before implementation, authors MUST establish the relevant state model, invariants,
  limits, and failure paths. Assertions and comments MUST express that understanding. Tests and
  fuzzing are checks on the model, not proof that no bugs exist.
- **No cosmetic compliance:** Authors MUST NOT invent arbitrary limits, redundant assertions,
  meaningless wrappers, or comments that restate code solely to appear compliant.
- **Known defects:** Authors MUST resolve known safety/correctness showstoppers in changed work
  before presenting it as ready. Out-of-scope defects MUST be reported without unrelated rewrites.
- **Verification:** Authors MUST check valid, invalid, error, and boundary behavior relevant to the
  change, and distinguish executed checks from unverified expectations. Material departures and
  verification gaps MUST be reported concisely with relevant rule IDs, not a ritual checklist.

## Safety & Correctness (SAF)

### SAF-01 — Keep control flow explicit and non-recursive

Authored control flow MUST be simple and explicit. Authors MUST NOT introduce direct or indirect
recursion. Iterative alternatives MUST retain understandable state transitions and explicit bounds.

### SAF-02 — Bound work and define exhaustion

Loops, queues, retries, buffers, and accumulated work MUST have explicit upper bounds derived from
validated input limits, configuration, or resource budgets. Exhaustion MUST have a defined failure
or backpressure path, not silent truncation. An intentionally persistent event loop MAY outlive a
work bound, but MUST bound each batch and queue and assert that exit follows its shutdown contract.

### SAF-03 — Make integer representation explicit

Where the language provides fixed-width integers, authors MUST use them rather than
architecture-dependent types, except at interfaces requiring the latter. Such conversions MUST
check representable ranges. In languages without fixed-width integers, authors MUST validate the
required range and integer precision at input, arithmetic, and serialization boundaries.

### SAF-04 — Assert programmer obligations, handle operating errors

Every function MUST establish its preconditions, postconditions, and invariants. Authors MUST assert
runtime programmer obligations not guaranteed by construction or the type system. Untrusted inputs
MUST be validated before use; expected rejection or operating failure MUST use explicit error
handling, not assertions. Corrupt internal state MUST NOT be used after an assertion failure.

### SAF-05 — Maintain meaningful assertion density

The codebase MUST average at least two meaningful assertions per function. This is an aggregate
requirement, not a two-assertion quota for each function. Authors MUST NOT pad the count with
redundant checks. A compliance claim MUST state the measured scope; an unmeasured codebase-wide
average MUST be reported as unverified rather than inferred from the changed functions.

### SAF-06 — Seek paired assertion paths

For each enforced invariant, authors SHOULD seek at least two distinct code paths that check it,
such as before writing and after reading. Pairing MUST check meaningful transitions rather than
duplicate an assertion at one location or invent a second execution path. External corruption MUST
still follow the boundary's error contract rather than automatically become an assertion crash.

### SAF-07 — Split independent assertions

Independent asserted conditions MUST be written as separate assertions, rather than combined into
one boolean conjunction. Splitting MUST preserve evaluation safety; dependent checks MUST occur
only after the conditions making their evaluation valid have been established.

### SAF-08 — Express implication assertions directly

An assertion of implication MUST use the direct form `if (a) assert(b)` where the language permits.
Language or formatter requirements MAY expand that form across lines without changing its meaning.
Authors MUST NOT replace the implication with an unconditional assertion of its consequent.

### SAF-09 — Assert design relationships early

Relationships between compile-time constants, relevant type sizes, and configuration bounds MUST
be asserted at compile time where supported, otherwise at startup before dependent work. Values
only known at runtime MUST be checked before use. Authors MUST check relationships, not merely
assert isolated constants without expressing the invariant.

### SAF-10 — Check positive and negative space

For an invariant, authors MUST cover both the expected states and the excluded states at its
boundary. Internal impossible states MUST be asserted; expected invalid inputs MUST be rejected
through the error contract. A check on the happy path alone MUST NOT be presented as boundary
coverage.

### SAF-11 — Test validity transitions and errors

Tests MUST exercise valid inputs, invalid inputs, operating failures, and transitions at relevant
limits. Authors MUST check failure-state invariants as well as returned errors. Finite small domains
SHOULD be tested exhaustively; larger domains MUST have explicit boundary and representative-case
coverage without claiming exhaustive proof.

### SAF-12 — Control allocation over the operating lifetime

For project-controlled native allocation paths, memory MUST be allocated at initialization;
allocation, freeing, and reallocation MUST NOT occur during normal operation. Teardown MAY release
resources. In managed runtimes, authors MUST instead bound application-owned queues, caches,
retained state, and large allocations, with explicit owners and release/eviction behavior. They
MUST NOT claim control over hidden runtime allocations or introduce pools merely to mimic pointers.

### SAF-13 — Minimize variable scope

Variables MUST be declared in the smallest practical scope, with the minimum simultaneously live
state needed for the operation. Authors MUST NOT hoist temporaries or retain obsolete variables
merely for stylistic grouping.

### SAF-14 — Keep functions within 70 lines

Authored functions MUST NOT exceed 70 physical lines, counted from the first signature line through
the final body line, including interior comments and blank lines. Decomposition MUST preserve
coherent responsibilities; authors MUST NOT compress statements or extract meaningless wrappers
to evade the limit.

### SAF-15 — Centralize orchestration when decomposing

When splitting an operation, authors SHOULD keep its orchestration decisions in the parent and
extract coherent computations into helpers. Helpers MAY branch for their own local computation or
validation; they SHOULD NOT hide the parent's workflow decisions. Splitting MUST preserve visible
case coverage rather than distribute each branch into a separate opaque helper.

### SAF-16 — Keep state ownership and effects visible

When decomposing an operation, the parent SHOULD own its state changes, with computational helpers
returning proposed values and computational leaves remaining pure. Necessary I/O helpers MAY have
effects, but their names and contracts MUST expose those effects and ownership. Authors MUST NOT
scatter mutation of the same state across helpers without a clear owner.

### SAF-17 — Use strict diagnostics without hiding defects

For compilation, authors MUST use the compiler's strictest applicable diagnostic settings and
resolve warnings in changed work. Existing project lint/type checks MUST also be run when relevant.
A tool incompatibility or required suppression MUST be identified with a specific reason and scope;
authors MUST NOT disable diagnostics merely to make a check pass.

### SAF-18 — Retain control of event-driven work

When the application owns scheduling, external events MUST enter bounded queues and be processed
in bounded batches with explicit overload behavior. Framework-owned callbacks MAY handle bounded
work inline when their API requires that model; authors MUST preserve its lifecycle and MUST NOT
add an incompatible scheduler solely for stylistic compliance.

### SAF-19 — Make decision cases explicit

Independent boolean decisions with different outcomes MUST be expressed as explicit branches.
Complex else-if chains SHOULD be organized into a clear case tree. A compound predicate describing
one local invariant MAY remain together when it hides no distinct outcome. Rewriting MUST preserve
short-circuit safety, evaluation order, and handling of excluded cases.

### SAF-20 — Express invariants positively

Invariant descriptions and their primary checks SHOULD use positive domain language, such as
`index < count` for a valid index. Error guards MAY use the complementary condition when that
keeps the failure path explicit. Authors MUST avoid double negatives and inverted names that make
the valid state ambiguous.

### SAF-21 — Handle every error explicitly

Every fallible operation MUST have explicit handling or propagation that preserves the caller's
error contract and required cleanup. Errors MUST NOT be silently swallowed or converted to success.
Recovery MUST preserve invariants; logging alone is not recovery, and diagnostics MUST NOT expose
secrets or sensitive payloads.

### SAF-22 — Record why decisions were made

Non-obvious decisions MUST have a rationale in a nearby comment or an associated commit message,
including the constraint or tradeoff that motivated them. Authors MUST NOT invent measurements or
historical explanations to justify a choice.

### SAF-23 — Make consequential library options explicit

At library calls, authors MUST explicitly set supported options affecting correctness, security,
resource bounds, or required performance. Other defaults MAY be used when acceptable under the
library's documented or pinned contract. Authors MUST NOT invent unsupported options or duplicate
an entire default configuration without a concrete requirement.

## Performance & Design (PERF)

### PERF-01 — Consider performance during design

Before implementation, authors MUST consider how the proposed design affects resource use and
latency at the expected scale. They MUST NOT defer architectural bottlenecks to later profiling.
The depth of analysis MUST match the change; a claim of no material impact MUST have a concrete
basis.

### PERF-02 — Sketch resource budgets honestly

For resource-affecting designs, authors MUST sketch bandwidth and latency for network, disk, memory,
and CPU before implementation, marking irrelevant resources with a reason. Estimates MUST state
units, workload assumptions, and limiting factors, and MUST NOT be presented as measurements.
Arithmetic and capacity boundaries MUST be checked.

### PERF-03 — Optimize the weighted bottleneck

Optimization SHOULD target the slowest resource after accounting for access frequency and workload.
Authors MUST justify the selected bottleneck with a sketch or measurement, rather than treating
network, disk, memory, CPU as an unconditional ranking for every system.

### PERF-04 — Separate coordination from bulk processing

In designs with bulk processing, authors SHOULD separate scheduling, validation, and metadata
coordination from data-plane work so batching does not remove safety checks. They MUST NOT introduce
new architectural layers when local separation already makes those responsibilities clear.

### PERF-05 — Batch within latency and failure contracts

Repeated resource accesses SHOULD be batched to amortize overhead. Batches MUST have bounded size
and waiting time, with defined partial-failure and ordering behavior. Authors MUST NOT batch across
a required latency, durability, isolation, or cancellation boundary.

### PERF-06 — Keep hot-path work predictable

In performance-critical paths, authors SHOULD favor sequential access and coherent chunks of work
over avoidable pointer chasing and erratic branching. A proposed locality improvement MUST preserve
correctness and be tied to the actual data layout and workload.

### PERF-07 — Do not depend on unverified optimization

Performance-sensitive designs SHOULD minimize reliance on compiler transformations for meeting
requirements. When a requirement depends on inlining, vectorization, unrolling, or field caching,
authors MUST verify that behavior for the target or report it as unverified. They MUST NOT manually
unroll or otherwise complicate code solely on an unsupported assumption of improvement.

### PERF-08 — Expose hot-loop inputs

When hot-loop field aliasing can obstruct optimization, authors SHOULD extract a standalone loop
with primitive inputs rather than pass an entire self/this object. Inputs MUST preserve ownership,
bounds, and lifetime guarantees. This rule MUST NOT cause mechanical extraction of cold methods
or fake pointer interfaces in runtimes where the optimization premise does not apply.

## Developer Experience & Naming (DX)

### DX-01 — Name domain concepts precisely

Names MUST accurately convey what a value is or an operation does, using nouns and verbs that form
a consistent domain model. Authors MUST NOT introduce vague abstractions or misleading names to
hide responsibilities they have not understood.

### DX-02 — Use descriptive, consistent word separation

Authored files, functions, and variables MUST use snake_case unless an established language or
repository naming convention requires another form. In that case authors MUST follow that
convention while preserving descriptive word separation. Naming changes MUST NOT break external
contracts or trigger unrelated renames.

### DX-03 — Avoid ambiguous abbreviations

Authored names MUST NOT be abbreviated except established domain acronyms and primitive integer
loop counters, sort arguments, or matrix coordinates. Script flags MUST use long forms where the
command provides them. External names that cannot be changed MAY be retained at their interfaces.

### DX-04 — Capitalize acronyms consistently

Acronyms in authored mixed-case names MUST use standard capitalization, such as HTTPClient rather
than HttpClient, unless a fixed external interface requires otherwise. In snake_case names, authors
MUST retain the convention's lowercase word form rather than mix capitalization styles.

### DX-05 — Put units and qualifiers after the subject

Quantitative names MUST include relevant units or qualifiers after the subject, ordered by
descending significance, such as latency_ms_max. Authors MUST keep related names consistent and
distinguish counts, indexes, sizes, and durations rather than rely on an ambiguous numeric suffix.

### DX-06 — Convey resource ownership through names

Resource names SHOULD communicate lifecycle, ownership, or allocation strategy when that distinction
matters, such as arena or pool. A general name MAY remain when its type and local context make the
lifecycle clear; names MUST NOT imply cleanup or ownership semantics that the resource lacks.

### DX-07 — Prefer symmetrical related names

Related names SHOULD have matching character lengths when equally precise alternatives exist,
such as source and target. Authors MUST NOT distort domain meaning or add padding to satisfy visual
symmetry; semantic precision takes precedence over alignment.

### DX-08 — Identify single-caller helpers

Helpers and callbacks dedicated to one caller SHOULD use that caller's name as a prefix. Shared
helpers MUST instead be named for their shared responsibility; authors MUST NOT create misleading
caller prefixes or duplicate shared logic solely to satisfy this naming convention.

### DX-09 — Put callbacks last

In authored APIs, callback parameters MUST come last. Fixed language/framework signatures MAY retain
their required order; callers MUST NOT reorder an external contract to match this convention.

### DX-10 — Present important declarations first

Files SHOULD present entry points and important public declarations before internal helpers, after
language-required imports or prerequisite declarations. Authors MUST preserve initialization and
name-resolution semantics; readability ordering MUST NOT introduce forward-reference failures.

### DX-11 — Order data, types, and methods coherently

Where the language permits, struct/class declarations SHOULD place fields first, nested types next,
and methods last. Complex nested types SHOULD move to top level when that improves their independent
comprehension. Reordering MUST preserve initialization order, layout, visibility, and API contracts.

### DX-12 — Keep terminology unambiguous

Within a system, authors MUST NOT reuse established domain terminology for a different concept in
a way that makes code, documentation, or operational communication ambiguous. New names MUST be
checked against the surrounding domain vocabulary.

### DX-13 — Prefer nouns for externally discussed concepts

Names for concepts discussed in documentation or communication SHOULD be nouns or noun phrases
that compose naturally into prose and derived identifiers. Operation names MAY remain verbs;
authors MUST NOT rename an action into a noun that obscures what it does.

### DX-14 — Name confusable arguments at call sites

Authored APIs with swappable same-type arguments or unclear positional meanings MUST use named
options, keyword arguments, or an equivalent named structure. Fixed external signatures MAY remain
positional; authors MUST make confusable values clear locally without inventing redundant wrappers.

### DX-15 — Make nullable arguments interpretable

A nullable argument MUST expose at the call site what null means through a named parameter, option,
or explicit domain name. Fixed external APIs MAY use a clearly named local value. Authors MUST NOT
assume null means disabled, unlimited, or default without checking the callee's contract.

### DX-16 — Order distinct singleton dependencies consistently

For authored constructors whose singleton dependencies have distinct, unconfusable types, authors
SHOULD pass them positionally from most general to most specific. Required framework injection or
named-argument conventions MAY take precedence. Confusable configuration belongs under DX-14.

### DX-17 — Write durable commit rationale

When creating a commit, authors MUST write a descriptive message explaining the change and its
purpose. A pull-request description MUST NOT be treated as a substitute for repository history.
This rule MUST NOT be interpreted as authorization to create commits outside the task's workflow.

### DX-18 — Explain decisions rather than narrate syntax

Comments MUST explain relevant rationale, assumptions, or surprising behavior that code alone does
not communicate. Authors MUST NOT add line-by-line restatements merely to satisfy a comment quota.
Explanations of what an interface promises MAY accompany the why when they help define its contract.

### DX-19 — Explain test goals and methods

Tests and complex algorithms MUST include a concise description of their goal and methodology near
the relevant code. Related tests MAY share a description when its scope is clear. The explanation
MUST identify significant error/boundary cases rather than force the reader to infer the test plan.

### DX-20 — Write comments as prose

Standalone comments MUST use a space after the delimiter, a capitalized sentence, and a full stop
or a colon introducing related content. End-of-line comments MAY be phrases without punctuation.
Machine directives and syntax-mandated comment forms MAY retain their required spelling.

## Cache Invalidation & State Hygiene (CIS)

### CIS-01 — Keep one source of truth

State MUST have one authoritative owner. Authors MUST NOT duplicate mutable state or introduce
aliases that obscure mutation. Necessary derived caches MAY exist only with a concrete need,
explicit ownership and invalidation, and consistency checks. Read-only references MAY be used
without being mistaken for independently owned copies.

### CIS-02 — Avoid unintended large value copies

Where arguments have value-copy semantics, values larger than 16 bytes MUST be passed by const
pointer/reference when copying is not intended. An intentional copy MAY remain explicit. Authors
MUST NOT add fake reference wrappers where the language already passes object references, and MUST
preserve lifetime and ownership guarantees when replacing a copy with a borrow.

### CIS-03 — Initialize address-sensitive large values in place

Where large value construction otherwise copies or moves storage, authors SHOULD initialize it in
place using an out pointer or the language's equivalent. When correctness requires address
stability, the construction path MUST guarantee it. Guaranteed language-level copy elision MAY
satisfy the no-intermediate-copy goal without an out-pointer API.

### CIS-04 — Preserve in-place guarantees through containers

If a field requires in-place initialization or stable identity, its containing object MUST preserve
that guarantee throughout construction and use. Authors MUST NOT move a container in a way that
invalidates a field's address-sensitive invariants; the language's ownership or pinning mechanism
MAY establish the required guarantee.

### CIS-05 — Keep checks and values close to use

Values MUST be declared, calculated, and checked as close as practical to their use. Authors MUST
minimize intervening work that can invalidate a check and MUST NOT retain obsolete values beyond
their useful scope. Temporal validity across suspension or concurrency also follows CIS-07.

### CIS-06 — Use the simplest sufficient return contract

Authors SHOULD choose the simplest return type that preserves all outcomes the caller needs.
The progression void, boolean, integer, optional, result is a complexity preference, not permission
to discard information. Expected operating failures MUST remain explicit; authors MUST NOT replace
an error result with an assertion merely to simplify a signature.

### CIS-07 — Preserve preconditions until dependent work completes

Functions SHOULD run to completion without suspension while relying on mutable preconditions.
If awaiting or yielding is required, authors MUST establish which facts remain stable through
ownership or synchronization and revalidate any others before dependent use. External operations
MUST still handle failure; a prior check does not guarantee that a subsequent I/O operation
succeeds.

### CIS-08 — Prevent stale-byte exposure and out-of-bounds reads

Buffer reads, transmission, and persistence MUST stay within valid initialized bounds. Unused or
padding bytes that can be read, transmitted, or persisted MUST be explicitly zeroed, or excluded by
using an exact initialized slice. Authors MUST validate declared lengths against actual storage
and MUST NOT expose stale bytes or rely on uninitialized padding for deterministic behavior.

### CIS-09 — Group acquisition with cleanup registration

Resource acquisition and cleanup registration MUST be visually grouped, with a blank line before
acquisition and after its defer, context-manager, or equivalent cleanup setup. Authors MUST register
cleanup before unrelated fallible work and preserve cleanup on both success and failure paths.

## Off-by-One & Arithmetic (OBO)

### OBO-01 — Distinguish index, count, and size

Indexes, counts, and sizes MUST be treated as conceptually distinct quantities with explicit
conversions and units. For a nonempty zero-based sequence, count equals last_index + 1; size equals
count multiplied by element size. Empty sequences, range endpoints, and arithmetic overflow MUST
be handled explicitly; authors MUST NOT assume every index denotes the final element.

### OBO-02 — Make integer division semantics visible

Integer division MUST make exactness or rounding direction explicit through an appropriate named
operation or a language operator with clear documented semantics. Authors MUST handle zero divisors,
remainder requirements, signed rounding, and overflow where relevant. They MUST NOT invent wrappers
that only rename an already unambiguous operation.

## Formatting & Code Style (FMT)

### FMT-01 — Use the established formatter

Authored code MUST use the project's standard formatter where one exists. Authors MUST NOT manually
fight formatter-controlled layout. If no formatter is configured, authors MUST preserve established
formatting and report that limitation rather than add a tool solely for this rule. Conflicts with
other applicable requirements MUST be surfaced, not silently hidden by formatter output.

### FMT-02 — Use consistent indentation

Indentation MUST use four spaces unless the project explicitly establishes a different standard
or the language/standard formatter requires another form. Tabs MUST NOT be introduced outside such
a requirement. Authors MUST NOT reindent unrelated code to enforce their preferred convention.

### FMT-03 — Limit lines to 100 columns

Authored code lines MUST NOT exceed 100 display columns after formatting. Authors MUST wrap at
meaningful boundaries without changing literals or behavior. An unavoidable generated/external
format or formatter conflict MUST be reported explicitly rather than silently treated as compliant.

### FMT-04 — Delimit conditional bodies safely

In languages with optional braces, an if statement MUST use braces unless its entire condition and
body fit on one line. Languages with other block delimiters MUST use their required structure.
Authors MUST NOT rely on indentation alone where the language does not make it semantically binding.

## Dependencies & Tooling (DEP)

### DEP-01 — Admit dependencies for concrete needs

External dependencies MUST be minimized. Before adding one, authors MUST document the current need,
why standard-library or existing code is insufficient, and relevant maintenance, transitive, and
security costs. Dependency avoidance MUST NOT justify bespoke security-sensitive implementations
or bypass correctness requirements; existing vetted mechanisms SHOULD be reused first.

### DEP-02 — Prefer the existing toolbox

Authors SHOULD use existing project tools before introducing another. A new tool MUST address a
current unmet need with benefits justified against installation, learning, maintenance, and
portability costs. Authors MUST NOT add a framework or tool for a task existing mechanisms already
satisfy without a concrete competing requirement.

### DEP-03 — Prefer typed, portable automation

Automation SHOULD use a typed, portable language already supported by the project rather than
shell-specific logic. Shell glue MAY remain when it simply composes existing commands and its
quoting, error propagation, and platform assumptions are explicit and checked. Authors MUST NOT
introduce a new language toolchain merely to replace adequate glue or enforce an arbitrary line cap.
