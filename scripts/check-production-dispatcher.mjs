#!/usr/bin/env node
/**
 * check-production-dispatcher.mjs
 *
 * Only the people listed in .github/production-dispatchers.json may start, or
 * re-run, a job that holds a production environment's secrets.
 *
 * Kept in step with atlasent-api's scripts/check-production-dispatcher.mjs; the
 * only difference is how js-yaml is loaded (see loadYaml).
 *
 * WHY
 *  - Required reviewers on an environment needs a paid plan this org does not
 *    have (atlasent-api#1739), so GitHub never pauses a production job.
 *  - The AtlaSent gate authorizes the workflow's own OIDC workload identity,
 *    not the person who dispatched it, so it cannot tell one dispatcher from
 *    another.
 *  - So, before this check, anyone with write access could push a release tag
 *    and ship code to every customer workflow pinned to `@v1` (release.yml
 *    moves the floating tag), move `v1` directly (create-v1-tag.yml), or
 *    publish the npm packages.
 *
 * WHAT IT DOES NOT COVER
 *  A workflow file edited on another branch runs that branch's version, which
 *  can drop this step. Closing that needs the environment's deployment-branch
 *  policy set to `main` and a ruleset that keeps this file and every workflow
 *  from changing on `main` without review. Those are repository settings, not
 *  code.
 *
 * MODES
 *  --enforce            Run inside a production job (via the composite action
 *                       .github/actions/production-dispatcher-check). Refuses
 *                       unless both github.actor_id and the triggering actor's
 *                       numeric id are listed. Matches numeric ids, never
 *                       logins: a renamed account's old login can be claimed.
 *  --verify-workflows   Structural check (guards.yml): every job bound to a
 *                       protected environment runs the check first, with
 *                       nothing but checkout before it, and no later step can
 *                       run after a refusal unless it is a listed reporting
 *                       step.
 *  --self-test          Proves both modes reject the defects they target,
 *                       including mutants of the real workflow files.
 *
 * Fail-closed throughout: a malformed allowlist, a missing id, a failed user
 * lookup, a workflow that does not parse, or an empty protected-job set is a
 * refusal or a finding, never a pass.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ALLOWLIST_PATH = ".github/production-dispatchers.json";
export const CHECK_ACTION = "./.github/actions/production-dispatcher-check";
const WORKFLOW_DIR = ".github/workflows";

// ── allowlist ──────────────────────────────────────────────────────────────

export function parseAllowlist(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return { error: `does not parse as JSON (${e.message})` };
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { error: "is not an object" };
  if (doc.schema_version !== 1) return { error: `schema_version must be 1 (got ${JSON.stringify(doc.schema_version)})` };
  const list = doc.dispatchers;
  if (!Array.isArray(list) || list.length === 0) return { error: "dispatchers must be a non-empty array" };
  const ids = new Set();
  for (const [i, d] of list.entries()) {
    if (!d || !Number.isSafeInteger(d.id) || d.id <= 0) return { error: `dispatchers[${i}].id must be a positive integer GitHub user id` };
    if (typeof d.login !== "string" || d.login === "") return { error: `dispatchers[${i}].login is required (for readers; matching uses the id)` };
    if (typeof d.basis !== "string" || d.basis.trim() === "") return { error: `dispatchers[${i}].basis must say why this person may dispatch production` };
    if (ids.has(d.id)) return { error: `dispatchers[${i}].id ${d.id} is listed twice` };
    ids.add(d.id);
  }
  // protected_environments: every job bound to one is protected.
  // protected_workflows (optional): every job in the file is protected, with or
  // without an environment. Use it where a job holds production credentials
  // without an environment, or only depends on one that does (re-running that
  // job alone would skip a check that lives in the job it needs).
  const envs = doc.protected_environments;
  if (!Array.isArray(envs) || envs.length === 0 || envs.some((e) => typeof e !== "string" || e === "")) {
    return { error: "protected_environments must be a non-empty array of environment names" };
  }
  const workflows = doc.protected_workflows ?? [];
  if (!Array.isArray(workflows) || workflows.some((w) => typeof w !== "string" || !/^\.github\/workflows\/[^/]+\.ya?ml$/.test(w))) {
    return { error: "protected_workflows must be an array of .github/workflows/<file> paths" };
  }
  const reporting = doc.reporting_steps ?? {};
  if (typeof reporting !== "object" || Array.isArray(reporting)) return { error: "reporting_steps must be an object" };
  for (const [k, v] of Object.entries(reporting)) {
    if (!Array.isArray(v) || v.some((s) => typeof s !== "string" || s === "")) return { error: `reporting_steps[${k}] must be an array of step names` };
  }
  // GitHub environment names are case-insensitive: `Production` is the same environment.
  return { ids, logins: new Map(list.map((d) => [d.id, d.login])), envs: new Set(envs.map((e) => e.toLowerCase())), workflows: new Set(workflows), reporting };
}

// ── enforce ────────────────────────────────────────────────────────────────

const parseId = (v) => (typeof v === "string" && /^[1-9][0-9]*$/.test(v.trim()) ? Number(v.trim()) : null);

/**
 * Pure decision. `triggeringId` is the numeric id of the account that started
 * this attempt (it differs from the actor on a re-run).
 */
export function decide({ allow, environment, actorId, actorLogin, triggeringLogin, triggeringId }) {
  if (allow.error) return { ok: false, reason: `${ALLOWLIST_PATH} ${allow.error}` };
  const env = (environment ?? "").trim();
  if (env !== "" && !allow.envs.has(env.toLowerCase())) {
    return { ok: true, note: `environment '${env}' is not a protected environment; no dispatcher restriction applies` };
  }
  const aid = parseId(actorId);
  if (aid === null) return { ok: false, reason: "github.actor_id is missing or not a number, so who started this run cannot be established" };
  if (!allow.ids.has(aid)) {
    return { ok: false, reason: `${actorLogin || "unknown"} (id ${aid}) is not on ${ALLOWLIST_PATH}` };
  }
  if (!triggeringLogin) return { ok: false, reason: "github.triggering_actor is missing, so who started this attempt cannot be established" };
  if (triggeringId === null || triggeringId === undefined) {
    return { ok: false, reason: `the numeric id of triggering actor ${triggeringLogin} could not be established` };
  }
  if (!allow.ids.has(triggeringId)) {
    return { ok: false, reason: `${triggeringLogin} (id ${triggeringId}) re-ran or started this attempt and is not on ${ALLOWLIST_PATH}` };
  }
  return { ok: true, note: `${actorLogin} (id ${aid}) is on ${ALLOWLIST_PATH}` };
}

async function lookupUserId(login, token) {
  const api = process.env.GITHUB_API_URL || "https://api.github.com";
  const headers = { accept: "application/vnd.github+json", "user-agent": "production-dispatcher-check" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${api}/users/${encodeURIComponent(login)}`, { headers, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`GET /users/${login} returned HTTP ${res.status}`);
  const body = await res.json();
  if (!Number.isSafeInteger(body?.id) || body.id <= 0) throw new Error(`GET /users/${login} carried no numeric id`);
  if (String(body.login).toLowerCase() !== login.toLowerCase()) throw new Error(`GET /users/${login} answered for a different login`);
  return body.id;
}

async function enforce() {
  const env = process.env;
  const allow = fs.existsSync(ALLOWLIST_PATH) ? parseAllowlist(fs.readFileSync(ALLOWLIST_PATH, "utf8")) : { error: "is missing from the checkout" };
  const actorLogin = env.GITHUB_ACTOR ?? "";
  const triggeringLogin = env.GITHUB_TRIGGERING_ACTOR ?? "";
  let triggeringId = null;
  let lookupError = "";
  if (triggeringLogin && triggeringLogin === actorLogin) {
    triggeringId = parseId(env.GITHUB_ACTOR_ID);
  } else if (triggeringLogin) {
    try {
      triggeringId = await lookupUserId(triggeringLogin, env.GH_TOKEN);
    } catch (e) {
      lookupError = e.message;
    }
  }
  const verdict = decide({
    allow,
    environment: env.DISPATCHER_CHECK_ENVIRONMENT,
    actorId: env.GITHUB_ACTOR_ID,
    actorLogin,
    triggeringLogin,
    triggeringId,
  });
  if (!verdict.ok) {
    const why = lookupError ? `${verdict.reason} (${lookupError})` : verdict.reason;
    console.log(`::error title=Production dispatcher refused::${why}. No step after this check runs. Only a reviewed change to ${ALLOWLIST_PATH}, with a DECISION_LEDGER entry in atlasent-internal, adds a dispatcher.`);
    process.exit(1);
  }
  console.log(`production-dispatcher-check: allowed. ${verdict.note}.`);
}

// ── verify-workflows ───────────────────────────────────────────────────────

// Any status function replaces the implicit success() a step otherwise gets,
// including a negated or ||-joined success(). Only a bare top-level success()
// conjunct keeps it.
const STATUS_FN = /\b(always|cancelled|failure|success)\s*\(\s*\)/;

function stripExpr(s) {
  const t = String(s).trim();
  const m = t.match(/^\$\{\{([\s\S]*)\}\}$/);
  return (m ? m[1] : t).trim();
}

/** Split on top-level `&&`; returns null when a top-level `||` is present. */
export function topLevelConjuncts(expr) {
  const out = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0 && expr.startsWith("||", i)) return null;
    else if (depth === 0 && expr.startsWith("&&", i)) {
      out.push(expr.slice(start, i).trim());
      start = i + 2;
      i++;
    }
  }
  out.push(expr.slice(start).trim());
  return out;
}

const RAN_CONJUNCT = /^steps\.([A-Za-z0-9_-]+)\.(?:outputs\.[A-Za-z0-9_-]+\s*==\s*'[^']+'|(?:outcome|conclusion)\s*==\s*'(?:success|failure)')$/;

/**
 * A step after the check can run after a refusal only if its `if` uses a
 * status function. It is still safe when its condition also requires a later
 * step to have actually run (a non-empty output or a success/failure outcome),
 * because no later step runs once the check has failed.
 */
function stepRunsOnlyIfCheckPassed(step, idx, steps, guardIdx, memo = new Map()) {
  if (memo.has(idx)) return memo.get(idx);
  memo.set(idx, false);
  let ok;
  if (step.if === undefined || step.if === null || step.if === "") ok = true;
  else {
    const expr = stripExpr(step.if);
    const parts = topLevelConjuncts(expr);
    if (!STATUS_FN.test(expr)) ok = true;
    else if (parts && parts.some((p) => /^success\s*\(\s*\)$/.test(p))) ok = true;
    else {
      ok = false;
      if (parts) {
        for (const p of parts) {
          const m = p.match(RAN_CONJUNCT);
          if (!m) continue;
          const refIdx = steps.findIndex((s, j) => j > guardIdx && s.id === m[1]);
          if (refIdx > guardIdx && refIdx < idx && stepRunsOnlyIfCheckPassed(steps[refIdx], refIdx, steps, guardIdx, memo)) {
            ok = true;
            break;
          }
        }
      }
    }
  }
  memo.set(idx, ok);
  return ok;
}

const envOf = (job) => (typeof job.environment === "string" ? job.environment : job.environment?.name);
const isCheckout = (s) => typeof s?.uses === "string" && /^actions\/checkout@/.test(s.uses);
export const GUARD_FILES = [ALLOWLIST_PATH, ".github/actions/production-dispatcher-check", "scripts/check-production-dispatcher.mjs"];
const ACTION_SUFFIX = "/.github/actions/production-dispatcher-check";

/** The checkout root a guard step loads from: "" for the workspace, else the nested path. */
export function guardRoot(uses) {
  if (typeof uses !== "string") return null;
  const u = uses.trim();
  if (u === CHECK_ACTION) return "";
  const m = u.match(/^\.\/(.+)\/\.github\/actions\/production-dispatcher-check$/);
  return m ? m[1].replace(/\/+$/, "") : null;
}
// Strip a leading "./" (or a bare "."), never a leading dot: `.dispatcher-guard` is a real directory name.
const normPath = (p) => {
  if (typeof p !== "string") return "";
  const t = p.trim().replace(/\/+$/, "");
  return t === "." ? "" : t.replace(/^\.\//, "");
};

/** Why the checkouts before the guard do not put its files where it loads them, or null. */
export function checkoutProblem(before, root) {
  const own = before.filter((s) => isCheckout(s) && (!s.with?.repository || /^\$\{\{\s*github\.repository\s*\}\}$/.test(String(s.with.repository).trim())));
  const at = own.filter((s) => normPath(s.with?.path) === normPath(root));
  if (at.length === 0) return `no checkout of this repository at '${root || "."}', where the check is loaded from`;
  const c = at[at.length - 1];
  // The allowlist must come from the workflow's own commit. A ref chosen at
  // run time (an input, a workflow_run head_sha) could name a commit whose
  // allowlist lists anyone.
  const ref = c.with?.ref;
  if (ref !== undefined && ref !== null && !/^\$\{\{\s*github\.(sha|ref)\s*\}\}$/.test(String(ref).trim())) {
    return `it checks out ref ${JSON.stringify(ref)}, not the workflow's own commit; check out the check separately at the default ref (path: .dispatcher-guard) and load it from there`;
  }
  const sparse = c.with?.["sparse-checkout"];
  if (sparse === undefined || sparse === null || String(sparse).trim() === "") return null;
  const lines = String(sparse).split("\n").map((l) => l.trim()).filter(Boolean);
  const missing = GUARD_FILES.filter((f) => !lines.includes(f));
  if (missing.length) return `its sparse checkout omits ${missing.join(", ")}`;
  if (c.with?.["sparse-checkout-cone-mode"] !== false) return "its sparse checkout lists files, so it needs sparse-checkout-cone-mode: false";
  return null;
}

/** Structural findings for one parsed workflow. */
export function verifyWorkflow(file, doc, allow) {
  const findings = [];
  const protectedJobs = [];
  if (!doc || typeof doc !== "object" || typeof doc.jobs !== "object" || doc.jobs === null) {
    return { findings: [`${file}: does not parse to a workflow with jobs`], protectedJobs };
  }
  const wholeWorkflow = allow.workflows?.has(file) ?? false;
  for (const [jobName, job] of Object.entries(doc.jobs)) {
    const raw = envOf(job);
    const env = typeof raw === "string" ? raw : "";
    const dynamic = env.includes("${{");
    if (!wholeWorkflow && (env === "" || (!dynamic && !allow.envs.has(env.toLowerCase())))) continue;
    const where = `${file} job '${jobName}' (${env ? `environment ${env}` : "no environment; protected_workflows"})`;
    protectedJobs.push(`${file}::${jobName}`);
    if (job.uses) {
      findings.push(`${where} calls a reusable workflow; the check cannot run first inside it`);
      continue;
    }
    if (job["continue-on-error"]) findings.push(`${where} sets continue-on-error, so a refusal would not stop it`);
    const steps = Array.isArray(job.steps) ? job.steps : [];
    const guardIdx = steps.findIndex((s) => guardRoot(s?.uses) !== null);
    if (guardIdx < 0) {
      findings.push(`${where} never runs ${CHECK_ACTION}`);
      continue;
    }
    const nonCheckout = steps.slice(0, guardIdx).filter((s) => !isCheckout(s));
    if (nonCheckout.length) findings.push(`${where} runs '${nonCheckout[0].name ?? nonCheckout[0].uses ?? "a step"}' before the dispatcher check`);
    const guard = steps[guardIdx];
    const cp = checkoutProblem(steps.slice(0, guardIdx), guardRoot(guard.uses));
    if (cp) findings.push(`${where}: the dispatcher check cannot load: ${cp}`);
    if (guard.if !== undefined) findings.push(`${where}: the dispatcher check has an if:, so it can be skipped`);
    if (guard["continue-on-error"]) findings.push(`${where}: the dispatcher check sets continue-on-error`);
    if (dynamic) {
      const passed = guard.with?.environment;
      if (typeof passed !== "string" || passed.replace(/\s+/g, "") !== env.replace(/\s+/g, "")) {
        findings.push(`${where}: the environment is computed at run time, so the check must receive it as 'with: environment: ${env}'`);
      }
    } else if (guard.with?.environment !== undefined) {
      findings.push(`${where}: a fixed protected environment must not pass 'environment' to the check (it could name an unprotected one)`);
    }
    const listed = new Set(allow.reporting[`${file}::${jobName}`] ?? []);
    for (let i = guardIdx + 1; i < steps.length; i++) {
      const s = steps[i];
      if (stepRunsOnlyIfCheckPassed(s, i, steps, guardIdx)) continue;
      if (listed.has(s.name)) continue;
      findings.push(`${where}: step '${s.name ?? s.id ?? `#${i + 1}`}' can run after a refused check (if: ${JSON.stringify(s.if)}); make it depend on a later step having run, or list it in ${ALLOWLIST_PATH} reporting_steps["${file}::${jobName}"] if it only reports`);
    }
  }
  return { findings, protectedJobs };
}

async function loadYaml() {
  const entry = process.env.JS_YAML_MODULE;
  const mod = entry ? await import(pathToFileURL(path.resolve(entry)).href) : await import("js-yaml");
  return mod.load ?? mod.default.load;
}

export async function verifyTree(root = ".") {
  const load = await loadYaml();
  const allowPath = path.join(root, ALLOWLIST_PATH);
  const allow = fs.existsSync(allowPath) ? parseAllowlist(fs.readFileSync(allowPath, "utf8")) : { error: "is missing" };
  if (allow.error) return { findings: [`${ALLOWLIST_PATH} ${allow.error}`], protectedJobs: [] };
  const dir = path.join(root, WORKFLOW_DIR);
  const findings = [];
  const protectedJobs = [];
  const files = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort();
  for (const f of files) {
    const rel = `${WORKFLOW_DIR}/${f}`;
    let doc;
    try {
      doc = load(fs.readFileSync(path.join(dir, f), "utf8"));
    } catch (e) {
      findings.push(`${rel}: does not parse (${e.message.split("\n")[0]})`);
      continue;
    }
    const r = verifyWorkflow(rel, doc, allow);
    findings.push(...r.findings);
    protectedJobs.push(...r.protectedJobs);
  }
  if (protectedJobs.length === 0) findings.push("no job is bound to a protected environment; the scan set is empty, which is never a pass");
  for (const key of Object.keys(allow.reporting)) {
    if (!protectedJobs.includes(key)) findings.push(`${ALLOWLIST_PATH} reporting_steps names '${key}', which is not a protected job`);
  }
  for (const w of allow.workflows) {
    if (!fs.existsSync(path.join(root, w))) findings.push(`${ALLOWLIST_PATH} protected_workflows names ${w}, which does not exist`);
  }
  return { findings, protectedJobs };
}

// ── self-test ──────────────────────────────────────────────────────────────

async function selfTest() {
  const load = await loadYaml();
  let failures = 0;
  const expect = (cond, label) => {
    if (cond) console.log(`  ok   ${label}`);
    else {
      failures++;
      console.log(`  FAIL ${label}`);
    }
  };
  const allowDoc = {
    schema_version: 1,
    dispatchers: [{ id: 101, login: "founder", basis: "test" }],
    protected_environments: ["production"],
    reporting_steps: {},
  };
  const allow = parseAllowlist(JSON.stringify(allowDoc));
  const base = { allow, actorId: "101", actorLogin: "founder", triggeringLogin: "founder", triggeringId: 101 };

  console.log("decide():");
  expect(decide(base).ok, "listed actor who started the run is allowed");
  expect(!decide({ ...base, actorId: "202", actorLogin: "newcomer", triggeringLogin: "newcomer", triggeringId: 202 }).ok, "an unlisted dispatcher is refused");
  expect(!decide({ ...base, triggeringLogin: "newcomer", triggeringId: 202 }).ok, "an unlisted person re-running a listed person's run is refused");
  expect(!decide({ ...base, triggeringId: null }).ok, "an unresolved triggering actor id is refused");
  expect(!decide({ ...base, triggeringLogin: "" }).ok, "a missing triggering actor is refused");
  expect(!decide({ ...base, actorId: "" }).ok, "a missing actor id is refused");
  expect(!decide({ ...base, actorId: "101abc" }).ok, "a non-numeric actor id is refused");
  expect(!decide({ ...base, actorLogin: "founder", actorId: "202" }).ok, "a listed login with an unlisted id is refused (ids, never logins)");
  expect(!decide({ ...base, allow: parseAllowlist("{") }).ok, "a malformed allowlist refuses everyone");
  expect(!decide({ ...base, allow: parseAllowlist(JSON.stringify({ ...allowDoc, dispatchers: [] })) }).ok, "an empty allowlist refuses everyone");
  expect(!decide({ ...base, allow: parseAllowlist(JSON.stringify({ ...allowDoc, dispatchers: [{ login: "founder", basis: "x" }] })) }).ok, "an entry without a numeric id is invalid");
  expect(decide({ ...base, actorId: "202", actorLogin: "newcomer", triggeringLogin: "newcomer", triggeringId: 202, environment: "staging" }).ok, "a run-time environment that is not protected passes for anyone");
  expect(!decide({ ...base, actorId: "202", actorLogin: "newcomer", triggeringLogin: "newcomer", triggeringId: 202, environment: "production" }).ok, "a run-time environment that resolves to production is protected");
  expect(!decide({ ...base, actorId: "202", actorLogin: "newcomer", triggeringLogin: "newcomer", triggeringId: 202, environment: "Production" }).ok, "environment names match case-insensitively, as GitHub's do");

  console.log("topLevelConjuncts():");
  expect(JSON.stringify(topLevelConjuncts("always() && steps.a.outputs.x == 'a && b'")) === JSON.stringify(["always()", "steps.a.outputs.x == 'a && b'"]), "splits on top-level && only");
  expect(topLevelConjuncts("always() || steps.a.outcome == 'success'") === null, "a top-level || makes the condition unprovable");
  expect(topLevelConjuncts("always() && (a || b)") !== null, "an || inside parentheses is not top-level");

  console.log("verifyWorkflow() on synthetic jobs:");
  const guardStep = { name: "Production dispatcher must be on the allowlist", uses: CHECK_ACTION };
  const wf = (steps, extra = {}) => ({ jobs: { deploy: { "runs-on": "ubuntu-latest", environment: "production", steps, ...extra } } });
  const good = [{ uses: "actions/checkout@v7" }, guardStep, { name: "gate", id: "gate", run: "x" }, { name: "post", if: "${{ always() && steps.gate.outputs.ok == 'true' }}", run: "y" }];
  const count = (doc) => verifyWorkflow("t.yml", doc, allow).findings.length;
  expect(count(wf(good)) === 0, "a correctly guarded job has no findings");
  expect(count(wf([{ uses: "actions/checkout@v7" }, { run: "deploy" }])) > 0, "a missing check is a finding");
  expect(count(wf([{ uses: "actions/checkout@v7" }, { name: "setup", run: "x" }, guardStep])) > 0, "a step before the check is a finding");
  expect(count(wf([{ uses: "actions/checkout@v7" }, { ...guardStep, if: "${{ inputs.x }}" }])) > 0, "a conditional check is a finding");
  expect(count(wf([{ uses: "actions/checkout@v7" }, { ...guardStep, "continue-on-error": true }])) > 0, "a check that may fail softly is a finding");
  expect(count(wf(good, { "continue-on-error": true })) > 0, "a soft-failing job is a finding");
  expect(count(wf([...good, { name: "summary", if: "always()", run: "z" }])) > 0, "an unlisted always() step is a finding");
  expect(count(wf([...good, { name: "summary", if: "always() || steps.gate.outputs.ok == 'true'", run: "z" }])) > 0, "an || that lets a step run after refusal is a finding");
  expect(count(wf([...good, { name: "summary", if: "always() && steps.gate.outputs.ok == ''", run: "z" }])) > 0, "an empty-output condition (true after a refusal) is a finding");
  expect(count(wf([...good, { name: "skipped", if: "!cancelled() && steps.gate.outcome == 'skipped'", run: "z" }])) > 0, "a skipped-outcome condition is a finding");
  const withListed = parseAllowlist(JSON.stringify({ ...allowDoc, reporting_steps: { "t.yml::deploy": ["summary"] } }));
  expect(verifyWorkflow("t.yml", wf([...good, { name: "summary", if: "always()", run: "z" }]), withListed).findings.length === 0, "a listed reporting step is accepted");
  const dyn = { jobs: { probe: { environment: "${{ inputs.target }}", steps: [{ uses: "actions/checkout@v7" }, guardStep] } } };
  expect(count(dyn) > 0, "a run-time environment not passed to the check is a finding");
  dyn.jobs.probe.steps[1] = { ...guardStep, with: { environment: "${{ inputs.target }}" } };
  expect(count(dyn) === 0, "a run-time environment passed to the check is accepted");
  const fixedWithEnv = wf([{ uses: "actions/checkout@v7" }, { ...guardStep, with: { environment: "staging" } }]);
  expect(count(fixedWithEnv) > 0, "a fixed protected job that passes an environment is a finding");
  expect(count({ jobs: { deploy: { environment: "production", uses: "./.github/workflows/x.yml" } } }) > 0, "a protected reusable-workflow call is a finding");
  expect(count({ jobs: { other: { environment: "staging", steps: [{ run: "x" }] } } }) === 0, "an unprotected job needs no check");
  const wfAllow = parseAllowlist(JSON.stringify({ ...allowDoc, protected_workflows: [".github/workflows/t.yml"] }));
  const noEnv = { jobs: { push: { steps: [{ uses: "actions/checkout@v7" }, { run: "docker push" }] } } };
  expect(verifyWorkflow(".github/workflows/t.yml", noEnv, wfAllow).findings.length > 0, "a job without an environment in a protected workflow needs the check");
  expect(verifyWorkflow(".github/workflows/other.yml", noEnv, wfAllow).findings.length === 0, "the same job in an unlisted workflow does not");
  const noEnvOk = { jobs: { push: { steps: [{ uses: "actions/checkout@v7" }, guardStep, { run: "docker push" }] } } };
  expect(verifyWorkflow(".github/workflows/t.yml", noEnvOk, wfAllow).findings.length === 0, "a guarded job without an environment in a protected workflow passes");
  const noEnvWithInput = { jobs: { push: { steps: [{ uses: "actions/checkout@v7" }, { ...guardStep, with: { environment: "staging" } }] } } };
  expect(verifyWorkflow(".github/workflows/t.yml", noEnvWithInput, wfAllow).findings.length > 0, "a job without an environment must not name one to the check");
  expect(parseAllowlist(JSON.stringify({ ...allowDoc, protected_workflows: ["deploy.yml"] })).error !== undefined, "protected_workflows entries must be .github/workflows paths");
  expect(count(wf([...good, { name: "privileged", if: "${{ !success() }}", run: "z" }])) > 0, "a !success() step (runs after a refusal) is a finding");
  expect(count(wf([...good, { name: "privileged", if: "success() || always()", run: "z" }])) > 0, "success() joined by || is a finding");
  expect(count(wf([...good, { name: "fine", if: "success() && inputs.x == 'y'", run: "z" }])) === 0, "a bare top-level success() keeps the implicit default");
  const sparseMissing = wf([{ uses: "actions/checkout@v7", with: { "sparse-checkout": "scripts/other.mjs", "sparse-checkout-cone-mode": false } }, guardStep]);
  expect(count(sparseMissing) > 0, "a sparse checkout that omits the check's files is a finding");
  const sparseCone = wf([{ uses: "actions/checkout@v7", with: { "sparse-checkout": GUARD_FILES.join("\n") } }, guardStep]);
  expect(count(sparseCone) > 0, "a file-list sparse checkout in cone mode is a finding");
  const sparseOk = wf([{ uses: "actions/checkout@v7", with: { "sparse-checkout": GUARD_FILES.join("\n"), "sparse-checkout-cone-mode": false } }, guardStep]);
  expect(count(sparseOk) === 0, "a sparse checkout carrying the check's files is accepted");
  const nestedRoot = wf([{ uses: "actions/checkout@v7", with: { path: "atlasent-api" } }, guardStep]);
  expect(count(nestedRoot) > 0, "a nested checkout with the check loaded from the root is a finding");
  const nestedOk = wf([{ uses: "actions/checkout@v7", with: { path: "atlasent-api" } }, { ...guardStep, uses: "./atlasent-api/.github/actions/production-dispatcher-check" }]);
  expect(count(nestedOk) === 0, "the check loaded from the nested checkout's path is accepted");
  const otherRepo = wf([{ uses: "actions/checkout@v7", with: { repository: "someone/else" } }, guardStep]);
  expect(count(otherRepo) > 0, "a checkout of another repository does not carry the check");
  expect(count(wf([guardStep])) > 0, "no checkout at all is a finding");
  const runtimeRef = wf([{ uses: "actions/checkout@v7", with: { ref: "${{ inputs.ref }}" } }, guardStep]);
  expect(count(runtimeRef) > 0, "a checkout of a ref chosen at run time cannot provide the allowlist");
  const ownRef = wf([{ uses: "actions/checkout@v7", with: { ref: "${{ github.sha }}" } }, guardStep]);
  expect(count(ownRef) === 0, "a checkout of the workflow's own commit can");
  const separate = wf([
    { uses: "actions/checkout@v7", with: { ref: "${{ inputs.ref }}" } },
    { uses: "actions/checkout@v7", with: { path: ".dispatcher-guard", "sparse-checkout": GUARD_FILES.join("\n"), "sparse-checkout-cone-mode": false } },
    { ...guardStep, uses: "./.dispatcher-guard/.github/actions/production-dispatcher-check" },
  ]);
  expect(count(separate) === 0, "a separate default-ref checkout of the check beside a run-time ref is accepted");
  const dotStripped = wf([{ uses: "actions/checkout@v7", with: { path: "dispatcher-guard" } }, { ...guardStep, uses: "./.dispatcher-guard/.github/actions/production-dispatcher-check" }]);
  expect(count(dotStripped) > 0, "a checkout at dispatcher-guard does not stand in for one at .dispatcher-guard");
  expect(count({ jobs: { deploy: { environment: "PRODUCTION", steps: [{ run: "x" }] } } }) > 0, "a differently cased protected environment is still protected");

  console.log("real workflow files:");
  const real = await verifyTree(".");
  expect(real.findings.length === 0, `the real tree is clean (${real.protectedJobs.length} protected jobs)${real.findings.length ? `: ${real.findings.join("; ")}` : ""}`);
  expect(real.protectedJobs.length > 0, "the real scan set is non-empty");
  const realAllow = parseAllowlist(fs.readFileSync(ALLOWLIST_PATH, "utf8"));
  let mutated = 0;
  for (const key of real.protectedJobs) {
    const [file, jobName] = key.split("::");
    const doc = load(fs.readFileSync(file, "utf8"));
    const steps = doc.jobs[jobName].steps;
    const gi = steps.findIndex((s) => guardRoot(s?.uses) !== null);
    const removed = structuredClone(doc);
    removed.jobs[jobName].steps.splice(gi, 1);
    expect(verifyWorkflow(file, removed, realAllow).findings.length > 0, `${key}: removing the check is caught`);
    const moved = structuredClone(doc);
    const [g] = moved.jobs[jobName].steps.splice(gi, 1);
    moved.jobs[jobName].steps.push(g);
    if (moved.jobs[jobName].steps.length > gi + 1) {
      expect(verifyWorkflow(file, moved, realAllow).findings.length > 0, `${key}: moving the check last is caught`);
    }
    const co = doc.jobs[jobName].steps.slice(0, gi).filter((s) => isCheckout(s) && s.with?.["sparse-checkout"]);
    if (co.length) {
      const stripped = structuredClone(doc);
      for (const s of stripped.jobs[jobName].steps.slice(0, gi)) {
        // Keep the list non-empty: an empty sparse-checkout is a full checkout,
        // which would carry the files and make this mutant valid.
        if (isCheckout(s) && s.with?.["sparse-checkout"]) s.with["sparse-checkout"] = [...String(s.with["sparse-checkout"]).split("\n").filter((l) => l.trim() && !GUARD_FILES.includes(l.trim())), "scripts/unrelated-file.mjs"].join("\n");
      }
      expect(verifyWorkflow(file, stripped, realAllow).findings.length > 0, `${key}: dropping the check's files from its sparse checkout is caught`);
    }
    const softened = structuredClone(doc);
    softened.jobs[jobName].steps.push({ name: "planted always() step", if: "always()", run: "true" });
    expect(verifyWorkflow(file, softened, realAllow).findings.length > 0, `${key}: a planted always() step is caught`);
    mutated++;
  }
  expect(mutated === real.protectedJobs.length, `every protected job was mutated (${mutated})`);
  const emptied = parseAllowlist(JSON.stringify({ ...allowDoc, protected_environments: ["no-such-environment"] }));
  expect(emptied.error === undefined, "a valid allowlist naming an unused environment parses");

  if (failures) {
    console.log(`\n${failures} self-test assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nself-test passed.");
}

// ── main ───────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const mode = process.argv[2];
  if (mode === "--enforce") await enforce();
  else if (mode === "--self-test") await selfTest();
  else if (mode === "--verify-workflows") {
    const r = await verifyTree(".");
    if (r.findings.length) {
      for (const f of r.findings) console.log(`::error title=production-dispatcher-guard::${f}`);
      console.log(`\n${r.findings.length} finding(s) across ${r.protectedJobs.length} protected job(s).`);
      process.exit(1);
    }
    console.log(`OK — ${r.protectedJobs.length} protected job(s), each runs the dispatcher check first:\n  ${r.protectedJobs.join("\n  ")}`);
  } else {
    console.error("usage: check-production-dispatcher.mjs --enforce | --verify-workflows | --self-test");
    process.exit(2);
  }
}
