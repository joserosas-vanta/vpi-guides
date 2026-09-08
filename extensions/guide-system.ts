import { homedir } from "node:os";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
    ExtensionAPI,
    ExtensionCommandContext,
    ExtensionContext,
} from "@mariozechner/pi-coding-agent";
// Pi TUI imports are deferred to showProfilePicker so tests can load the module without peer deps.

type GuideMode = "compact" | "full";
type PrecedenceId = "rulebook" | "heuristics" | "playbook" | "framework";
type NotifyLevel = "info" | "warning";
type SyncAgentsResult = "created" | "updated" | "unchanged" | "skipped";
type ProfileScope = "baseline" | "overlay" | "any";
type WritePolicy = "normal" | "read-only";
type ToolMode = "normal" | "conservative";
type ResponseContract = "default" | "review-findings";

type BehaviorSettings = {
    writePolicy: WritePolicy;
    toolMode: ToolMode;
    responseContract: ResponseContract;
    autoCommit: boolean;
};

type VariantRecord = {
    path: string;
    size: GuideMode;
    strictness: string;
};

type GuideRecord = {
    title: string;
    archetype: string;
    precedence: PrecedenceId;
    summary: string;
    tags?: string[];
    defaults: Record<GuideMode, string>;
    variants: Record<string, VariantRecord>;
    skill?: { name: string; manualOnly?: boolean } | null;
};

type GuideRegistry = {
    version: 1;
    precedence: Array<{ id: PrecedenceId; rank: number }>;
    guides: Record<string, GuideRecord>;
};

type ProfileRecord = {
    title: string;
    description?: string;
    guides: string[];
    mode?: GuideMode;
    scope?: ProfileScope;
    behavior?: Partial<BehaviorSettings>;
};

type ProfileRegistry = {
    version: 1;
    profiles: Record<string, ProfileRecord>;
};

type GuideConfig = {
    version: 1;
    profile?: string;
    guides?: string[];
    mode?: GuideMode;
    additions?: string[];
    removals?: string[];
    variants?: Record<string, string>;
    behavior?: Partial<BehaviorSettings>;
};

type ResolvedGuide = {
    id: string;
    title: string;
    precedence: PrecedenceId;
    precedenceRank: number;
    variant: string;
    relativePath: string;
    absolutePath: string;
    summary: string;
};

type ResolvedInactiveState = {
    active: false;
    inactiveKind: "off" | "error";
    reason: string;
    configPath: string;
};

type ResolvedActiveState = {
    active: true;
    configPath: string;
    profile: string | null;
    profileTitle: string | null;
    sessionProfile: string | null;
    sessionProfileTitle: string | null;
    nextProfile: string | null;
    nextProfileTitle: string | null;
    mode: GuideMode;
    behavior: BehaviorSettings;
    guides: ResolvedGuide[];
};

type ResolvedState = ResolvedInactiveState | ResolvedActiveState;

type PathState =
    | { kind: "exists" }
    | { kind: "missing" }
    | { kind: "error"; errorMessage: string };

type ResolvedSource = {
    profile: string | null;
    profileTitle: string | null;
    sessionProfile: string | null;
    sessionProfileTitle: string | null;
    nextProfile: string | null;
    nextProfileTitle: string | null;
    mode: GuideMode;
    behavior: BehaviorSettings;
    ids: string[];
};

type LoadedGuideContent = {
    guide: ResolvedGuide;
    content: string;
};

type LoadedGuideConfig = {
    configPath: string;
    config: GuideConfig;
};

type PackageManifest = {
    name: string;
    version: string;
};

type PackageFilterEntry = {
    source?: string;
};

type PiSettings = {
    packages?: Array<string | PackageFilterEntry>;
    piGuidesDevSource?: string;
    custom?: {
        piGuidesDevSource?: string;
    };
};

type GuideInitOptions = {
    writeSettings: boolean;
    packageSourceOverride: string | null;
    useDevSource: boolean;
    showHelp: boolean;
};

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY_PATH = resolve(PACKAGE_ROOT, "registry", "guides.json");
const PROFILES_PATH = resolve(PACKAGE_ROOT, "registry", "profiles.json");
const PACKAGE_MANIFEST_PATH = resolve(PACKAGE_ROOT, "package.json");
const TEMPLATE_GUIDES_PATH = resolve(PACKAGE_ROOT, "templates", "guides.json.example");
const TEMPLATE_AGENTS_PATH = resolve(PACKAGE_ROOT, "templates", "repo-AGENTS.md");
const GUIDE_CONFIG_RELATIVE_PATH = join(".pi", "guides.json");
const SETTINGS_CONFIG_RELATIVE_PATH = join(".pi", "settings.json");
const GUIDE_STATUS_KEY = "pi-guides:status";
const GUIDE_WIDGET_KEY = "pi-guides:widget";
const GUIDE_MODE_COMPACT: GuideMode = "compact";
const GUIDE_MODE_FULL: GuideMode = "full";
const DEFAULT_BEHAVIOR: BehaviorSettings = {
    writePolicy: "normal",
    toolMode: "normal",
    responseContract: "default",
    autoCommit: false,
};
const SESSION_OVERLAY_ENTRY_TYPE = "pi-guides-session-overlay";
const BEGIN_HEADER = "<!-- BEGIN MANAGED GUIDE HEADER -->";
const END_HEADER = "<!-- END MANAGED GUIDE HEADER -->";

const session_overlay_profiles = new Map<string, string | null>();
const next_overlay_profiles = new Map<string, string | null>();
const consumed_next_overlay_cwds = new Set<string>();

let registryCache: GuideRegistry | null = null;
let profilesCache: ProfileRegistry | null = null;
let packageManifestCache: PackageManifest | null = null;

async function readJsonFile<T>(path: string): Promise<T> {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as T;
}

function cloneGuideConfig(config: GuideConfig): GuideConfig {
    return {
        version: config.version,
        profile: config.profile,
        guides: config.guides ? [...config.guides] : undefined,
        mode: config.mode,
        additions: config.additions ? [...config.additions] : undefined,
        removals: config.removals ? [...config.removals] : undefined,
        variants: config.variants ? { ...config.variants } : undefined,
        behavior: config.behavior ? { ...config.behavior } : undefined,
    };
}

async function getPathState(path: string): Promise<PathState> {
    try {
        await stat(path);
        return { kind: "exists" };
    } catch (error) {
        if (error instanceof Error) {
            const errorWithCode = error as Error & { code?: string };
            if (errorWithCode.code === "ENOENT") {
                return { kind: "missing" };
            }
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        return { kind: "error", errorMessage };
    }
}

async function fileExists(path: string): Promise<boolean> {
    const pathState = await getPathState(path);
    if (pathState.kind === "exists") {
        return true;
    }
    return false;
}

function makeOffState(configPath: string): ResolvedInactiveState {
    return {
        active: false,
        inactiveKind: "off",
        reason: `No ${GUIDE_CONFIG_RELATIVE_PATH} found`,
        configPath,
    };
}

function makeErrorState(configPath: string, reason: string): ResolvedInactiveState {
    return {
        active: false,
        inactiveKind: "error",
        reason,
        configPath,
    };
}

async function ensureExistingPath(path: string, label: string): Promise<void> {
    const pathState = await getPathState(path);
    if (pathState.kind === "exists") {
        return;
    }
    if (pathState.kind === "missing") {
        throw new Error(`${label} does not exist: ${path}`);
    }
    throw new Error(`${label} is not accessible: ${pathState.errorMessage}`);
}

function guideConfigPath(cwd: string): string {
    return resolve(cwd, GUIDE_CONFIG_RELATIVE_PATH);
}

async function loadGuideConfig(cwd: string): Promise<LoadedGuideConfig> {
    const configPath = guideConfigPath(cwd);
    const configPathState = await getPathState(configPath);
    if (configPathState.kind === "missing") {
        throw new Error(`No ${GUIDE_CONFIG_RELATIVE_PATH} found`);
    }
    if (configPathState.kind === "error") {
        throw new Error(configPathState.errorMessage);
    }

    const config = await readJsonFile<GuideConfig>(configPath);
    if (config.version !== 1) {
        throw new Error(`Unsupported guides config version '${String(config.version)}'`);
    }

    return { configPath, config };
}

async function writeGuideConfig(configPath: string, config: GuideConfig): Promise<void> {
    const content = `${JSON.stringify(config, null, 2)}\n`;
    await writeFile(configPath, content, "utf8");
}

function settingsConfigPath(cwd: string): string {
    return resolve(cwd, SETTINGS_CONFIG_RELATIVE_PATH);
}

function defaultPackageSource(manifest: PackageManifest): string {
    const scopedNameMatch = /^@([^/]+)\/([^/]+)$/u.exec(manifest.name);
    if (scopedNameMatch !== null) {
        const owner = scopedNameMatch[1];
        const repo = scopedNameMatch[2];
        return `git:git@github.com:${owner}/${repo}@v${manifest.version}`;
    }

    return `npm:${manifest.name}@${manifest.version}`;
}

function settingsTemplateContent(packageSource: string): string {
    return `${JSON.stringify({ packages: [packageSource] }, null, 2)}\n`;
}

async function writeSettingsConfig(settingsPath: string, packageSource: string): Promise<void> {
    const content = settingsTemplateContent(packageSource);
    await ensureParentDir(settingsPath);
    await writeFile(settingsPath, content, "utf8");
}

async function loadRegistry(): Promise<GuideRegistry> {
    if (registryCache === null) {
        registryCache = await readJsonFile<GuideRegistry>(REGISTRY_PATH);
    }
    return registryCache;
}

async function loadProfiles(): Promise<ProfileRegistry> {
    if (profilesCache === null) {
        profilesCache = await readJsonFile<ProfileRegistry>(PROFILES_PATH);
    }
    return profilesCache;
}

async function loadPackageManifest(): Promise<PackageManifest> {
    if (packageManifestCache === null) {
        packageManifestCache = await readJsonFile<PackageManifest>(PACKAGE_MANIFEST_PATH);
    }
    return packageManifestCache;
}

function globalPiAgentDirectory(): string {
    return resolve(homedir(), ".pi", "agent");
}

function globalSettingsPath(): string {
    return resolve(globalPiAgentDirectory(), "settings.json");
}

function packageSourceString(entry: string | PackageFilterEntry): string | null {
    if (typeof entry === "string") {
        return entry;
    }
    if (typeof entry.source === "string") {
        return entry.source;
    }
    return null;
}

function settingsDevSource(settings: PiSettings): string | null {
    if (typeof settings.piGuidesDevSource === "string") {
        return settings.piGuidesDevSource;
    }
    if (typeof settings.custom?.piGuidesDevSource === "string") {
        return settings.custom.piGuidesDevSource;
    }
    return null;
}

function resolveLocalPackageSourcePath(settingsDirectory: string, source: string): string | null {
    if (source.startsWith("npm:")) {
        return null;
    }
    if (source.startsWith("git:")) {
        return null;
    }
    if (/^[a-z]+:\/\//u.test(source)) {
        return null;
    }

    if (source.startsWith("~/")) {
        return resolve(homedir(), source.slice(2));
    }
    if (isAbsolute(source)) {
        return resolve(source);
    }
    return resolve(settingsDirectory, source);
}

function resolveConfiguredDevSource(baseDirectory: string, source: string): string {
    const localPath = resolveLocalPackageSourcePath(baseDirectory, source);
    if (localPath === null) {
        throw new Error("guide-init: --dev requires a local package path");
    }
    return localPath;
}

async function isCurrentPackageAvailableGlobally(): Promise<boolean> {
    const globalPiRoot = globalPiAgentDirectory();
    if (PACKAGE_ROOT.startsWith(`${globalPiRoot}/`)) {
        return true;
    }
    if (PACKAGE_ROOT === globalPiRoot) {
        return true;
    }

    const settingsPath = globalSettingsPath();
    const pathState = await getPathState(settingsPath);
    if (pathState.kind !== "exists") {
        return false;
    }

    try {
        const settings = await readJsonFile<PiSettings>(settingsPath);
        const packageEntries = settings.packages ?? [];
        for (const entry of packageEntries) {
            const source = packageSourceString(entry);
            if (source === null) {
                continue;
            }
            const localPath = resolveLocalPackageSourcePath(dirname(settingsPath), source);
            if (localPath === null) {
                continue;
            }
            if (resolve(localPath) === PACKAGE_ROOT) {
                return true;
            }
        }
    } catch {
        return false;
    }

    return false;
}

async function resolveGuideInitDevSource(cwd: string): Promise<string> {
    const envDevSource = process.env.PI_GUIDES_DEV_SOURCE;
    if (typeof envDevSource === "string") {
        const trimmedEnvDevSource = envDevSource.trim();
        if (trimmedEnvDevSource.length > 0) {
            return resolveConfiguredDevSource(cwd, trimmedEnvDevSource);
        }
    }

    const projectSettingsPath = settingsConfigPath(cwd);
    const projectSettingsPathState = await getPathState(projectSettingsPath);
    if (projectSettingsPathState.kind === "exists") {
        try {
            const projectSettings = await readJsonFile<PiSettings>(projectSettingsPath);
            const projectDevSource = settingsDevSource(projectSettings);
            if (projectDevSource !== null) {
                return resolveConfiguredDevSource(dirname(projectSettingsPath), projectDevSource);
            }
        } catch {
            // Ignore invalid project settings here. guide-init should still work from env or global settings.
        }
    }

    const globalPath = globalSettingsPath();
    const globalPathState = await getPathState(globalPath);
    if (globalPathState.kind === "exists") {
        try {
            const globalSettings = await readJsonFile<PiSettings>(globalPath);
            const globalDevSource = settingsDevSource(globalSettings);
            if (globalDevSource !== null) {
                return resolveConfiguredDevSource(dirname(globalPath), globalDevSource);
            }
        } catch {
            // Ignore invalid global settings here. guide-init will report the missing dev source explicitly.
        }
    }

    throw new Error(
        "guide-init: --dev requires PI_GUIDES_DEV_SOURCE or settings piGuidesDevSource",
    );
}

function dedupe(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        if (seen.has(value)) {
            continue;
        }
        seen.add(value);
        result.push(value);
    }
    return result;
}

function splitArgs(args: string | undefined): string[] {
    if (args === undefined) {
        return [];
    }
    const trimmedArgs = args.trim();
    if (trimmedArgs.length === 0) {
        return [];
    }
    return trimmedArgs.split(/\s+/u);
}

function parseGuideInitOptions(args: string | undefined): GuideInitOptions {
    const parts = splitArgs(args);
    let writeSettings = true;
    let packageSourceOverride: string | null = null;
    let useDevSource = false;
    let showHelp = false;

    for (const part of parts) {
        if (part === "--no-settings") {
            writeSettings = false;
            continue;
        }
        if (part === "--dev") {
            useDevSource = true;
            continue;
        }
        if (part === "--help" || part === "-h") {
            showHelp = true;
            continue;
        }
        if (part.startsWith("-")) {
            throw new Error(`guide-init: unknown option '${part}'`);
        }
        if (packageSourceOverride !== null) {
            throw new Error("guide-init: expected at most one package source argument");
        }
        packageSourceOverride = part;
    }

    if (useDevSource) {
        if (!writeSettings) {
            throw new Error("guide-init: --dev cannot be combined with --no-settings");
        }
        if (packageSourceOverride !== null) {
            throw new Error("guide-init: --dev cannot be combined with an explicit package source");
        }
    }

    return {
        writeSettings,
        packageSourceOverride,
        useDevSource,
        showHelp,
    };
}

function fallbackVariantOrder(mode: GuideMode): string[] {
    if (mode === "compact") {
        return ["strict-compact", "pragmatic-compact", "strict-full", "pragmatic-full"];
    }
    return ["strict-full", "pragmatic-full", "strict-compact", "pragmatic-compact"];
}

function mergeBehaviorSettings(
    base: BehaviorSettings,
    override: Partial<BehaviorSettings> | undefined,
): BehaviorSettings {
    if (override === undefined) {
        return { ...base };
    }

    return {
        writePolicy: override.writePolicy ?? base.writePolicy,
        toolMode: override.toolMode ?? base.toolMode,
        responseContract: override.responseContract ?? base.responseContract,
        autoCommit: override.autoCommit ?? base.autoCommit,
    };
}

function getSessionOverlayProfileId(cwd: string): string | null {
    return session_overlay_profiles.get(cwd) ?? null;
}

function setSessionOverlayProfileId(cwd: string, profileId: string | null): void {
    if (profileId === null) {
        session_overlay_profiles.delete(cwd);
        return;
    }
    session_overlay_profiles.set(cwd, profileId);
}

function getNextOverlayProfileId(cwd: string): string | null {
    return next_overlay_profiles.get(cwd) ?? null;
}

function setNextOverlayProfileId(cwd: string, profileId: string | null): void {
    if (profileId === null) {
        next_overlay_profiles.delete(cwd);
        consumed_next_overlay_cwds.delete(cwd);
        return;
    }
    next_overlay_profiles.set(cwd, profileId);
}

function allowedAsBaselineProfile(profile: ProfileRecord): boolean {
    return profile.scope !== "overlay";
}

function allowedAsSessionOverlayProfile(profile: ProfileRecord): boolean {
    return profile.scope === "overlay" || profile.scope === "any";
}

function isMutatingBashCommand(command: string): boolean {
    const mutatingPatterns = [
        /(^|[;&|]\s*)(rm|mv|cp|touch|mkdir|rmdir|install|chmod|chown|ln)\b/u,
        /(^|[;&|]\s*)sed\s+-i\b/u,
        /(^|[;&|]\s*)perl\s+-pi\b/u,
        /(^|[;&|]\s*)git\s+(apply|am|commit|checkout|switch|restore|reset|revert|clean)\b/u,
        /(^|[;&|]\s*)tee\b/u,
        /(^|[;&|]\s*)cat\s+.*>+/u,
        /(^|[;&|]\s*)echo\s+.*>+/u,
        /(^|[;&|]\s*)printf\s+.*>+/u,
        /(^|[;&|]\s*)\S+\s*>\s*[^&]/u,
        /(^|[;&|]\s*)\S+\s*>>\s*[^&]/u,
    ];

    return mutatingPatterns.some((pattern) => pattern.test(command));
}

function pickVariant(guide: GuideRecord, mode: GuideMode, explicitVariant?: string): string {
    if (explicitVariant !== undefined) {
        if (!guide.variants[explicitVariant]) {
            throw new Error(`Unknown variant '${explicitVariant}' for guide '${guide.title}'`);
        }
        return explicitVariant;
    }

    const preferred = guide.defaults[mode];
    if (preferred !== undefined) {
        if (guide.variants[preferred]) {
            return preferred;
        }
    }

    for (const candidate of fallbackVariantOrder(mode)) {
        if (!guide.variants[candidate]) {
            continue;
        }
        return candidate;
    }

    throw new Error(`Guide '${guide.title}' has no usable variant for mode '${mode}'`);
}

function formatNamedProfile(profileId: string | null, profileTitle: string | null): string {
    if (profileId === null) {
        return "custom";
    }
    if (profileTitle === null) {
        return profileId;
    }
    return `${profileId} (${profileTitle})`;
}

function renderStatus(state: ResolvedState): string {
    if (state.active) {
        const profileNames = [state.profile ?? "custom"];
        if (state.sessionProfile !== null) {
            profileNames.push(state.sessionProfile);
        }
        if (state.nextProfile !== null) {
            profileNames.push(state.nextProfile);
        }
        return `guides: ${profileNames.join(" + ")} (${state.mode})`;
    }
    if (state.inactiveKind === "error") {
        return "guides: error";
    }
    return "guides: off";
}

function formatProfileName(state: ResolvedActiveState): string {
    return formatNamedProfile(state.profile, state.profileTitle);
}

function rejectDirectGuideModifiers(config: GuideConfig): void {
    const additions = config.additions ?? [];
    if (additions.length > 0) {
        throw new Error(".pi/guides.json cannot use 'additions' with direct 'guides'");
    }

    const removals = config.removals ?? [];
    if (removals.length > 0) {
        throw new Error(".pi/guides.json cannot use 'removals' with direct 'guides'");
    }
}

function resolveOverlayProfile(
    overlayProfileId: string,
    overlayKind: "session" | "next",
    profiles: ProfileRegistry,
): ProfileRecord {
    const overlayProfile = profiles.profiles[overlayProfileId];
    if (!overlayProfile) {
        throw new Error(`Unknown ${overlayKind} overlay profile '${overlayProfileId}'`);
    }
    if (!allowedAsSessionOverlayProfile(overlayProfile)) {
        throw new Error(`Profile '${overlayProfileId}' is not allowed as a ${overlayKind} overlay`);
    }
    return overlayProfile;
}

function resolveProfileSource(
    config: GuideConfig,
    profiles: ProfileRegistry,
    sessionOverlayProfileId: string | null,
    nextOverlayProfileId: string | null,
): ResolvedSource {
    const profileId = config.profile;
    if (profileId === undefined) {
        throw new Error("Expected profile-based guide config");
    }

    const profile = profiles.profiles[profileId];
    if (!profile) {
        throw new Error(`Unknown profile '${profileId}'`);
    }

    const additions = config.additions ?? [];
    const removals = config.removals ?? [];
    let ids = dedupe([...profile.guides, ...additions]).filter((id) => !removals.includes(id));
    let mode = config.mode ?? profile.mode ?? GUIDE_MODE_FULL;
    let behavior = mergeBehaviorSettings(DEFAULT_BEHAVIOR, profile.behavior);
    behavior = mergeBehaviorSettings(behavior, config.behavior);
    let sessionProfileTitle: string | null = null;
    let nextProfileTitle: string | null = null;

    if (sessionOverlayProfileId !== null) {
        const sessionProfile = resolveOverlayProfile(sessionOverlayProfileId, "session", profiles);
        ids = dedupe([...ids, ...sessionProfile.guides]);
        mode = sessionProfile.mode ?? mode;
        behavior = mergeBehaviorSettings(behavior, sessionProfile.behavior);
        sessionProfileTitle = sessionProfile.title;
    }

    if (nextOverlayProfileId !== null) {
        const nextProfile = resolveOverlayProfile(nextOverlayProfileId, "next", profiles);
        ids = dedupe([...ids, ...nextProfile.guides]);
        mode = nextProfile.mode ?? mode;
        behavior = mergeBehaviorSettings(behavior, nextProfile.behavior);
        nextProfileTitle = nextProfile.title;
    }

    return {
        profile: profileId,
        profileTitle: profile.title,
        sessionProfile: sessionOverlayProfileId,
        sessionProfileTitle,
        nextProfile: nextOverlayProfileId,
        nextProfileTitle,
        mode,
        behavior,
        ids,
    };
}

function resolveDirectGuideSource(
    config: GuideConfig,
    profiles: ProfileRegistry,
    sessionOverlayProfileId: string | null,
    nextOverlayProfileId: string | null,
): ResolvedSource {
    rejectDirectGuideModifiers(config);
    let ids = dedupe(config.guides ?? []);
    let mode = config.mode ?? GUIDE_MODE_FULL;
    let behavior = { ...DEFAULT_BEHAVIOR };
    behavior = mergeBehaviorSettings(behavior, config.behavior);
    let sessionProfileTitle: string | null = null;
    let nextProfileTitle: string | null = null;

    if (sessionOverlayProfileId !== null) {
        const sessionProfile = resolveOverlayProfile(sessionOverlayProfileId, "session", profiles);
        ids = dedupe([...ids, ...sessionProfile.guides]);
        mode = sessionProfile.mode ?? mode;
        behavior = mergeBehaviorSettings(behavior, sessionProfile.behavior);
        sessionProfileTitle = sessionProfile.title;
    }

    if (nextOverlayProfileId !== null) {
        const nextProfile = resolveOverlayProfile(nextOverlayProfileId, "next", profiles);
        ids = dedupe([...ids, ...nextProfile.guides]);
        mode = nextProfile.mode ?? mode;
        behavior = mergeBehaviorSettings(behavior, nextProfile.behavior);
        nextProfileTitle = nextProfile.title;
    }

    return {
        profile: null,
        profileTitle: null,
        sessionProfile: sessionOverlayProfileId,
        sessionProfileTitle,
        nextProfile: nextOverlayProfileId,
        nextProfileTitle,
        mode,
        behavior,
        ids,
    };
}

function resolveSourceIds(
    config: GuideConfig,
    profiles: ProfileRegistry,
    sessionOverlayProfileId: string | null,
    nextOverlayProfileId: string | null,
): ResolvedSource {
    if (config.profile !== undefined) {
        if (config.guides !== undefined) {
            throw new Error(".pi/guides.json cannot define both 'profile' and 'guides'");
        }
        return resolveProfileSource(
            config,
            profiles,
            sessionOverlayProfileId,
            nextOverlayProfileId,
        );
    }

    if (config.guides === undefined) {
        throw new Error(".pi/guides.json must define either 'profile' or 'guides'");
    }

    return resolveDirectGuideSource(
        config,
        profiles,
        sessionOverlayProfileId,
        nextOverlayProfileId,
    );
}

function buildPrecedenceRanks(registry: GuideRegistry): Map<PrecedenceId, number> {
    return new Map(registry.precedence.map((entry) => [entry.id, entry.rank]));
}

async function resolveGuideEntry(
    id: string,
    index: number,
    mode: GuideMode,
    variantOverrides: Record<string, string> | undefined,
    registry: GuideRegistry,
    precedenceRanks: Map<PrecedenceId, number>,
): Promise<{ index: number; guide: ResolvedGuide }> {
    const guide = registry.guides[id];
    if (!guide) {
        throw new Error(`Unknown guide id '${id}'`);
    }

    const precedenceRank = precedenceRanks.get(guide.precedence);
    if (precedenceRank === undefined) {
        throw new Error(`Missing precedence rank for guide '${id}'`);
    }

    const variant = pickVariant(guide, mode, variantOverrides?.[id]);
    const variantRecord = guide.variants[variant];
    const absolutePath = resolve(PACKAGE_ROOT, variantRecord.path);
    await ensureExistingPath(absolutePath, `Guide file for '${id}'`);

    return {
        index,
        guide: {
            id,
            title: guide.title,
            precedence: guide.precedence,
            precedenceRank,
            variant,
            relativePath: variantRecord.path,
            absolutePath,
            summary: guide.summary,
        },
    };
}

async function resolveGuides(
    source: ResolvedSource,
    variantOverrides: Record<string, string> | undefined,
    registry: GuideRegistry,
): Promise<ResolvedGuide[]> {
    const precedenceRanks = buildPrecedenceRanks(registry);
    const guidesWithIndex = await Promise.all(
        source.ids.map((id, index) => {
            return resolveGuideEntry(id, index, source.mode, variantOverrides, registry, precedenceRanks);
        }),
    );

    guidesWithIndex.sort((a, b) => {
        if (a.guide.precedenceRank !== b.guide.precedenceRank) {
            return a.guide.precedenceRank - b.guide.precedenceRank;
        }
        return a.index - b.index;
    });

    return guidesWithIndex.map((entry) => entry.guide);
}

async function resolveActiveState(
    configPath: string,
    config: GuideConfig,
    registry: GuideRegistry,
    profiles: ProfileRegistry,
    sessionOverlayProfileId: string | null,
    nextOverlayProfileId: string | null,
): Promise<ResolvedActiveState> {
    const source = resolveSourceIds(
        config,
        profiles,
        sessionOverlayProfileId,
        nextOverlayProfileId,
    );
    const guides = await resolveGuides(source, config.variants, registry);
    return {
        active: true,
        configPath,
        profile: source.profile,
        profileTitle: source.profileTitle,
        sessionProfile: source.sessionProfile,
        sessionProfileTitle: source.sessionProfileTitle,
        nextProfile: source.nextProfile,
        nextProfileTitle: source.nextProfileTitle,
        mode: source.mode,
        behavior: source.behavior,
        guides,
    };
}

async function resolveState(cwd: string): Promise<ResolvedState> {
    const configPath = resolve(cwd, GUIDE_CONFIG_RELATIVE_PATH);
    const configPathState = await getPathState(configPath);
    if (configPathState.kind === "missing") {
        return makeOffState(configPath);
    }
    if (configPathState.kind === "error") {
        return makeErrorState(configPath, configPathState.errorMessage);
    }

    try {
        const [registry, profiles, config] = await Promise.all([
            loadRegistry(),
            loadProfiles(),
            readJsonFile<GuideConfig>(configPath),
        ]);

        if (config.version !== 1) {
            throw new Error(`Unsupported guides config version '${String(config.version)}'`);
        }

        const sessionOverlayProfileId = getSessionOverlayProfileId(cwd);
        const nextOverlayProfileId = getNextOverlayProfileId(cwd);
        return await resolveActiveState(
            configPath,
            config,
            registry,
            profiles,
            sessionOverlayProfileId,
            nextOverlayProfileId,
        );
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return makeErrorState(configPath, reason);
    }
}

async function readGuideContents(guides: ResolvedGuide[]): Promise<LoadedGuideContent[]> {
    return Promise.all(
        guides.map(async (guide) => {
            return {
                guide,
                content: await readFile(guide.absolutePath, "utf8"),
            };
        }),
    );
}

function formatPrecedence(registry: GuideRegistry): string {
    return registry.precedence
        .slice()
        .sort((a, b) => a.rank - b.rank)
        .map((entry) => entry.id)
        .join(" > ");
}

function formatGuideList(guides: ResolvedGuide[]): string {
    return guides
        .map((guide) => `- ${guide.id} (${guide.variant}) -> ${guide.relativePath}`)
        .join("\n");
}

function formatGuideBody(contents: LoadedGuideContent[]): string {
    return contents
        .map(({ guide, content }) => {
            return [
                `### Guide: ${guide.title}`,
                `- id: ${guide.id}`,
                `- variant: ${guide.variant}`,
                `- precedence: ${guide.precedence}`,
                `- source: ${guide.relativePath}`,
                "",
                content.trim(),
            ].join("\n");
        })
        .join("\n\n");
}

async function buildInjectedPrompt(state: ResolvedActiveState, registry: GuideRegistry): Promise<string> {
    const contents = await readGuideContents(state.guides);
    const precedence = formatPrecedence(registry);
    const guideList = formatGuideList(state.guides);
    const body = formatGuideBody(contents);
    const lines = [
        "## Active Guide System",
        "",
        `Profile: ${state.profile ?? "custom"}`,
    ];

    if (state.sessionProfile !== null) {
        lines.push(`Session Overlay: ${state.sessionProfile}`);
    }
    if (state.nextProfile !== null) {
        lines.push(`Next Overlay: ${state.nextProfile}`);
    }

    lines.push(`Mode: ${state.mode}`);
    lines.push(`Precedence: ${precedence}`);
    lines.push(`Write Policy: ${state.behavior.writePolicy}`);
    lines.push(`Tool Mode: ${state.behavior.toolMode}`);
    lines.push(`Response Contract: ${state.behavior.responseContract}`);
    lines.push("");
    lines.push("Apply the active guides below as binding policy for this turn.");
    lines.push(
        "When doing implementation work, explicitly verify negative, error, and boundary paths, not only happy paths.",
    );
    lines.push(
        "In final summaries, prefer concise rule-application traces that reference the relevant guide ids or rule ids.",
    );
    if (state.behavior.writePolicy === "read-only") {
        lines.push("This turn is read-only. Do not edit files or write files.");
    }
    if (state.behavior.responseContract === "review-findings") {
        lines.push("Respond as review findings first: issues, risks, and missing boundary checks.");
    }
    if (state.behavior.autoCommit) {
        lines.push(
            "After completing file changes, create a git commit with a descriptive message " +
            "that summarizes what was changed and why. Do not skip the commit.",
        );
    }
    lines.push("");
    lines.push("### Active Guides");
    lines.push(guideList);
    lines.push("");
    lines.push(body);

    return lines.join("\n");
}

function pushOptionalConfigLines(lines: string[], label: string, values: string[] | undefined): void {
    if (values === undefined) {
        return;
    }
    if (values.length === 0) {
        return;
    }
    lines.push(`${label}: ${values.join(", ")}`);
}

function pushVariantOverrideLines(lines: string[], variants: Record<string, string> | undefined): void {
    if (variants === undefined) {
        return;
    }

    const entries = Object.entries(variants);
    if (entries.length === 0) {
        return;
    }

    lines.push("variant overrides:");
    for (const [guideId, variantId] of entries) {
        lines.push(`- ${guideId} -> ${variantId}`);
    }
}

function buildAvailableProfileLines(
    profiles: ProfileRegistry,
    scope: "all" | "baseline" | "overlay" = "all",
): string[] {
    const lines = ["available profiles:"];
    for (const [profileId, profile] of Object.entries(profiles.profiles)) {
        if (scope === "baseline" && !allowedAsBaselineProfile(profile)) {
            continue;
        }
        if (scope === "overlay" && !allowedAsSessionOverlayProfile(profile)) {
            continue;
        }

        const description = profile.description ?? "No description.";
        const profileScope = profile.scope ?? "any";
        lines.push(`- ${profileId} [${profileScope}]: ${description}`);
    }
    return lines;
}

async function buildGuidesWidgetLines(cwd: string, state: ResolvedState): Promise<string[]> {
    if (!state.active) {
        return inactiveWidgetLines(state);
    }

    const registry = await loadRegistry();
    const profiles = await loadProfiles();
    const { config } = await loadGuideConfig(cwd);
    const lines = [
        "pi guides",
        `status: ${renderStatus(state)}`,
        `config: ${state.configPath}`,
        `profile: ${formatProfileName(state)}`,
        `mode: ${state.mode}`,
        `precedence: ${formatPrecedence(registry)}`,
    ];

    if (state.sessionProfile !== null) {
        lines.push(
            `session overlay: ${formatNamedProfile(state.sessionProfile, state.sessionProfileTitle)}`,
        );
    }
    if (state.nextProfile !== null) {
        lines.push(`next overlay: ${formatNamedProfile(state.nextProfile, state.nextProfileTitle)}`);
    }

    lines.push(`write policy: ${state.behavior.writePolicy}`);
    lines.push(`tool mode: ${state.behavior.toolMode}`);
    lines.push(`response contract: ${state.behavior.responseContract}`);
    lines.push(`auto commit: ${state.behavior.autoCommit ? "on" : "off"}`);

    if (config.profile !== undefined) {
        lines.push(`config profile: ${config.profile}`);
    }
    if (config.guides !== undefined) {
        lines.push(`config guides: ${config.guides.join(", ")}`);
    }
    pushOptionalConfigLines(lines, "config additions", config.additions);
    pushOptionalConfigLines(lines, "config removals", config.removals);
    pushVariantOverrideLines(lines, config.variants);

    lines.push("resolved guides:");
    for (const guide of state.guides) {
        lines.push(`- ${guide.id} (${guide.variant})`);
        lines.push(`  precedence: ${guide.precedence}`);
        lines.push(`  source: ${guide.relativePath}`);
        lines.push(`  summary: ${guide.summary}`);
    }

    lines.push(...buildAvailableProfileLines(profiles));
    return lines;
}

function statusNotifyLevel(state: ResolvedState): NotifyLevel {
    if (state.active) {
        return "info";
    }
    if (state.inactiveKind === "error") {
        return "warning";
    }
    return "info";
}

function setStatus(ctx: ExtensionContext, state: ResolvedState): void {
    ctx.ui.setStatus(GUIDE_STATUS_KEY, renderStatus(state));
}

function clearUi(ctx: ExtensionContext): void {
    ctx.ui.setStatus(GUIDE_STATUS_KEY, undefined);
    ctx.ui.setWidget(GUIDE_WIDGET_KEY, undefined);
}

async function refreshStatus(ctx: ExtensionContext): Promise<ResolvedState> {
    const state = await resolveState(ctx.cwd);
    setStatus(ctx, state);
    setGuidesWidget(ctx, compactWidgetLines(state));
    return state;
}

function formatCompactProfileStack(state: ResolvedActiveState): string {
    const profileNames = [state.profile ?? "custom"];
    if (state.sessionProfile !== null) {
        profileNames.push(state.sessionProfile);
    }
    if (state.nextProfile !== null) {
        profileNames.push(`next:${state.nextProfile}`);
    }
    return profileNames.join(" + ");
}

function compactWidgetLines(state: ResolvedState): string[] {
    if (!state.active) {
        if (state.inactiveKind === "error") {
            return [`guides: error | ${state.reason}`];
        }
        return [`guides: off | ${state.reason}`];
    }

    const parts = [
        `guides: ${formatCompactProfileStack(state)}`,
        state.mode,
    ];
    if (state.behavior.writePolicy === "read-only") {
        parts.push("ro");
    }
    if (state.behavior.toolMode !== "normal") {
        parts.push(`tools:${state.behavior.toolMode}`);
    }
    if (state.behavior.responseContract !== "default") {
        parts.push(`response:${state.behavior.responseContract}`);
    }
    if (state.behavior.autoCommit) {
        parts.push("auto-commit");
    }
    parts.push(`${state.guides.length} guides`);
    return [parts.join(" | ")];
}

function inactiveWidgetLines(state: ResolvedInactiveState): string[] {
    return [
        "pi guides",
        `status: ${renderStatus(state)}`,
        `reason: ${state.reason}`,
        `config: ${state.configPath}`,
    ];
}

async function ensureParentDir(path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
}

function markerCount(text: string, marker: string): number {
    return text.split(marker).length - 1;
}

function extractManagedHeader(text: string): string | null {
    const beginCount = markerCount(text, BEGIN_HEADER);
    if (beginCount !== 1) {
        return null;
    }

    const endCount = markerCount(text, END_HEADER);
    if (endCount !== 1) {
        return null;
    }

    const start = text.indexOf(BEGIN_HEADER);
    if (start < 0) {
        return null;
    }

    const end = text.indexOf(END_HEADER);
    if (end < 0) {
        return null;
    }
    if (end < start) {
        return null;
    }

    return text.slice(start, end + END_HEADER.length);
}

async function syncAgentsFile(cwd: string): Promise<SyncAgentsResult> {
    const targetPath = resolve(cwd, "AGENTS.md");
    const template = await readFile(TEMPLATE_AGENTS_PATH, "utf8");

    if (!(await fileExists(targetPath))) {
        await writeFile(targetPath, template, "utf8");
        return "created";
    }

    const current = await readFile(targetPath, "utf8");
    const templateHeader = extractManagedHeader(template);
    if (templateHeader === null) {
        return "skipped";
    }

    const currentHeader = extractManagedHeader(current);
    if (currentHeader === null) {
        return "skipped";
    }

    if (currentHeader === templateHeader) {
        return "unchanged";
    }

    const updated = current.replace(currentHeader, templateHeader);
    await writeFile(targetPath, updated, "utf8");
    return "updated";
}

async function runGuideInit(ctx: ExtensionCommandContext, args: string | undefined): Promise<void> {
    let options: GuideInitOptions;
    try {
        options = parseGuideInitOptions(args);
    } catch (error) {
        setGuidesWidget(ctx, buildGuideInitUsageLines(ctx.cwd));
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(message, "warning");
        return;
    }

    if (options.showHelp) {
        setGuidesWidget(ctx, buildGuideInitUsageLines(ctx.cwd));
        ctx.ui.notify("guide-init: initialize repo guide files from package templates", "info");
        return;
    }

    const configPath = guideConfigPath(ctx.cwd);
    const settingsPath = settingsConfigPath(ctx.cwd);
    const agentsPath = resolve(ctx.cwd, "AGENTS.md");
    const createdPaths: string[] = [];
    const skippedPaths: string[] = [];
    const settingsPathExists = await fileExists(settingsPath);
    const globalPackageAvailable = await isCurrentPackageAvailableGlobally();
    const shouldAutoSkipSettings =
        options.writeSettings &&
        !options.useDevSource &&
        options.packageSourceOverride === null &&
        globalPackageAvailable &&
        !settingsPathExists;
    let writeSettings = options.writeSettings;
    let packageSource: string | null = null;
    let usedDefaultPackageSource = false;
    let usedDevSource = false;
    let skippedSettingsReason: "request" | "global-package" | null = null;

    if (shouldAutoSkipSettings) {
        writeSettings = false;
        skippedSettingsReason = "global-package";
    }
    if (!writeSettings) {
        if (options.writeSettings) {
            if (skippedSettingsReason === null) {
                skippedSettingsReason = "request";
            }
        } else {
            skippedSettingsReason = "request";
        }
    }

    if (writeSettings) {
        try {
            if (options.useDevSource) {
                packageSource = await resolveGuideInitDevSource(ctx.cwd);
                usedDevSource = true;
            } else {
                const manifest = await loadPackageManifest();
                packageSource = options.packageSourceOverride ?? defaultPackageSource(manifest);
                usedDefaultPackageSource = options.packageSourceOverride === null;
            }
        } catch (error) {
            setGuidesWidget(ctx, buildGuideInitUsageLines(ctx.cwd));
            const message = error instanceof Error ? error.message : String(error);
            ctx.ui.notify(message, "warning");
            return;
        }
    }

    if (!(await fileExists(configPath))) {
        await ensureParentDir(configPath);
        await writeFile(configPath, await readFile(TEMPLATE_GUIDES_PATH, "utf8"), "utf8");
        createdPaths.push(GUIDE_CONFIG_RELATIVE_PATH);
    } else {
        skippedPaths.push(GUIDE_CONFIG_RELATIVE_PATH);
    }

    if (!(await fileExists(agentsPath))) {
        await writeFile(agentsPath, await readFile(TEMPLATE_AGENTS_PATH, "utf8"), "utf8");
        createdPaths.push("AGENTS.md");
    } else {
        skippedPaths.push("AGENTS.md");
    }

    if (writeSettings) {
        if (!settingsPathExists) {
            await writeSettingsConfig(settingsPath, packageSource);
            createdPaths.push(SETTINGS_CONFIG_RELATIVE_PATH);
        } else {
            skippedPaths.push(SETTINGS_CONFIG_RELATIVE_PATH);
        }
    }

    setGuidesWidget(
        ctx,
        buildGuideInitWidgetLines(
            ctx.cwd,
            createdPaths,
            skippedPaths,
            writeSettings,
            packageSource,
            usedDefaultPackageSource,
            usedDevSource,
            skippedSettingsReason,
        ),
    );

    if (createdPaths.length === 0) {
        ctx.ui.notify("guide-init: nothing created; files already exist", "info");
        return;
    }

    ctx.ui.notify("guide-init: wrote repo guide files; reloading runtime", "success");
    await ctx.reload();
}

async function runGuideSync(ctx: ExtensionCommandContext): Promise<void> {
    const result = await syncAgentsFile(ctx.cwd);
    setGuidesWidget(ctx, buildGuideSyncWidgetLines(ctx.cwd, result));
    if (result === "skipped") {
        ctx.ui.notify(
            "guide-sync: AGENTS.md exists but does not contain the managed header block",
            "warning",
        );
        return;
    }
    if (result === "unchanged") {
        ctx.ui.notify("guide-sync: AGENTS.md already matches the package template", "info");
        return;
    }

    ctx.ui.notify(`guide-sync: ${result} AGENTS.md; reloading runtime`, "success");
    await ctx.reload();
}

function notifyGuidesState(ctx: ExtensionContext, state: ResolvedState): void {
    ctx.ui.notify(renderStatus(state), statusNotifyLevel(state));
    if (state.active) {
        return;
    }
    if (state.inactiveKind !== "error") {
        return;
    }
    ctx.ui.notify(`pi guides: ${state.reason}`, "warning");
}

function setGuidesWidget(ctx: ExtensionContext, lines: string[]): void {
    ctx.ui.setWidget(GUIDE_WIDGET_KEY, lines);
}

function buildGuideInitUsageLines(cwd: string): string[] {
    return [
        "pi guide init",
        `cwd: ${cwd}`,
        "usage: /guide-init [package-source] [--no-settings] [--dev]",
        "modes:",
        "- /guide-init --no-settings",
        "- /guide-init --dev",
        "- /guide-init git:git@github.com:sillypoise/pi-guides@v0.6.0",
        "- /guide-init npm:@sillypoise/pi-guides@0.3.0",
        "notes:",
        "- use --no-settings when the package is already available globally",
        "- use --dev with PI_GUIDES_DEV_SOURCE or settings piGuidesDevSource",
        "- pass an explicit package source for reproducible repos",
    ];
}

function buildGuideInitWidgetLines(
    cwd: string,
    createdPaths: string[],
    skippedPaths: string[],
    writeSettings: boolean,
    packageSource: string | null,
    usedDefaultPackageSource: boolean,
    usedDevSource: boolean,
    skippedSettingsReason: "request" | "global-package" | null,
): string[] {
    const lines = [
        "pi guide init",
        `cwd: ${cwd}`,
    ];

    if (writeSettings) {
        if (usedDevSource) {
            lines.push("setup mode: local dev package path");
        } else {
            lines.push("setup mode: repo-pinned package");
        }
        if (packageSource === null) {
            lines.push("settings source: unavailable");
        } else {
            lines.push(`settings source: ${packageSource}`);
        }
        if (usedDefaultPackageSource) {
            lines.push(
                "note: the default settings source uses the package git tag; pass an explicit source if this repo should pin something else.",
            );
        }
        if (usedDevSource) {
            lines.push("note: local dev package paths are machine-specific; do not commit them to shared repos.");
        }
    } else {
        lines.push("setup mode: global package assumed");
        if (skippedSettingsReason === "global-package") {
            lines.push("settings: skipped because the package is already available globally");
        } else {
            lines.push("settings: skipped by request");
        }
    }

    lines.push("created:");
    if (createdPaths.length === 0) {
        lines.push("- none");
    } else {
        for (const path of createdPaths) {
            lines.push(`- ${path}`);
        }
    }

    lines.push("skipped existing:");
    if (skippedPaths.length === 0) {
        lines.push("- none");
    } else {
        for (const path of skippedPaths) {
            lines.push(`- ${path}`);
        }
    }

    lines.push("next:");
    lines.push("- /guides");
    if (writeSettings) {
        if (usedDevSource) {
            lines.push("- keep .pi/settings.json local unless every machine shares the same dev path");
        } else {
            lines.push("- commit .pi/settings.json, .pi/guides.json, and AGENTS.md for reproducible repos");
        }
    } else {
        lines.push("- commit .pi/guides.json and AGENTS.md when the repo should keep guide activation");
    }

    return lines;
}

function buildGuideSyncWidgetLines(cwd: string, result: SyncAgentsResult): string[] {
    const lines = [
        "pi guide sync",
        `cwd: ${cwd}`,
        `result: ${result}`,
        "target: AGENTS.md",
    ];

    if (result === "skipped") {
        lines.push("note: AGENTS.md is missing the managed guide header markers");
    }
    if (result === "unchanged") {
        lines.push("note: the managed guide header already matches the package template");
    }

    return lines;
}

async function showGuidesWidget(ctx: ExtensionContext, state: ResolvedState): Promise<void> {
    const lines = await buildGuidesWidgetLines(ctx.cwd, state);
    setGuidesWidget(ctx, lines);
}

async function showProfilesWidget(ctx: ExtensionCommandContext, state: ResolvedState): Promise<void> {
    const profiles = await loadProfiles();
    const lines = [
        "pi guide profiles",
        `status: ${renderStatus(state)}`,
        `config: ${state.configPath}`,
    ];
    lines.push(...buildAvailableProfileLines(profiles, "baseline"));
    setGuidesWidget(ctx, lines);
}

async function showSessionProfilesWidget(
    ctx: ExtensionCommandContext,
    state: ResolvedState,
): Promise<void> {
    const profiles = await loadProfiles();
    const lines = [
        "pi guide session",
        `status: ${renderStatus(state)}`,
        `config: ${state.configPath}`,
    ];
    if (state.active && state.sessionProfile !== null) {
        lines.push(
            `session overlay: ${formatNamedProfile(state.sessionProfile, state.sessionProfileTitle)}`,
        );
    } else {
        lines.push("session overlay: none");
    }
    lines.push("usage: /guide-session <profile-id|clear>");
    lines.push(...buildAvailableProfileLines(profiles, "overlay"));
    setGuidesWidget(ctx, lines);
}

async function showNextProfilesWidget(ctx: ExtensionCommandContext, state: ResolvedState): Promise<void> {
    const profiles = await loadProfiles();
    const lines = [
        "pi guide next",
        `status: ${renderStatus(state)}`,
        `config: ${state.configPath}`,
    ];
    if (state.active && state.nextProfile !== null) {
        lines.push(`next overlay: ${formatNamedProfile(state.nextProfile, state.nextProfileTitle)}`);
    } else {
        lines.push("next overlay: none");
    }
    lines.push("usage: /guide-next <profile-id|clear>");
    lines.push(...buildAvailableProfileLines(profiles, "overlay"));
    setGuidesWidget(ctx, lines);
}

type ProfilePickerOptions = {
    includeClear?: boolean;
};

async function showProfilePicker(
    ctx: ExtensionCommandContext,
    scope: "baseline" | "overlay",
    title: string,
    options?: ProfilePickerOptions,
): Promise<string | null> {
    const profiles = await loadProfiles();
    const items: Array<{ value: string; label: string; description?: string }> = [];

    if (options?.includeClear) {
        items.push({
            value: "clear",
            label: "(clear)",
            description: "Clear the active overlay",
        });
    }

    for (const [profileId, profile] of Object.entries(profiles.profiles)) {
        if (scope === "baseline" && !allowedAsBaselineProfile(profile)) {
            continue;
        }
        if (scope === "overlay" && !allowedAsSessionOverlayProfile(profile)) {
            continue;
        }

        items.push({
            value: profileId,
            label: profileId,
            description: profile.description ?? "No description.",
        });
    }

    if (items.length === 0) {
        ctx.ui.notify(`No ${scope} profiles available.`, "info");
        return null;
    }

    try {
        const [{ DynamicBorder }, { Container, SelectList, Text }] = await Promise.all([
            import("@mariozechner/pi-coding-agent"),
            import("@mariozechner/pi-tui"),
        ]);

        return await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
            const container = new Container();
            container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
            container.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 0));

            const selectList = new SelectList(items, Math.min(items.length, 10), {
                selectedPrefix: (t: string) => theme.fg("accent", t),
                selectedText: (t: string) => theme.fg("accent", t),
                description: (t: string) => theme.fg("muted", t),
                scrollInfo: (t: string) => theme.fg("dim", t),
                noMatch: (t: string) => theme.fg("warning", t),
            });

            selectList.onSelect = (item: { value: string }) => done(item.value);
            selectList.onCancel = () => done(null);

            container.addChild(selectList);
            container.addChild(
                new Text(
                    theme.fg("dim", "↑↓ navigate • type to filter • enter select • esc cancel"),
                    1,
                    0,
                ),
            );
            container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

            return {
                render: (width: number) => container.render(width),
                invalidate: () => container.invalidate(),
                handleInput: (data: string) => {
                    selectList.handleInput(data);
                    tui.requestRender();
                },
            };
        });
    } catch {
        // Fallback when pi TUI packages are unavailable (e.g., tests or minimal environments).
        const labels = items.map((item) => item.label);
        const choice = await ctx.ui.select(title, labels);
        if (choice === null || choice === undefined) {
            return null;
        }
        const found = items.find((item) => item.label === choice);
        return found?.value ?? null;
    }
}

function guideConfigContent(config: GuideConfig): string {
    return JSON.stringify(cloneGuideConfig(config), null, 2);
}

function buildProfileConfig(
    currentConfig: GuideConfig,
    nextProfileId: string,
    profile: ProfileRecord,
): GuideConfig {
    const nextConfig = cloneGuideConfig(currentConfig);
    nextConfig.profile = nextProfileId;
    delete nextConfig.guides;

    if (currentConfig.profile === undefined) {
        nextConfig.additions = [];
        nextConfig.removals = [];
    }

    if (nextConfig.mode === undefined) {
        nextConfig.mode = profile.mode ?? GUIDE_MODE_FULL;
    }
    return nextConfig;
}

function parseGuideModeArg(args: string | undefined): GuideMode | "missing" | "invalid" {
    const parts = splitArgs(args);
    if (parts.length === 0) {
        return "missing";
    }

    const mode = parts[0];
    if (mode === GUIDE_MODE_COMPACT) {
        return GUIDE_MODE_COMPACT;
    }
    if (mode === GUIDE_MODE_FULL) {
        return GUIDE_MODE_FULL;
    }
    return "invalid";
}

async function runGuideSession(
    pi: ExtensionAPI,
    ctx: ExtensionCommandContext,
    args: string | undefined,
): Promise<void> {
    const state = await refreshStatus(ctx);
    const parts = splitArgs(args);
    let profileId: string | undefined = parts[0];

    if (profileId === undefined) {
        if (ctx.hasUI) {
            const picked = await showProfilePicker(ctx, "overlay", "Select Session Overlay", {
                includeClear: true,
            });
            if (picked === null) {
                return;
            }
            profileId = picked;
        } else {
            await showSessionProfilesWidget(ctx, state);
            ctx.ui.notify("guide-session: specify an overlay profile id or 'clear'", "info");
            return;
        }
    }
    if (profileId === "clear") {
        if (!state.active || state.sessionProfile === null) {
            await showSessionProfilesWidget(ctx, state);
            ctx.ui.notify("guide-session: no session overlay is active", "info");
            return;
        }

        setSessionOverlayProfileId(ctx.cwd, null);
        pi.appendEntry(SESSION_OVERLAY_ENTRY_TYPE, { profileId: null });
        const nextState = await refreshStatus(ctx);
        await showGuidesWidget(ctx, nextState);
        ctx.ui.notify("guide-session: cleared the active session overlay", "success");
        return;
    }

    const profiles = await loadProfiles();
    const profile = profiles.profiles[profileId];
    if (profile === undefined) {
        await showSessionProfilesWidget(ctx, state);
        ctx.ui.notify(`guide-session: unknown profile '${profileId}'`, "warning");
        return;
    }
    if (!allowedAsSessionOverlayProfile(profile)) {
        await showSessionProfilesWidget(ctx, state);
        ctx.ui.notify(`guide-session: profile '${profileId}' is not an overlay profile`, "warning");
        return;
    }
    if (state.active && state.sessionProfile === profileId) {
        await showSessionProfilesWidget(ctx, state);
        ctx.ui.notify(`guide-session: overlay '${profileId}' is already active`, "info");
        return;
    }

    setSessionOverlayProfileId(ctx.cwd, profileId);
    pi.appendEntry(SESSION_OVERLAY_ENTRY_TYPE, { profileId });
    const nextState = await refreshStatus(ctx);
    await showGuidesWidget(ctx, nextState);
    ctx.ui.notify(`guide-session: activated overlay '${profileId}' for this session`, "success");
}

async function runGuideNext(
    ctx: ExtensionCommandContext,
    args: string | undefined,
): Promise<void> {
    const state = await refreshStatus(ctx);
    const parts = splitArgs(args);
    let profileId: string | undefined = parts[0];

    if (profileId === undefined) {
        if (ctx.hasUI) {
            const picked = await showProfilePicker(ctx, "overlay", "Select Next-Turn Overlay", {
                includeClear: true,
            });
            if (picked === null) {
                return;
            }
            profileId = picked;
        } else {
            await showNextProfilesWidget(ctx, state);
            ctx.ui.notify("guide-next: specify an overlay profile id or 'clear'", "info");
            return;
        }
    }
    if (profileId === "clear") {
        if (!state.active || state.nextProfile === null) {
            await showNextProfilesWidget(ctx, state);
            ctx.ui.notify("guide-next: no next-turn overlay is active", "info");
            return;
        }

        setNextOverlayProfileId(ctx.cwd, null);
        const nextState = await refreshStatus(ctx);
        await showGuidesWidget(ctx, nextState);
        ctx.ui.notify("guide-next: cleared the pending next-turn overlay", "success");
        return;
    }

    const profiles = await loadProfiles();
    const profile = profiles.profiles[profileId];
    if (profile === undefined) {
        await showNextProfilesWidget(ctx, state);
        ctx.ui.notify(`guide-next: unknown profile '${profileId}'`, "warning");
        return;
    }
    if (!allowedAsSessionOverlayProfile(profile)) {
        await showNextProfilesWidget(ctx, state);
        ctx.ui.notify(`guide-next: profile '${profileId}' is not an overlay profile`, "warning");
        return;
    }
    if (state.active && state.nextProfile === profileId) {
        await showNextProfilesWidget(ctx, state);
        ctx.ui.notify(`guide-next: overlay '${profileId}' is already pending`, "info");
        return;
    }

    setNextOverlayProfileId(ctx.cwd, profileId);
    const nextState = await refreshStatus(ctx);
    await showGuidesWidget(ctx, nextState);
    ctx.ui.notify(`guide-next: queued overlay '${profileId}' for the next turn`, "success");
}

async function runGuideProfile(ctx: ExtensionCommandContext, args: string | undefined): Promise<void> {
    const state = await refreshStatus(ctx);
    const parts = splitArgs(args);
    let profileId: string | undefined = parts[0];

    if (profileId === undefined) {
        if (ctx.hasUI) {
            const picked = await showProfilePicker(ctx, "baseline", "Select Baseline Profile");
            if (picked === null) {
                return;
            }
            profileId = picked;
        } else {
            await showProfilesWidget(ctx, state);
            ctx.ui.notify("guide-profile: specify a profile id to persist it", "info");
            return;
        }
    }
    const profiles = await loadProfiles();
    const profile = profiles.profiles[profileId];
    if (profile === undefined) {
        await showProfilesWidget(ctx, state);
        ctx.ui.notify(`guide-profile: unknown profile '${profileId}'`, "warning");
        return;
    }
    if (!allowedAsBaselineProfile(profile)) {
        await showProfilesWidget(ctx, state);
        ctx.ui.notify(`guide-profile: profile '${profileId}' is not allowed as a repo baseline`, "warning");
        return;
    }

    try {
        const loadedConfig = await loadGuideConfig(ctx.cwd);
        const nextConfig = buildProfileConfig(loadedConfig.config, profileId, profile);
        const currentConfigContent = guideConfigContent(loadedConfig.config);
        const nextConfigContent = guideConfigContent(nextConfig);
        if (currentConfigContent === nextConfigContent) {
            await showProfilesWidget(ctx, state);
            ctx.ui.notify(`guide-profile: profile '${profileId}' is already persisted`, "info");
            return;
        }

        await writeGuideConfig(loadedConfig.configPath, nextConfig);
        ctx.ui.notify(`guide-profile: wrote profile '${profileId}'; reloading runtime`, "success");
        await ctx.reload();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`guide-profile: ${message}`, "warning");
    }
}

async function runGuideMode(ctx: ExtensionCommandContext, args: string | undefined): Promise<void> {
    const state = await refreshStatus(ctx);
    const nextMode = parseGuideModeArg(args);
    if (nextMode === "missing") {
        await showGuidesWidget(ctx, state);
        ctx.ui.notify("guide-mode: specify 'compact' or 'full' to persist a mode", "info");
        return;
    }
    if (nextMode === "invalid") {
        await showGuidesWidget(ctx, state);
        ctx.ui.notify("guide-mode: mode must be 'compact' or 'full'", "warning");
        return;
    }

    try {
        const loadedConfig = await loadGuideConfig(ctx.cwd);
        const nextConfig = cloneGuideConfig(loadedConfig.config);
        nextConfig.mode = nextMode;
        const currentConfigContent = guideConfigContent(loadedConfig.config);
        const nextConfigContent = guideConfigContent(nextConfig);
        if (currentConfigContent === nextConfigContent) {
            await showGuidesWidget(ctx, state);
            ctx.ui.notify(`guide-mode: mode '${nextMode}' is already persisted`, "info");
            return;
        }

        await writeGuideConfig(loadedConfig.configPath, nextConfig);
        ctx.ui.notify(`guide-mode: wrote mode '${nextMode}'; reloading runtime`, "success");
        await ctx.reload();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`guide-mode: ${message}`, "warning");
    }
}

async function runGuideAutoCommit(ctx: ExtensionCommandContext): Promise<void> {
    const state = await refreshStatus(ctx);

    try {
        const loadedConfig = await loadGuideConfig(ctx.cwd);
        const currentAutoCommit = loadedConfig.config.behavior?.autoCommit ?? false;
        const nextAutoCommit = !currentAutoCommit;

        const nextConfig = cloneGuideConfig(loadedConfig.config);
        nextConfig.behavior = { ...nextConfig.behavior, autoCommit: nextAutoCommit };

        const currentConfigContent = guideConfigContent(loadedConfig.config);
        const nextConfigContent = guideConfigContent(nextConfig);
        if (currentConfigContent === nextConfigContent) {
            await showGuidesWidget(ctx, state);
            ctx.ui.notify(
                `guide-auto-commit: already ${nextAutoCommit ? "on" : "off"}`,
                "info",
            );
            return;
        }

        await writeGuideConfig(loadedConfig.configPath, nextConfig);
        ctx.ui.notify(
            `guide-auto-commit: ${nextAutoCommit ? "enabled" : "disabled"}; reloading runtime`,
            "success",
        );
        await ctx.reload();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`guide-auto-commit: ${message}`, "warning");
    }
}

export default function guideSystemExtension(pi: ExtensionAPI) {
    pi.registerCommand("guides", {
        description: "Show resolved pi guide state for this repository",
        handler: async (_args, ctx) => {
            const state = await refreshStatus(ctx);
            await showGuidesWidget(ctx, state);
            notifyGuidesState(ctx, state);
        },
    });

    pi.registerCommand("guide-init", {
        description: "Initialize .pi/guides.json, .pi/settings.json, and repo AGENTS.md from package templates",
        handler: async (args, ctx) => {
            await runGuideInit(ctx, args);
        },
    });

    pi.registerCommand("guide-sync", {
        description: "Refresh the managed header block in repo AGENTS.md from the package template",
        handler: async (_args, ctx) => {
            await runGuideSync(ctx);
        },
    });

    pi.registerCommand("guide-profile", {
        description: "Persist a named guide profile to .pi/guides.json",
        handler: async (args, ctx) => {
            await runGuideProfile(ctx, args);
        },
    });

    pi.registerCommand("guide-mode", {
        description: "Persist the active guide mode to .pi/guides.json",
        handler: async (args, ctx) => {
            await runGuideMode(ctx, args);
        },
    });

    pi.registerCommand("guide-auto-commit", {
        description: "Toggle automatic git commit after file changes",
        handler: async (_args, ctx) => {
            await runGuideAutoCommit(ctx);
        },
    });

    pi.registerCommand("guide-session", {
        description: "Activate or clear a temporary guide overlay for this session",
        handler: async (args, ctx) => {
            await runGuideSession(pi, ctx, args);
        },
    });

    pi.registerCommand("guide-next", {
        description: "Queue a temporary guide overlay for the next turn only",
        handler: async (args, ctx) => {
            await runGuideNext(ctx, args);
        },
    });

    pi.on("session_start", async (_event, ctx) => {
        const sessionEntries = ctx.sessionManager?.getEntries?.() ?? [];
        const sessionOverlayEntry = sessionEntries
            .filter((entry) => {
                return entry.type === "custom" && entry.customType === SESSION_OVERLAY_ENTRY_TYPE;
            })
            .pop() as { data?: { profileId?: string | null } } | undefined;

        const sessionOverlayProfileId = sessionOverlayEntry?.data?.profileId ?? null;
        setSessionOverlayProfileId(ctx.cwd, sessionOverlayProfileId);

        const state = await refreshStatus(ctx);
        if (state.active) {
            return;
        }
        if (state.inactiveKind !== "error") {
            return;
        }
        ctx.ui.notify(`pi guides: ${state.reason}`, "warning");
    });

    pi.on("before_agent_start", async (event, ctx) => {
        const state = await refreshStatus(ctx);
        if (!state.active) {
            return;
        }
        if (state.nextProfile !== null) {
            consumed_next_overlay_cwds.add(ctx.cwd);
        }

        const registry = await loadRegistry();
        const injectedPrompt = await buildInjectedPrompt(state, registry);
        return {
            systemPrompt: `${event.systemPrompt}\n\n${injectedPrompt}`,
        };
    });

    pi.on("tool_call", async (event, ctx) => {
        const state = await resolveState(ctx.cwd);
        if (!state.active) {
            return undefined;
        }
        if (state.behavior.writePolicy !== "read-only") {
            return undefined;
        }

        if (event.toolName === "edit" || event.toolName === "write") {
            const path = typeof event.input.path === "string" ? event.input.path : "unknown path";
            ctx.ui.notify(`guide-session: blocked write in read-only mode: ${path}`, "warning");
            return { block: true, reason: "Blocked by pi-guides read-only mode" };
        }

        if (event.toolName !== "bash") {
            return undefined;
        }

        const command = typeof event.input.command === "string" ? event.input.command : "";
        if (!isMutatingBashCommand(command)) {
            return undefined;
        }

        ctx.ui.notify("guide-session: blocked mutating bash command in read-only mode", "warning");
        return { block: true, reason: "Blocked mutating bash by pi-guides read-only mode" };
    });

    pi.on("turn_end", async (_event, ctx) => {
        if (!consumed_next_overlay_cwds.has(ctx.cwd)) {
            return;
        }

        setNextOverlayProfileId(ctx.cwd, null);
        await refreshStatus(ctx);
    });

    pi.on("session_shutdown", async (_event, ctx) => {
        setSessionOverlayProfileId(ctx.cwd, null);
        setNextOverlayProfileId(ctx.cwd, null);
        clearUi(ctx);
    });
}
