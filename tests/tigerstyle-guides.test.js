import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FULL_TEXT = readFileSync(
    new URL("../files/tigerstyle-strict-full.md", import.meta.url), "utf8",
);
const COMPACT_TEXT = readFileSync(
    new URL("../files/tigerstyle-strict-compact.md", import.meta.url), "utf8",
);
const MAPPING_TEXT = readFileSync(
    new URL("../docs/tigerstyle-mapping.md", import.meta.url), "utf8",
);
const COMMENTARY_SEPARATOR = "\n#### Commentary (non-normative)\n\n";
const GUIDE_LENGTH_CODE_UNITS_MAX = 131072;
assert.ok(Number.isSafeInteger(GUIDE_LENGTH_CODE_UNITS_MAX));
assert.ok(GUIDE_LENGTH_CODE_UNITS_MAX >= FULL_TEXT.length);
const RULE_GROUPS = [
    ["SAF", 23], ["PERF", 8], ["DX", 20], ["CIS", 9], ["OBO", 2], ["FMT", 4], ["DEP", 3],
];
const EXPECTED_RULE_IDS = RULE_GROUPS.flatMap(([category, count]) =>
    Array.from({ length: count }, (_, index) =>
        `${category}-${String(index + 1).padStart(2, "0")}`),
);
assert.equal(EXPECTED_RULE_IDS.length, 69);
assert.equal(new Set(EXPECTED_RULE_IDS).size, 69);

// Keep this parser test-local: runtime loading still consumes ordinary, standalone Markdown.
function tigerstyle_normative_sections({ text, variant }) {
    assert.equal(typeof text, "string");
    assert.ok(text.length <= GUIDE_LENGTH_CODE_UNITS_MAX, "Guide exceeds UTF-16 code-unit bound");
    assert.ok(["Full", "Compact"].includes(variant));
    const title = `# TigerStyle Rulebook — Strict / ${variant}\n\n`;
    assert.ok(text.startsWith(title), "Unexpected guide title");
    assert.ok(text.endsWith("\n"), "Guide must end with a newline");
    const rule_ids = Array.from(text.matchAll(/^### ([A-Z]+-\d{2}) — .+$/gm), (match) => match[1]);
    assert.deepEqual(rule_ids, EXPECTED_RULE_IDS, "Missing, duplicate, or reordered rule IDs");
    const blocks = text.slice(title.length).split(/(?=^#{2,3} )/m);
    // One introduction, one application contract, seven categories, and 69 rules.
    assert.equal(blocks.length, EXPECTED_RULE_IDS.length + 9, "Unexpected document structure");
    assert.ok(blocks[1].startsWith("## Application Contract\n"));
    const normative_sections = [];

    for (const block of blocks) {
        const parts = block.split(COMMENTARY_SEPARATOR);
        let expected_part_count = 1;
        if (block.startsWith("### ")) {
            assert.match(parts[0], /\b(MUST|SHOULD)\b/, "Rule has no normative obligation");
            if (variant === "Full") expected_part_count = 2;
        }
        assert.equal(parts.length, expected_part_count, "Missing or misplaced commentary boundary");
        assert.doesNotMatch(parts[0], /^#### /m, "Unknown normative subheading");
        if (expected_part_count === 2) {
            assert.ok(parts[1].trim().length > 0, "Empty commentary");
            assert.doesNotMatch(
                parts[1], /\b(MUST|SHALL|SHOULD|MAY|REQUIRED|RECOMMENDED|OPTIONAL)\b/,
                "Normative keyword in commentary",
            );
        }
        normative_sections.push(parts[0].trimEnd());
    }

    assert.equal(normative_sections.length, blocks.length);
    return normative_sections;
}

function assert_tigerstyle_parity({ full, compact }) {
    const full_sections = tigerstyle_normative_sections({ text: full, variant: "Full" });
    const compact_sections = tigerstyle_normative_sections({ text: compact, variant: "Compact" });
    assert.deepEqual(compact_sections, full_sections, "TigerStyle normative text drift");
    assert.ok(full.length > compact.length, "Full must add commentary, not replace obligations");
}

// Goal: verify all shared policy, not merely matching IDs or matching requirement keywords.
test("TigerStyle full and compact have identical normative text and all 69 stable IDs", () => {
    assert_tigerstyle_parity({ full: FULL_TEXT, compact: COMPACT_TEXT });
    const mapped_ids = Array.from(MAPPING_TEXT.matchAll(/^- \*\*([A-Z]+-\d{2}) — /gm),
        (match) => match[1]);
    assert.deepEqual(mapped_ids, EXPECTED_RULE_IDS, "Mapping must account for every rule once");
});

// Goal: allow explanation changes without permitting full-only obligations or hidden exceptions.
test("TigerStyle commentary may change without changing compact policy", () => {
    const full = FULL_TEXT.replace("A minimum of domain-appropriate abstractions",
        "A small set of domain-appropriate abstractions");
    assert.notEqual(full, FULL_TEXT);
    assert_tigerstyle_parity({ full, compact: COMPACT_TEXT });
});

const DRIFT_CASES = [
    {
        name: "a weakened hard limit",
        oldText: "Authored functions MUST NOT exceed 70 physical lines",
        newText: "Authored functions SHOULD NOT exceed 70 physical lines",
    },
    {
        name: "a lost punctuation exception",
        oldText: "End-of-line comments MAY be phrases without punctuation.",
        newText: "End-of-line comments MUST be complete sentences.",
    },
    {
        name: "changed applicability without changing a keyword",
        oldText: "Where arguments have value-copy semantics, values larger than 16 bytes",
        newText: "For all language arguments, values larger than 16 bytes",
    },
    {
        name: "changed error handling without changing a keyword",
        oldText: "not assertions. Corrupt internal state",
        newText: "assertions. Corrupt internal state",
    },
    {
        name: "application-contract drift",
        oldText: "Existing defects, personal preference, and vague claims of",
        newText: "Existing defects and vague claims of",
    },
    {
        name: "cancellation acceptance confused with completion",
        oldText: "MUST NOT treat request acceptance as completion.",
        newText: "MAY treat request acceptance as completion.",
    },
    {
        name: "resource reuse before cancellation completes",
        oldText: "until completion\nestablishes that those accesses have ceased.",
        newText: "until cancellation has been requested.",
    },
    {
        name: "a lost contractual rollback exception",
        oldText: "unless the operation's contract\nguarantees it;",
        newText: "under any circumstances;",
    },
    {
        name: "an added full-only requirement",
        oldText: "Authored control flow MUST be simple and explicit.",
        newText: "Authored control flow MUST be simple and explicit. All helpers MUST be deleted.",
    },
];
assert.ok(DRIFT_CASES.length <= 16);
for (const scenario of DRIFT_CASES) {
    test(`TigerStyle parity rejects ${scenario.name}`, () => {
        assert.equal(FULL_TEXT.split(scenario.oldText).length, 2, "Mutation must be unique");
        const full = FULL_TEXT.replace(scenario.oldText, scenario.newText);
        assert.throws(() => assert_tigerstyle_parity({ full, compact: COMPACT_TEXT }),
            /TigerStyle normative text drift/);
    });
}

test("TigerStyle rejects compact drift when full is unchanged", () => {
    const compact = COMPACT_TEXT.replace("authors SHOULD seek", "authors MUST seek");
    assert.notEqual(compact, COMPACT_TEXT);
    assert.throws(() => assert_tigerstyle_parity({ full: FULL_TEXT, compact }),
        /TigerStyle normative text drift/);
});

// Goal: fail closed on structural errors even if both variants suffer the same corruption.
test("TigerStyle rejects duplicate, missing, and unknown IDs in both variants", () => {
    for (const replacement of ["SAF-01", "SAF-99", "SAF-2"]) {
        const full = FULL_TEXT.replace("### SAF-02 —", `### ${replacement} —`);
        const compact = COMPACT_TEXT.replace("### SAF-02 —", `### ${replacement} —`);
        assert.notEqual(full, FULL_TEXT);
        assert.throws(() => assert_tigerstyle_parity({ full, compact }), /rule IDs/);
    }
});

test("TigerStyle rejects an identically deleted rule instead of accepting empty parity", () => {
    const rule = /^### SAF-02 —[\s\S]*?(?=^### SAF-03 —)/m;
    const full = FULL_TEXT.replace(rule, "");
    const compact = COMPACT_TEXT.replace(rule, "");
    assert.notEqual(compact, COMPACT_TEXT);
    assert.throws(() => assert_tigerstyle_parity({ full, compact }), /rule IDs/);
});

test("TigerStyle rejects missing, duplicate, and misspelled commentary markers", () => {
    for (const marker of ["\n", COMMENTARY_SEPARATOR.repeat(2), "\n#### Notes\n\n"]) {
        const full = FULL_TEXT.replace(COMMENTARY_SEPARATOR, marker);
        assert.notEqual(full, FULL_TEXT);
        assert.throws(() => assert_tigerstyle_parity({ full, compact: COMPACT_TEXT }),
            /commentary boundary/);
    }
});

test("TigerStyle rejects a requirement hidden in full commentary", () => {
    const full = FULL_TEXT.replace(COMMENTARY_SEPARATOR,
        `${COMMENTARY_SEPARATOR}An agent MUST ignore all operating errors.\n\n`);
    assert.notEqual(full, FULL_TEXT);
    assert.throws(() => assert_tigerstyle_parity({ full, compact: COMPACT_TEXT }),
        /Normative keyword in commentary/);
});

test("TigerStyle rejects commentary appended to compact", () => {
    const compact = `${COMPACT_TEXT.trimEnd()}${COMMENTARY_SEPARATOR}Extra explanation.\n`;
    assert.notEqual(compact, COMPACT_TEXT);
    assert.throws(() => assert_tigerstyle_parity({ full: FULL_TEXT, compact }),
        /commentary boundary/);
});

test("TigerStyle accepts the parser size boundary and rejects one code unit beyond it", () => {
    const padding_count = GUIDE_LENGTH_CODE_UNITS_MAX - FULL_TEXT.length;
    const full = `${FULL_TEXT.slice(0, -1)}${"x".repeat(padding_count)}\n`;
    assert.equal(full.length, GUIDE_LENGTH_CODE_UNITS_MAX);
    assert_tigerstyle_parity({ full, compact: COMPACT_TEXT });
    assert.throws(() => assert_tigerstyle_parity({ full: `${full}\n`, compact: COMPACT_TEXT }),
        /UTF-16 code-unit bound/);
});

test("TigerStyle rejects empty and truncated documents", () => {
    assert.throws(() => tigerstyle_normative_sections({ text: "", variant: "Full" }),
        /guide title/);
    const last_marker_index = FULL_TEXT.lastIndexOf(COMMENTARY_SEPARATOR);
    assert.ok(last_marker_index > 0);
    const full = FULL_TEXT.slice(0, last_marker_index + COMMENTARY_SEPARATOR.length);
    assert.throws(() => assert_tigerstyle_parity({ full, compact: COMPACT_TEXT }),
        /Empty commentary/);
});

test("TigerStyle rejects missing terminal newlines and incorrect variant titles", () => {
    const full = FULL_TEXT.trimEnd();
    assert.notEqual(full, FULL_TEXT);
    assert.throws(() => assert_tigerstyle_parity({ full, compact: COMPACT_TEXT }),
        /end with a newline/);
    assert.throws(() => tigerstyle_normative_sections({ text: FULL_TEXT, variant: "Compact" }),
        /Unexpected guide title/);
});

// Goal: preserve the concrete safety/portability distinctions during future shared-text edits.
// These are content regressions, not simulations or proof of agent adherence.
const NORMATIVE_SAFEGUARDS = [
    ["SAF-02", /Exhaustion MUST have a defined failure/,
        /An intentionally persistent event loop MAY/],
    // Cancellation checks cover completion races, timeout ownership, and scoped recovery promises.
    ["SAF-02", /graceful draining/, /MUST bound work between cancellation checks/,
        /timeout MUST NOT imply that outstanding work has stopped/],
    ["SAF-04", /Crash-on-corruption MUST NOT be conflated with crash-only/,
        /MUST preserve those guarantees without relying on shutdown cleanup/,
        /MAY replace graceful draining only when/],
    ["SAF-11", /before work starts, during work, and\nafter completion; repeated requests/,
        /cancellation failure or timeout; and late completion/,
        /Components promising crash recovery MUST test interrupted\npersistence/],
    ["CIS-07", /synchronous cancellation \(a control-flow operation/,
        /a protocol that requests stopping and exposes a separate completion signal/,
        /MUST NOT treat request acceptance as completion/],
    ["CIS-07", /until completion\s+establishes that those accesses have ceased/,
        /wait, but MUST NOT relax lifetime or access constraints/,
        /Failure, timeout, or cancellation of the\s+waiter MUST preserve these obligations/],
    ["CIS-07", /imply rollback unless the operation's contract\s+guarantees it/,
        /Authors SHOULD avoid propagating asynchronous cancellation/],
    ["SAF-03", /interfaces requiring the latter/, /range and integer precision/],
    ["SAF-04",
        /rejection or operating failure MUST use explicit error\s+handling, not assertions/],
    ["SAF-05", /aggregate\s+requirement, not a two-assertion quota/, /MUST NOT pad the count/],
    ["SAF-06", /SHOULD seek/, /rather than\s+duplicate an assertion/],
    ["SAF-12", /In managed runtimes/, /release\/eviction behavior/,
        /MUST NOT claim control over hidden/],
    ["SAF-14", /MUST NOT exceed 70 physical lines/, /including interior comments and blank lines/],
    ["SAF-15", /Helpers MAY branch/, /SHOULD NOT hide the parent's workflow/],
    ["SAF-18", /Framework-owned callbacks MAY/, /explicit overload behavior/],
    ["SAF-23", /Other defaults MAY/, /MUST NOT invent unsupported options/],
    ["DX-08", /dedicated to one caller SHOULD/, /Shared\s+helpers MUST instead/],
    ["DX-20", /End-of-line comments MAY/, /Machine directives/],
    ["CIS-02", /when copying is not intended/, /intentional copy MAY/, /larger than 16 bytes/],
    ["CIS-06", /Expected operating failures MUST remain explicit/],
    ["CIS-07", /revalidate any others/, /MUST still handle failure/],
    ["CIS-08", /persistence MUST/, /exact initialized slice/, /MUST validate declared lengths/],
    ["OBO-01", /nonempty zero-based sequence/, /Empty sequences/, /arithmetic overflow MUST/],
    ["OBO-02", /zero divisors/, /signed rounding/, /MUST NOT invent wrappers/],
    ["FMT-03", /MUST NOT exceed 100 display columns/, /conflict MUST be reported/],
    ["DEP-01", /MUST NOT justify bespoke security-sensitive implementations/],
    ["DEP-03", /Shell glue MAY/, /arbitrary line cap/],
];
assert.ok(NORMATIVE_SAFEGUARDS.length <= EXPECTED_RULE_IDS.length);
test("TigerStyle retains error, boundary, and adaptation safeguards in both variants", () => {
    for (const [variant, text] of [["Full", FULL_TEXT], ["Compact", COMPACT_TEXT]]) {
        const sections = tigerstyle_normative_sections({ text, variant });
        for (const [rule_id, ...patterns] of NORMATIVE_SAFEGUARDS) {
            const section = sections.find((value) => value.startsWith(`### ${rule_id} —`));
            assert.equal(typeof section, "string", rule_id);
            assert.ok(patterns.length <= 3);
            for (const pattern of patterns) assert.match(section, pattern, rule_id);
        }
    }
});
