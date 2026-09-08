import test from "node:test";
import assert from "node:assert/strict";
import {
    existsSync,
    mkdtempSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import guideSystemExtension from "../extensions/guide-system.ts";

function createPiHarness(extensionFactory = guideSystemExtension) {
    const commands = new Map();
    const events = new Map();
    const customEntries = [];
    const api = {
        registerCommand(name, options) {
            commands.set(name, options);
        },
        on(name, handler) {
            events.set(name, handler);
        },
        appendEntry(customType, data) {
            customEntries.push({ customType, data });
        },
    };

    extensionFactory(api);
    return { commands, events, customEntries };
}

// A private package copy exercises missing profile modes without mutating cached live registries.
async function loadModeFallbackHarness(rootPath) {
    const paths = [
        "extensions/guide-system.ts",
        "registry/guides.json",
        "files/tigerstyle-strict-full.md",
        "files/tigerstyle-strict-compact.md",
    ];
    for (const relativePath of paths) {
        const targetPath = join(rootPath, relativePath);
        mkdirSync(dirname(targetPath), { recursive: true });
        writeFileSync(targetPath,
            readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8"), "utf8");
    }
    writeFileSync(join(rootPath, "registry/profiles.json"), JSON.stringify({
        version: 1,
        profiles: { legacy: { title: "Mode-less profile", guides: ["tigerstyle"] } },
    }), "utf8");
    const { default: extensionFactory } = await import(
        pathToFileURL(join(rootPath, "extensions/guide-system.ts")).href
    );
    assert.equal(typeof extensionFactory, "function");
    const harness = createPiHarness(extensionFactory);
    assert.ok(harness.commands.has("guide-profile"));
    return harness;
}

function createCommandContext(cwd, options = {}) {
    const notifications = [];
    const widgets = [];
    const statuses = [];
    let reloadCount = 0;

    return {
        cwd,
        notifications,
        widgets,
        statuses,
        hasUI: options.hasUI ?? true,
        sessionManager: {
            getEntries() {
                return [];
            },
        },
        get reloadCount() {
            return reloadCount;
        },
        ui: {
            notify(message, level) {
                notifications.push({ message, level });
            },
            setStatus(key, value) {
                statuses.push({ key, value });
            },
            setWidget(key, value) {
                widgets.push({ key, value });
            },
            custom() {
                return Promise.resolve(options.customResult ?? null);
            },
            select(_title, _labels) {
                return Promise.resolve(options.customResult ?? null);
            },
        },
        async reload() {
            reloadCount += 1;
        },
    };
}

async function withTempRoot(runCase) {
    const rootPath = mkdtempSync(join(tmpdir(), "pi-guides-commands-"));

    try {
        await runCase(rootPath);
    } finally {
        rmSync(rootPath, { recursive: true, force: true });
    }
}

async function withTempHome(runCase) {
    const originalHome = process.env.HOME;
    const homePath = mkdtempSync(join(tmpdir(), "pi-guides-home-"));

    process.env.HOME = homePath;
    try {
        await runCase(homePath);
    } finally {
        if (originalHome === undefined) {
            delete process.env.HOME;
        } else {
            process.env.HOME = originalHome;
        }
        rmSync(homePath, { recursive: true, force: true });
    }
}

async function withEnv(name, value, runCase) {
    const originalValue = process.env[name];

    if (value === null) {
        delete process.env[name];
    } else {
        process.env[name] = value;
    }

    try {
        await runCase();
    } finally {
        if (originalValue === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = originalValue;
        }
    }
}

function writeGuidesConfig(rootPath, config) {
    mkdirSync(join(rootPath, ".pi"), { recursive: true });
    writeFileSync(
        join(rootPath, ".pi", "guides.json"),
        `${JSON.stringify(config, null, 2)}\n`,
        "utf8",
    );
}

function readGuidesConfig(rootPath) {
    return JSON.parse(readFileSync(join(rootPath, ".pi", "guides.json"), "utf8"));
}

const { commands, events } = createPiHarness();
const guides = commands.get("guides");
const guideInit = commands.get("guide-init");
const guideSync = commands.get("guide-sync");
const guideProfile = commands.get("guide-profile");
const guideMode = commands.get("guide-mode");
const guideSession = commands.get("guide-session");
const guideNext = commands.get("guide-next");
const guideAutoCommit = commands.get("guide-auto-commit");
const sessionStart = events.get("session_start");
const beforeAgentStart = events.get("before_agent_start");
const toolCall = events.get("tool_call");
const turnEnd = events.get("turn_end");

if (!guides || !guideInit || !guideSync || !guideProfile || !guideMode || !guideSession || !guideNext || !guideAutoCommit) {
    throw new Error("expected guide commands to be registered");
}
if (!sessionStart || !beforeAgentStart || !toolCall || !turnEnd) {
    throw new Error("expected guide events to be registered");
}

test("guide-init --no-settings bootstraps repo-local files without project settings", async () => {
    await withTempRoot(async (rootPath) => {
        const ctx = createCommandContext(rootPath);

        await guideInit.handler("--no-settings", ctx);

        assert.equal(ctx.reloadCount, 1);
        assert.equal(readFileSync(join(rootPath, ".pi", "guides.json"), "utf8").length > 0, true);
        assert.equal(readGuidesConfig(rootPath).mode, "full");
        assert.equal(readFileSync(join(rootPath, "AGENTS.md"), "utf8").length > 0, true);
        assert.equal(existsSync(join(rootPath, ".pi", "settings.json")), false);

        const widgetLines = ctx.widgets.at(-1)?.value;
        assert.ok(Array.isArray(widgetLines));
        assert.ok(widgetLines.includes("setup mode: global package assumed"));
        assert.ok(widgetLines.includes("settings: skipped by request"));
    });
});

test("guide-init with explicit package source writes project settings and widget guidance", async () => {
    await withTempRoot(async (rootPath) => {
        const ctx = createCommandContext(rootPath);
        const packageSource = "git:git@github.com:sillypoise/pi-guides@v0.2.0";

        await guideInit.handler(packageSource, ctx);

        assert.equal(ctx.reloadCount, 1);
        const settings = JSON.parse(readFileSync(join(rootPath, ".pi", "settings.json"), "utf8"));
        assert.deepEqual(settings, { packages: [packageSource] });

        const widgetLines = ctx.widgets.at(-1)?.value;
        assert.ok(Array.isArray(widgetLines));
        assert.ok(widgetLines.includes("setup mode: repo-pinned package"));
        assert.ok(widgetLines.includes(`settings source: ${packageSource}`));
        assert.ok(widgetLines.includes("next:"));
    });
});

test("guide-init auto-skips project settings when the package is already global", async () => {
    await withTempHome(async (homePath) => {
        const globalSettingsPath = resolve(homePath, ".pi", "agent", "settings.json");
        mkdirSync(resolve(homePath, ".pi", "agent"), { recursive: true });
        writeFileSync(
            globalSettingsPath,
            `${JSON.stringify({ packages: [resolve(".")] }, null, 2)}\n`,
            "utf8",
        );

        await withTempRoot(async (rootPath) => {
            const ctx = createCommandContext(rootPath);

            await guideInit.handler("", ctx);

            assert.equal(ctx.reloadCount, 1);
            assert.equal(existsSync(join(rootPath, ".pi", "settings.json")), false);

            const widgetLines = ctx.widgets.at(-1)?.value;
            assert.ok(Array.isArray(widgetLines));
            assert.ok(widgetLines.includes("setup mode: global package assumed"));
            assert.ok(
                widgetLines.includes(
                    "settings: skipped because the package is already available globally",
                ),
            );
        });
    });
});

test("guide-init writes the default git package source when settings are requested", async () => {
    await withTempHome(async () => {
        await withTempRoot(async (rootPath) => {
            const ctx = createCommandContext(rootPath);

            await guideInit.handler("", ctx);

            assert.equal(ctx.reloadCount, 1);
            const settings = JSON.parse(readFileSync(join(rootPath, ".pi", "settings.json"), "utf8"));
            assert.deepEqual(settings, {
                packages: ["git:git@github.com:sillypoise/pi-guides@v0.5.1"],
            });
        });
    });
});

test("guide-init --dev writes a configured local package path", async () => {
    await withTempRoot(async (rootPath) => {
        const ctx = createCommandContext(rootPath);
        const devSourcePath = resolve(rootPath, "..", "dev-pi-guides");

        await withEnv("PI_GUIDES_DEV_SOURCE", devSourcePath, async () => {
            await guideInit.handler("--dev", ctx);
        });

        assert.equal(ctx.reloadCount, 1);
        const settings = JSON.parse(readFileSync(join(rootPath, ".pi", "settings.json"), "utf8"));
        assert.deepEqual(settings, { packages: [devSourcePath] });

        const widgetLines = ctx.widgets.at(-1)?.value;
        assert.ok(Array.isArray(widgetLines));
        assert.ok(widgetLines.includes("setup mode: local dev package path"));
        assert.ok(widgetLines.includes(`settings source: ${devSourcePath}`));
        assert.ok(
            widgetLines.includes(
                "note: local dev package paths are machine-specific; do not commit them to shared repos.",
            ),
        );
    });
});

test("guide-init --dev fails cleanly without a configured dev source", async () => {
    await withTempHome(async () => {
        await withTempRoot(async (rootPath) => {
            const ctx = createCommandContext(rootPath);

            await withEnv("PI_GUIDES_DEV_SOURCE", null, async () => {
                await guideInit.handler("--dev", ctx);
            });

            assert.equal(ctx.reloadCount, 0);
            assert.equal(existsSync(join(rootPath, ".pi", "guides.json")), false);
            assert.equal(existsSync(join(rootPath, "AGENTS.md")), false);
            assert.equal(existsSync(join(rootPath, ".pi", "settings.json")), false);
            assert.ok(
                ctx.notifications.some((entry) => {
                    return entry.message.includes(
                        "--dev requires PI_GUIDES_DEV_SOURCE or settings piGuidesDevSource",
                    );
                }),
            );
        });
    });
});

test("guide-init rejects conflicting --dev and explicit source arguments", async () => {
    await withTempRoot(async (rootPath) => {
        const ctx = createCommandContext(rootPath);

        await guideInit.handler("--dev git:git@github.com:sillypoise/pi-guides@v0.2.0", ctx);

        assert.equal(ctx.reloadCount, 0);
        assert.ok(
            ctx.notifications.some((entry) => {
                return entry.message.includes(
                    "--dev cannot be combined with an explicit package source",
                );
            }),
        );
    });
});

test("guide-init rejects unknown options and shows usage widget", async () => {
    await withTempRoot(async (rootPath) => {
        const ctx = createCommandContext(rootPath);

        await guideInit.handler("--wat", ctx);

        assert.equal(ctx.reloadCount, 0);
        assert.ok(ctx.notifications.some((entry) => entry.message.includes("unknown option '--wat'")));

        const widgetLines = ctx.widgets.at(-1)?.value;
        assert.ok(Array.isArray(widgetLines));
        assert.ok(widgetLines.includes("usage: /guide-init [package-source] [--no-settings] [--dev]"));
    });
});

test("session_start sets a compact one-line widget by default", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "coreplus",
            mode: "compact",
            additions: [],
            removals: [],
            variants: {},
        });

        const ctx = createCommandContext(rootPath);
        await sessionStart({}, ctx);

        const widgetLines = ctx.widgets.at(-1)?.value;
        assert.deepEqual(widgetLines, ["guides: coreplus | compact | 5 guides"]);
    });
});

test("guides command shows expanded detail instead of the compact widget", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "coreplus",
            mode: "compact",
            additions: [],
            removals: [],
            variants: {},
        });

        const ctx = createCommandContext(rootPath);
        await guides.handler("", ctx);

        const widgetLines = ctx.widgets.at(-1)?.value;
        assert.ok(Array.isArray(widgetLines));
        assert.ok(widgetLines.includes("pi guides"));
        assert.ok(widgetLines.includes("profile: coreplus (CorePlus)"));
        assert.ok(widgetLines.includes("resolved guides:"));
    });
});

test("guide-sync reports unchanged without reloading", async () => {
    await withTempRoot(async (rootPath) => {
        const createCtx = createCommandContext(rootPath);
        await guideSync.handler("", createCtx);

        const unchangedCtx = createCommandContext(rootPath);
        await guideSync.handler("", unchangedCtx);

        assert.equal(unchangedCtx.reloadCount, 0);
        const widgetLines = unchangedCtx.widgets.at(-1)?.value;
        assert.ok(Array.isArray(widgetLines));
        assert.ok(widgetLines.includes("result: unchanged"));
    });
});

test("guide-session activates the review overlay without rewriting repo config", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "core",
            mode: "compact",
            additions: [],
            removals: [],
            variants: {},
        });
        const beforeContent = readFileSync(join(rootPath, ".pi", "guides.json"), "utf8");
        const ctx = createCommandContext(rootPath);

        await guideSession.handler("review", ctx);

        const afterContent = readFileSync(join(rootPath, ".pi", "guides.json"), "utf8");
        assert.equal(ctx.reloadCount, 0);
        assert.equal(afterContent, beforeContent);

        const widgetLines = ctx.widgets.at(-1)?.value;
        assert.ok(Array.isArray(widgetLines));
        assert.ok(widgetLines.includes("session overlay: review (Review)"));
        assert.ok(widgetLines.includes("write policy: read-only"));
        assert.ok(widgetLines.includes("response contract: review-findings"));
    });
});

test("guide-session rejects baseline-only profiles", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "core",
            mode: "compact",
            additions: [],
            removals: [],
            variants: {},
        });
        const ctx = createCommandContext(rootPath);

        await guideSession.handler("core", ctx);

        assert.equal(ctx.reloadCount, 0);
        assert.ok(
            ctx.notifications.some((entry) => {
                return entry.message.includes("profile 'core' is not an overlay profile");
            }),
        );
    });
});

test("before_agent_start injects review-mode behavior guidance", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "core",
            mode: "compact",
            additions: [],
            removals: [],
            variants: {},
        });
        const sessionCtx = createCommandContext(rootPath);
        await guideSession.handler("review", sessionCtx);

        const eventCtx = createCommandContext(rootPath);
        const result = await beforeAgentStart(
            { systemPrompt: "Base system prompt" },
            eventCtx,
        );

        assert.equal(typeof result?.systemPrompt, "string");
        assert.match(result.systemPrompt, /Session Overlay: review/);
        assert.match(result.systemPrompt, /Write Policy: read-only/);
        assert.match(result.systemPrompt, /This turn is read-only/);
        assert.match(result.systemPrompt, /Response Contract: review-findings/);
    });
});

test("tool_call blocks edit, write, and mutating bash in review read-only mode", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "core",
            mode: "compact",
            additions: [],
            removals: [],
            variants: {},
        });
        const sessionCtx = createCommandContext(rootPath);
        await guideSession.handler("review", sessionCtx);

        const editCtx = createCommandContext(rootPath);
        const editResult = await toolCall(
            { toolName: "edit", input: { path: join(rootPath, "README.md") } },
            editCtx,
        );
        assert.deepEqual(editResult, {
            block: true,
            reason: "Blocked by pi-guides read-only mode",
        });

        const writeCtx = createCommandContext(rootPath);
        const writeResult = await toolCall(
            { toolName: "write", input: { path: join(rootPath, "README.md") } },
            writeCtx,
        );
        assert.deepEqual(writeResult, {
            block: true,
            reason: "Blocked by pi-guides read-only mode",
        });

        const bashCtx = createCommandContext(rootPath);
        const bashResult = await toolCall(
            { toolName: "bash", input: { command: "echo test > README.md" } },
            bashCtx,
        );
        assert.deepEqual(bashResult, {
            block: true,
            reason: "Blocked mutating bash by pi-guides read-only mode",
        });

        const safeBashCtx = createCommandContext(rootPath);
        const safeBashResult = await toolCall(
            { toolName: "bash", input: { command: "rg tigerstyle README.md" } },
            safeBashCtx,
        );
        assert.equal(safeBashResult, undefined);
    });
});

test("guide-next activates an overlay for the next turn only", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "coreplus",
            mode: "compact",
            additions: [],
            removals: [],
            variants: {},
        });

        const nextCtx = createCommandContext(rootPath);
        await guideNext.handler("review", nextCtx);

        const widgetLines = nextCtx.widgets.at(-1)?.value;
        assert.ok(Array.isArray(widgetLines));
        assert.ok(widgetLines.includes("next overlay: review (Review)"));
        assert.ok(widgetLines.includes("write policy: read-only"));

        const eventCtx = createCommandContext(rootPath);
        const result = await beforeAgentStart(
            { systemPrompt: "Base system prompt" },
            eventCtx,
        );
        assert.equal(typeof result?.systemPrompt, "string");
        assert.match(result.systemPrompt, /Next Overlay: review/);
        assert.match(result.systemPrompt, /Write Policy: read-only/);

        const duringTurnCtx = createCommandContext(rootPath);
        const duringTurnResult = await toolCall(
            { toolName: "bash", input: { command: "echo test > README.md" } },
            duringTurnCtx,
        );
        assert.deepEqual(duringTurnResult, {
            block: true,
            reason: "Blocked mutating bash by pi-guides read-only mode",
        });

        const endCtx = createCommandContext(rootPath);
        await turnEnd({}, endCtx);

        const afterTurnCtx = createCommandContext(rootPath);
        const afterTurnPrompt = await beforeAgentStart(
            { systemPrompt: "Base system prompt" },
            afterTurnCtx,
        );
        assert.equal(typeof afterTurnPrompt?.systemPrompt, "string");
        assert.doesNotMatch(afterTurnPrompt.systemPrompt, /Next Overlay: review/);
        assert.match(afterTurnPrompt.systemPrompt, /Profile: coreplus/);
    });
});

test("guide-session clear removes the read-only guard", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "core",
            mode: "compact",
            additions: [],
            removals: [],
            variants: {},
        });
        const sessionCtx = createCommandContext(rootPath);
        await guideSession.handler("review", sessionCtx);

        const clearCtx = createCommandContext(rootPath);
        await guideSession.handler("clear", clearCtx);

        const toolCtx = createCommandContext(rootPath);
        const result = await toolCall(
            { toolName: "edit", input: { path: join(rootPath, "README.md") } },
            toolCtx,
        );
        assert.equal(result, undefined);
    });
});

test("guide-profile no-op does not rewrite or reload", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "core",
            mode: "compact",
            additions: [],
            removals: [],
            variants: {},
        });
        const beforeContent = readFileSync(join(rootPath, ".pi", "guides.json"), "utf8");
        const ctx = createCommandContext(rootPath);

        await guideProfile.handler("core", ctx);

        const afterContent = readFileSync(join(rootPath, ".pi", "guides.json"), "utf8");
        assert.equal(ctx.reloadCount, 0);
        assert.equal(afterContent, beforeContent);
        assert.ok(ctx.notifications.some((entry) => entry.message.includes("already persisted")));
    });
});

test("guide-mode no-op does not rewrite or reload", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "core",
            mode: "full",
            additions: [],
            removals: [],
            variants: {},
        });
        const beforeContent = readFileSync(join(rootPath, ".pi", "guides.json"), "utf8");
        const ctx = createCommandContext(rootPath);

        await guideMode.handler("full", ctx);

        const afterContent = readFileSync(join(rootPath, ".pi", "guides.json"), "utf8");
        assert.equal(ctx.reloadCount, 0);
        assert.equal(afterContent, beforeContent);
        assert.ok(ctx.notifications.some((entry) => entry.message.includes("already persisted")));
    });
});

test("guide-mode persists an explicit mode when the config relied on a profile default", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "core",
            additions: [],
            removals: [],
            variants: {},
        });
        const ctx = createCommandContext(rootPath);

        await guideMode.handler("compact", ctx);

        const config = readGuidesConfig(rootPath);
        assert.equal(ctx.reloadCount, 1);
        assert.equal(config.mode, "compact");
    });
});

test("guide-profile with no args uses picker when UI is available", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "core",
            mode: "compact",
            additions: [],
            removals: [],
            variants: {},
        });
        const ctx = createCommandContext(rootPath, { customResult: "coreplus" });

        await guideProfile.handler("", ctx);

        const config = readGuidesConfig(rootPath);
        assert.equal(ctx.reloadCount, 1);
        assert.equal(config.profile, "coreplus");
        assert.ok(
            ctx.notifications.some((entry) => entry.message.includes("wrote profile 'coreplus'")),
        );
    });
});

test("guide-profile with no args and cancelled picker does nothing", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "core",
            mode: "compact",
            additions: [],
            removals: [],
            variants: {},
        });
        const beforeContent = readFileSync(join(rootPath, ".pi", "guides.json"), "utf8");
        const ctx = createCommandContext(rootPath, { customResult: null });

        await guideProfile.handler("", ctx);

        const afterContent = readFileSync(join(rootPath, ".pi", "guides.json"), "utf8");
        assert.equal(ctx.reloadCount, 0);
        assert.equal(afterContent, beforeContent);
    });
});

test("guide-session with no args uses picker when UI is available", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "core",
            mode: "compact",
            additions: [],
            removals: [],
            variants: {},
        });
        const beforeContent = readFileSync(join(rootPath, ".pi", "guides.json"), "utf8");
        const ctx = createCommandContext(rootPath, { customResult: "review" });

        await guideSession.handler("", ctx);

        const afterContent = readFileSync(join(rootPath, ".pi", "guides.json"), "utf8");
        assert.equal(ctx.reloadCount, 0);
        assert.equal(afterContent, beforeContent);
        assert.ok(
            ctx.notifications.some((entry) => entry.message.includes("activated overlay 'review'")),
        );
    });
});

test("guide-next with no args uses picker when UI is available", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "coreplus",
            mode: "compact",
            additions: [],
            removals: [],
            variants: {},
        });
        const ctx = createCommandContext(rootPath, { customResult: "review" });

        await guideNext.handler("", ctx);

        assert.equal(ctx.reloadCount, 0);
        assert.ok(
            ctx.notifications.some((entry) => entry.message.includes("queued overlay 'review'")),
        );
    });
});

test("guide-profile with no args falls back to widget when UI is unavailable", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "core",
            mode: "compact",
            additions: [],
            removals: [],
            variants: {},
        });
        const ctx = createCommandContext(rootPath, { hasUI: false });

        await guideProfile.handler("", ctx);

        assert.equal(ctx.reloadCount, 0);
        assert.ok(
            ctx.notifications.some((entry) => entry.message.includes("specify a profile id")),
        );
    });
});

test("guide-auto-commit toggles off to on", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "core",
            mode: "compact",
            additions: [],
            removals: [],
            variants: {},
        });
        const ctx = createCommandContext(rootPath);

        await guideAutoCommit.handler("", ctx);

        const config = readGuidesConfig(rootPath);
        assert.equal(ctx.reloadCount, 1);
        assert.equal(config.behavior?.autoCommit, true);
        assert.ok(
            ctx.notifications.some((entry) => entry.message.includes("guide-auto-commit: enabled")),
        );
    });
});

test("guide-auto-commit toggles on to off", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "core",
            mode: "compact",
            behavior: { autoCommit: true },
            additions: [],
            removals: [],
            variants: {},
        });
        const ctx = createCommandContext(rootPath);

        await guideAutoCommit.handler("", ctx);

        const config = readGuidesConfig(rootPath);
        assert.equal(ctx.reloadCount, 1);
        assert.equal(config.behavior?.autoCommit, false);
        assert.ok(
            ctx.notifications.some((entry) => entry.message.includes("guide-auto-commit: disabled")),
        );
    });
});

test("before_agent_start includes auto-commit instruction when enabled", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "core",
            mode: "compact",
            behavior: { autoCommit: true },
            additions: [],
            removals: [],
            variants: {},
        });
        const ctx = createCommandContext(rootPath);
        await sessionStart({}, ctx);

        const result = await beforeAgentStart(
            { systemPrompt: "Base system prompt" },
            ctx,
        );

        assert.equal(typeof result?.systemPrompt, "string");
        assert.match(result.systemPrompt, /create a git commit/);
    });
});

test("before_agent_start omits auto-commit instruction when disabled", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "core",
            mode: "compact",
            additions: [],
            removals: [],
            variants: {},
        });
        const ctx = createCommandContext(rootPath);
        await sessionStart({}, ctx);

        const result = await beforeAgentStart(
            { systemPrompt: "Base system prompt" },
            ctx,
        );

        assert.equal(typeof result?.systemPrompt, "string");
        assert.doesNotMatch(result.systemPrompt, /create a git commit/);
    });
});

test("compact widget shows auto-commit when enabled", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "coreplus",
            mode: "compact",
            behavior: { autoCommit: true },
            additions: [],
            removals: [],
            variants: {},
        });
        const ctx = createCommandContext(rootPath);
        await sessionStart({}, ctx);

        const widgetLines = ctx.widgets.at(-1)?.value;
        assert.deepEqual(widgetLines, ["guides: coreplus | compact | auto-commit | 5 guides"]);
    });
});

// Goal: exhaust all shipped profiles, including overlays, and verify actual injected variants.
test("all shipped profiles use full mode without per-guide profile defaults", async () => {
    const registry = JSON.parse(readFileSync(
        new URL("../registry/profiles.json", import.meta.url), "utf8",
    ));
    const profiles = Object.entries(registry.profiles);
    assert.equal(profiles.length, 18);
    for (const [profileId, profile] of profiles) {
        assert.equal(profile.mode, "full", profileId);
        assert.equal(Object.hasOwn(profile, "variants"), false, profileId);
        await withTempRoot(async (rootPath) => {
            const ctx = createCommandContext(rootPath);
            if (profile.scope === "overlay") {
                writeGuidesConfig(rootPath, { version: 1, guides: [] });
                await guideSession.handler(profileId, ctx);
            } else {
                writeGuidesConfig(rootPath, { version: 1, profile: profileId });
            }
            const before = readGuidesConfig(rootPath);
            const result = await beforeAgentStart({ systemPrompt: "Base prompt" }, ctx);
            assert.equal(typeof result?.systemPrompt, "string", profileId);
            assert.match(result.systemPrompt, /Mode: full/);
            const variants = Array.from(result.systemPrompt.matchAll(/^- variant: (.+)$/gm),
                (match) => match[1]);
            assert.equal(variants.length, profile.guides.length, profileId);
            for (const variant of variants) assert.match(variant, /-full$/);
            assert.deepEqual(readGuidesConfig(rootPath), before);
        });
    }
});

// Goal: verify implicit defaults, explicit opt-outs, empty input, and persisted command behavior.
test("direct guide lists default to full, including an empty list", async () => {
    for (const ids of [[], ["tigerstyle", "testing"]]) {
        await withTempRoot(async (rootPath) => {
            writeGuidesConfig(rootPath, { version: 1, guides: ids });
            const ctx = createCommandContext(rootPath);
            const result = await beforeAgentStart({ systemPrompt: "Base prompt" }, ctx);
            assert.equal(typeof result?.systemPrompt, "string");
            assert.match(result.systemPrompt, /Mode: full/);
            const variants = Array.from(result.systemPrompt.matchAll(/^- variant: (.+)$/gm),
                (match) => match[1]);
            assert.equal(variants.length, ids.length);
            for (const variant of variants) assert.match(variant, /-full$/);
            assert.equal(readGuidesConfig(rootPath).mode, undefined);
        });
    }
});

test("explicit compact works for baseline profiles and direct lists", async () => {
    for (const selection of [{ profile: "core" }, { guides: ["tigerstyle", "testing"] }]) {
        await withTempRoot(async (rootPath) => {
            const config = { version: 1, ...selection, mode: "compact" };
            writeGuidesConfig(rootPath, config);
            const ctx = createCommandContext(rootPath);
            const result = await beforeAgentStart({ systemPrompt: "Base prompt" }, ctx);
            assert.equal(typeof result?.systemPrompt, "string");
            assert.match(result.systemPrompt, /Mode: compact/);
            assert.doesNotMatch(result.systemPrompt, /^- variant: .+-full$/m);
            assert.match(result.systemPrompt, /^- variant: strict-compact$/m);
            assert.deepEqual(readGuidesConfig(rootPath), config);
        });
    }
});

test("repo variant overrides still win over the full default", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1, profile: "core", variants: { tigerstyle: "strict-compact" },
        });
        const ctx = createCommandContext(rootPath);
        const result = await beforeAgentStart({ systemPrompt: "Base prompt" }, ctx);
        assert.equal(typeof result?.systemPrompt, "string");
        assert.match(result.systemPrompt, /Mode: full/);
        assert.match(result.systemPrompt, /- tigerstyle \(strict-compact\)/);
        assert.match(result.systemPrompt, /- simplicity-core \(strict-full\)/);
    });
});

test("full overlay modes override compact baselines and clearing restores compact", async () => {
    await withTempRoot(async (rootPath) => {
        const config = { version: 1, profile: "core", mode: "compact" };
        writeGuidesConfig(rootPath, config);
        const ctx = createCommandContext(rootPath);
        await guideSession.handler("review", ctx);
        const overlay = await beforeAgentStart({ systemPrompt: "Base prompt" }, ctx);
        assert.match(overlay.systemPrompt, /Mode: full/);
        assert.match(overlay.systemPrompt, /Write Policy: read-only/);
        await guideSession.handler("clear", ctx);
        const baseline = await beforeAgentStart({ systemPrompt: "Base prompt" }, ctx);
        assert.match(baseline.systemPrompt, /Mode: compact/);
        assert.deepEqual(readGuidesConfig(rootPath), config);
    });
});

test("mode-less legacy profiles resolve and persist full; missing full files remain errors",
    async () => {
        await withTempRoot(async (rootPath) => {
            const harness = await loadModeFallbackHarness(rootPath);
            const beforeStart = harness.events.get("before_agent_start");
            const start = harness.events.get("session_start");
            const profileCommand = harness.commands.get("guide-profile");
            writeGuidesConfig(rootPath, { version: 1, profile: "legacy" });
            const ctx = createCommandContext(rootPath);
            const result = await beforeStart({ systemPrompt: "Base prompt" }, ctx);
            assert.match(result.systemPrompt, /Mode: full/);
            assert.match(result.systemPrompt, /- tigerstyle \(strict-full\)/);
            await profileCommand.handler("legacy", ctx);
            assert.equal(ctx.reloadCount, 1);
            assert.equal(readGuidesConfig(rootPath).mode, "full");

            // Full's missing file is an operating error, not permission to silently choose compact.
            const config = readGuidesConfig(rootPath);
            rmSync(join(rootPath, "files/tigerstyle-strict-full.md"));
            assert.ok(existsSync(join(rootPath, "files/tigerstyle-strict-compact.md")));
            await start({}, ctx);
            assert.equal(await beforeStart({ systemPrompt: "Base prompt" }, ctx), undefined);
            assert.ok(ctx.notifications.some((entry) => entry.message.includes("does not exist")));
            assert.deepEqual(readGuidesConfig(rootPath), config);
        });
    });

test("invalid mode commands preserve config without reload or writes", async () => {
    await withTempRoot(async (rootPath) => {
        const config = { version: 1, profile: "core", mode: "full" };
        writeGuidesConfig(rootPath, config);
        const before = readFileSync(join(rootPath, ".pi/guides.json"), "utf8");
        const ctx = createCommandContext(rootPath);
        await guideMode.handler("unknown", ctx);
        assert.equal(ctx.reloadCount, 0);
        assert.ok(ctx.notifications.some((entry) => entry.message.includes("mode must be")));
        assert.equal(readFileSync(join(rootPath, ".pi/guides.json"), "utf8"), before);
    });
});

test("guide-init preserves an existing explicit compact config", async () => {
    await withTempRoot(async (rootPath) => {
        const config = { version: 1, profile: "core", mode: "compact" };
        writeGuidesConfig(rootPath, config);
        const before = readFileSync(join(rootPath, ".pi/guides.json"), "utf8");
        const ctx = createCommandContext(rootPath);
        await guideInit.handler("--no-settings", ctx);
        assert.equal(readFileSync(join(rootPath, ".pi/guides.json"), "utf8"), before);
        assert.equal(readGuidesConfig(rootPath).mode, "compact");
    });
});

test("expanded widget shows auto-commit state", async () => {
    await withTempRoot(async (rootPath) => {
        writeGuidesConfig(rootPath, {
            version: 1,
            profile: "coreplus",
            mode: "compact",
            behavior: { autoCommit: true },
            additions: [],
            removals: [],
            variants: {},
        });
        const ctx = createCommandContext(rootPath);
        await guides.handler("", ctx);

        const widgetLines = ctx.widgets.at(-1)?.value;
        assert.ok(widgetLines.includes("auto commit: on"));
    });
});
