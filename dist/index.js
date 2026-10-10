"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// packages/enforce/dist/transport.js
var require_transport = __commonJS({
  "packages/enforce/dist/transport.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.post = post;
    exports2.get = get;
    var node_https_1 = __importDefault(require("node:https"));
    var node_http_1 = __importDefault(require("node:http"));
    function post(url, body, headers) {
      return new Promise((resolve4, reject) => {
        const parsed = new URL(url);
        const transport = parsed.protocol === "https:" ? node_https_1.default : node_http_1.default;
        const req = transport.request({
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            ...headers
          },
          timeout: 3e4
        }, (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => resolve4({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf-8") }));
          res.on("error", reject);
        });
        req.on("error", reject);
        req.on("timeout", () => {
          req.destroy();
          reject(new Error("Request timed out after 30s"));
        });
        req.write(body);
        req.end();
      });
    }
    function get(url, headers) {
      return new Promise((resolve4, reject) => {
        const parsed = new URL(url);
        const transport = parsed.protocol === "https:" ? node_https_1.default : node_http_1.default;
        const req = transport.request({
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: "GET",
          headers,
          timeout: 3e4
        }, (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => resolve4({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf-8") }));
          res.on("error", reject);
        });
        req.on("error", reject);
        req.on("timeout", () => {
          req.destroy();
          reject(new Error("Request timed out after 30s"));
        });
        req.end();
      });
    }
  }
});

// packages/enforce/dist/functionRegion.js
var require_functionRegion = __commonJS({
  "packages/enforce/dist/functionRegion.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.FunctionRegionConfigError = exports2.SUPPORTED_FUNCTION_REGIONS = exports2.HOSTED_RUNTIME_HOSTS = exports2.DEFAULT_FUNCTION_REGION = exports2.FUNCTION_REGION_ENV = exports2.FUNCTION_REGION_HEADER = void 0;
    exports2.parseFunctionRegion = parseFunctionRegion2;
    exports2.resolveFunctionRegion = resolveFunctionRegion;
    exports2.functionRegionHeaders = functionRegionHeaders12;
    exports2.FUNCTION_REGION_HEADER = "x-region";
    exports2.FUNCTION_REGION_ENV = "ATLASENT_FUNCTION_REGION";
    exports2.DEFAULT_FUNCTION_REGION = "us-west-1";
    exports2.HOSTED_RUNTIME_HOSTS = /* @__PURE__ */ new Set([
      "api.atlasent.io",
      "kttccumlnmdtupgbyfue.supabase.co",
      "lwnqpmnxpeyhpxvastku.supabase.co"
    ]);
    exports2.SUPPORTED_FUNCTION_REGIONS = /* @__PURE__ */ new Set([
      "ap-northeast-1",
      "ap-northeast-2",
      "ap-south-1",
      "ap-southeast-1",
      "ap-southeast-2",
      "ca-central-1",
      "us-east-1",
      "us-west-1",
      "us-west-2",
      "eu-central-1",
      "eu-west-1",
      "eu-west-2",
      "eu-west-3",
      "sa-east-1"
    ]);
    var FunctionRegionConfigError = class extends Error {
      constructor(value) {
        super(`Invalid function region "${value}": expected a supported region such as "${exports2.DEFAULT_FUNCTION_REGION}", or "auto" to let Supabase choose.`);
        this.name = "FunctionRegionConfigError";
      }
    };
    exports2.FunctionRegionConfigError = FunctionRegionConfigError;
    function parseFunctionRegion2(value) {
      const v = value.trim();
      if (v === "auto")
        return null;
      if (exports2.SUPPORTED_FUNCTION_REGIONS.has(v))
        return v;
      throw new FunctionRegionConfigError(value);
    }
    function isHostedRuntime(url) {
      try {
        return exports2.HOSTED_RUNTIME_HOSTS.has(new URL(url).hostname.toLowerCase());
      } catch {
        return false;
      }
    }
    function resolveFunctionRegion(url, explicit, env = process.env) {
      if (explicit === null)
        return null;
      if (explicit !== void 0 && explicit.trim() !== "")
        return parseFunctionRegion2(explicit);
      const fromEnv = env[exports2.FUNCTION_REGION_ENV];
      if (fromEnv !== void 0 && fromEnv.trim() !== "")
        return parseFunctionRegion2(fromEnv);
      return isHostedRuntime(url) ? exports2.DEFAULT_FUNCTION_REGION : null;
    }
    function functionRegionHeaders12(url, explicit, env = process.env) {
      const region = resolveFunctionRegion(url, explicit, env);
      return region ? { [exports2.FUNCTION_REGION_HEADER]: region } : {};
    }
  }
});

// packages/enforce/dist/index.js
var require_dist = __commonJS({
  "packages/enforce/dist/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.resolveFunctionRegion = exports2.parseFunctionRegion = exports2.functionRegionHeaders = exports2.HOSTED_RUNTIME_HOSTS = exports2.FunctionRegionConfigError = exports2.FUNCTION_REGION_HEADER = exports2.FUNCTION_REGION_ENV = exports2.DEFAULT_FUNCTION_REGION = exports2.CLOUD_LOCUS_CONTEXT_KEYS = exports2.EnforceError = void 0;
    exports2.evaluate = evaluate2;
    exports2.denyReasonText = denyReasonText2;
    exports2.verify = verify2;
    exports2.waitForApprovalResolution = waitForApprovalResolution3;
    exports2.requiredBindingsFor = requiredBindingsFor4;
    exports2.verifyPermit = verifyPermit4;
    exports2.reverifyPermit = reverifyPermit2;
    exports2.enforce = enforce2;
    var transport_1 = require_transport();
    var functionRegion_1 = require_functionRegion();
    var DEFAULT_API_URL = "https://api.atlasent.io";
    function runtimeHeaders(config, url) {
      return {
        Authorization: `Bearer ${config.apiKey}`,
        ...(0, functionRegion_1.functionRegionHeaders)(url, config.functionRegion)
      };
    }
    var EnforceError2 = class extends Error {
      phase;
      decision;
      /** Coarse verify outcome (verified | mismatch | expired | replay_blocked | invalid | …). */
      outcome;
      /** Precise verify wire code, when the failure came from verify-permit. */
      verifyErrorCode;
      mismatchFields;
      constructor(message, phase, decision = null, details) {
        super(message);
        this.name = "EnforceError";
        this.phase = phase;
        this.decision = decision;
        this.outcome = details?.outcome;
        this.verifyErrorCode = details?.verifyErrorCode;
        this.mismatchFields = details?.mismatchFields;
      }
    };
    exports2.EnforceError = EnforceError2;
    async function evaluate2(config) {
      const apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
      const rawContext = { ...config.context };
      const contextSnapshot = rawContext["state_snapshot"];
      delete rawContext["state_snapshot"];
      const payload = {
        action_type: config.action,
        actor_id: config.actor,
        context: {
          // Keep environment in context for backward compat with older control plane versions.
          ...config.environment ? { environment: config.environment } : {},
          ...config.targetId ? { target_id: config.targetId } : {},
          ...rawContext
        }
      };
      if (config.actorIdentity != null)
        payload["actor_identity"] = config.actorIdentity;
      if (config.environment != null)
        payload["environment"] = config.environment;
      if (config.resource != null)
        payload["resource"] = config.resource;
      else if (config.targetId)
        payload["target_id"] = config.targetId;
      if (config.current_state != null)
        payload["current_state"] = config.current_state;
      if (config.proposed_state != null)
        payload["proposed_state"] = config.proposed_state;
      if (config.execution_binding != null)
        payload["execution_binding"] = config.execution_binding;
      const snap = config.state_snapshot ?? contextSnapshot;
      if (snap != null)
        payload["state_snapshot"] = snap;
      if (config.changePlan != null)
        payload["change_plan"] = config.changePlan;
      if (config.evidenceProfile != null)
        payload["evidence_profile"] = config.evidenceProfile;
      if (config.quorum != null)
        payload["quorum"] = config.quorum;
      if (config.approval != null)
        payload["approval"] = config.approval;
      if (config.executionPayloadHash != null) {
        payload["execution_payload_hash"] = config.executionPayloadHash;
      }
      let status;
      let body;
      try {
        ({ status, body } = await (0, transport_1.post)(`${apiUrl}/v1-evaluate`, JSON.stringify(payload), runtimeHeaders(config, apiUrl)));
      } catch (err) {
        throw new EnforceError2(`AtlaSent API unreachable: ${err instanceof Error ? err.message : String(err)}`, "evaluate");
      }
      if (status >= 500) {
        throw new EnforceError2(`Infrastructure failure (HTTP ${status})`, "evaluate");
      }
      if (status === 401 || status === 403) {
        throw new EnforceError2(`Authentication failed (HTTP ${status})`, "evaluate");
      }
      if (status === 429) {
        throw new EnforceError2("Rate limited (HTTP 429)", "evaluate");
      }
      if (status < 200 || status >= 300) {
        throw new EnforceError2(`Unexpected response (HTTP ${status})`, "evaluate");
      }
      let raw;
      try {
        raw = JSON.parse(body);
      } catch {
        throw new EnforceError2("Non-JSON response from AtlaSent API", "evaluate");
      }
      const decision = mapDecision(raw);
      if (decision.decision === "deny" && decision.denyCode === "INSUFFICIENT_APPROVALS" && config.onInsufficientApprovals && raw["signing_hint"] != null && typeof raw["signing_hint"] === "object") {
        const hint = raw["signing_hint"];
        let quorum;
        try {
          quorum = await config.onInsufficientApprovals(hint, decision.evaluationId);
        } catch {
          quorum = void 0;
        }
        if (quorum) {
          return evaluate2({ ...config, quorum, onInsufficientApprovals: void 0 });
        }
      }
      return decision;
    }
    function denyReasonText2(decision) {
      if (decision?.denyReason)
        return decision.denyReason;
      if (decision?.denyCode) {
        return `${decision.denyCode} (the runtime withholds the reason text for this deny code)`;
      }
      return "no reason provided";
    }
    function verify2(decision) {
      switch (decision.decision) {
        case "allow":
          return;
        case "deny":
          throw new EnforceError2(`Denied: ${denyReasonText2(decision)}`, "verify", decision);
        case "hold":
          throw new EnforceError2(`On hold: ${decision.holdReason ?? "awaiting approval"}`, "verify", decision);
        case "escalate":
          throw new EnforceError2("Escalated \u2014 manual review required", "verify", decision);
        default:
          throw new EnforceError2(`Unknown decision: ${String(decision.decision)}`, "verify", decision);
      }
    }
    var APPROVAL_POLL_INTERVAL_MS = 5e3;
    var CLAIMABLE_APPROVAL_STATUSES = /* @__PURE__ */ new Set(["approved", "approved_awaiting_claim"]);
    function sleep(ms) {
      return new Promise((resolve4) => setTimeout(resolve4, ms));
    }
    async function claimApprovalPermit(config, apiUrl, row) {
      const url = `${apiUrl}/v1/approvals/${encodeURIComponent(config.approvalId)}/claim-permit`;
      let requestBody = "{}";
      if (config.buildClaimBody) {
        let built;
        try {
          built = await config.buildClaimBody(row);
        } catch (err) {
          throw new EnforceError2(`Approval claim refused before sending: could not build the claim body (${err instanceof Error ? err.message : String(err)}) \u2014 failing closed`, "evaluate");
        }
        requestBody = JSON.stringify(built);
      }
      let status;
      let body;
      try {
        ({ status, body } = await (0, transport_1.post)(url, requestBody, runtimeHeaders(config, url)));
      } catch {
        return { claimFailure: "unreachable" };
      }
      let raw;
      try {
        const parsed = JSON.parse(body);
        raw = parsed && typeof parsed === "object" ? parsed : void 0;
      } catch {
        raw = void 0;
      }
      if (status !== 200) {
        const code = raw && typeof raw["error"] === "string" ? raw["error"] : `HTTP ${status}`;
        return { claimFailure: code };
      }
      if (!raw)
        return { claimFailure: "malformed_response" };
      const reEvaluationDecision = typeof raw["re_evaluation_decision"] === "string" ? raw["re_evaluation_decision"] : void 0;
      const permitToken = raw["permit_token"];
      if (raw["claimed"] !== true || typeof permitToken !== "string" || permitToken.length === 0) {
        return { claimFailure: "not_claimed", reEvaluationDecision };
      }
      const hash = raw["execution_hash_expected"];
      const reEvaluationId = raw["re_evaluation_id"];
      return {
        permitToken,
        reEvaluationDecision,
        executionHashExpected: typeof hash === "string" && hash.length > 0 ? hash : void 0,
        reEvaluationId: typeof reEvaluationId === "string" && reEvaluationId.length > 0 ? reEvaluationId : void 0
      };
    }
    async function waitForApprovalResolution3(config) {
      if (!config.approvalId) {
        throw new EnforceError2("Cannot wait for approval: no approvalRequestId on the hold/escalate decision", "evaluate");
      }
      const apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
      const url = `${apiUrl}/v1/approvals/${encodeURIComponent(config.approvalId)}`;
      const deadline = Date.now() + config.maxWaitMs;
      while (Date.now() < deadline) {
        let status;
        let body;
        try {
          ({ status, body } = await (0, transport_1.get)(url, runtimeHeaders(config, url)));
        } catch {
          await sleep(APPROVAL_POLL_INTERVAL_MS);
          continue;
        }
        if (status === 401 || status === 403) {
          throw new EnforceError2(`Approval status poll: authentication failed (HTTP ${status})`, "evaluate");
        }
        if (status === 404) {
          throw new EnforceError2("Approval status poll: approval request not found", "evaluate");
        }
        if (status === 200) {
          let raw;
          try {
            raw = JSON.parse(body);
          } catch {
            await sleep(APPROVAL_POLL_INTERVAL_MS);
            continue;
          }
          const rowStatus = raw["status"];
          if (rowStatus && rowStatus !== "pending") {
            const polledReEvaluationDecision = raw["re_evaluation_decision"];
            if (!CLAIMABLE_APPROVAL_STATUSES.has(rowStatus)) {
              return { status: rowStatus, reEvaluationDecision: polledReEvaluationDecision };
            }
            const claimEnvironment = typeof raw["claim_environment"] === "string" ? raw["claim_environment"] : void 0;
            const claim = await claimApprovalPermit(config, apiUrl, { status: rowStatus, claimEnvironment });
            return {
              status: rowStatus,
              reEvaluationDecision: claim.reEvaluationDecision ?? polledReEvaluationDecision,
              permitToken: claim.permitToken,
              ...claim.executionHashExpected ? { executionHashExpected: claim.executionHashExpected } : {},
              ...claim.reEvaluationId ? { reEvaluationId: claim.reEvaluationId } : {},
              ...claim.claimFailure ? { claimFailure: claim.claimFailure } : {}
            };
          }
        }
        await sleep(APPROVAL_POLL_INTERVAL_MS);
      }
      throw new EnforceError2(`Approval wait timed out after ${config.maxWaitMs}ms with no human resolution \u2014 failing closed`, "evaluate");
    }
    exports2.CLOUD_LOCUS_CONTEXT_KEYS = ["aws", "azure"];
    async function postVerify(config, permitToken, decision) {
      const apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
      const bodyObj = {
        permit_token: permitToken,
        action_type: config.action,
        actor_id: config.actor
      };
      if (config.environment != null)
        bodyObj["environment"] = config.environment;
      if (config.targetId != null)
        bodyObj["target_id"] = config.targetId;
      if (config.actorIdentity != null)
        bodyObj["actor_identity"] = config.actorIdentity;
      const payloadHash = decision?.executionHashExpected ?? config.executionPayloadHash;
      if (payloadHash != null)
        bodyObj["payload_hash"] = payloadHash;
      const locus = {};
      for (const key of exports2.CLOUD_LOCUS_CONTEXT_KEYS) {
        const value = config.context?.[key];
        if (value != null)
          locus[key] = value;
      }
      if (Object.keys(locus).length > 0)
        bodyObj["context"] = locus;
      const missing = (config.requiredBindings ?? []).filter((b) => bodyObj[b] == null || bodyObj[b] === "");
      if (missing.length > 0) {
        throw new EnforceError2(`verify-permit refused: required binding(s) absent: ${missing.join(", ")}`, "verify-permit", decision, { outcome: "invalid", verifyErrorCode: "MISSING_BINDING" });
      }
      let status;
      let body;
      try {
        ({ status, body } = await (0, transport_1.post)(`${apiUrl}/v1-verify-permit`, JSON.stringify(bodyObj), runtimeHeaders(config, apiUrl)));
      } catch (err) {
        throw new EnforceError2(`verify-permit unreachable: ${err instanceof Error ? err.message : String(err)}`, "verify-permit", decision);
      }
      if (status >= 500) {
        throw new EnforceError2(`verify-permit infrastructure failure (HTTP ${status})`, "verify-permit", decision);
      }
      if (status < 200 || status >= 300) {
        throw new EnforceError2(`verify-permit failed (HTTP ${status})`, "verify-permit", decision);
      }
      let raw;
      try {
        raw = JSON.parse(body);
      } catch {
        throw new EnforceError2("Non-JSON response from verify-permit", "verify-permit", decision);
      }
      const ok = raw.valid ?? raw.verified;
      return {
        verified: ok === true,
        outcome: raw.outcome,
        auditHash: raw.audit_entry_hash,
        verifyAuditHash: raw.verify_audit_hash,
        verifyErrorCode: raw.verify_error_code,
        mismatchFields: Array.isArray(raw.mismatch_fields) ? raw.mismatch_fields : void 0
      };
    }
    function requiredBindingsFor4(b) {
      const r = [];
      if (b.environment != null && b.environment !== "")
        r.push("environment");
      if (b.targetId != null && b.targetId !== "")
        r.push("target_id");
      if (b.executionPayloadHash != null && b.executionPayloadHash !== "")
        r.push("payload_hash");
      return r;
    }
    async function verifyPermit4(config, decision) {
      if (!decision.permitToken) {
        throw new EnforceError2("evaluate returned allow but no permit_token \u2014 refusing to execute without verifiable permit", "verify-permit", decision);
      }
      const r = await postVerify(config, decision.permitToken, decision);
      if (!r.verified) {
        throw new EnforceError2(`Permit verification failed (outcome=${r.outcome ?? "unknown"}${r.verifyErrorCode ? `, code=${r.verifyErrorCode}` : ""})`, "verify-permit", decision, { outcome: r.outcome, verifyErrorCode: r.verifyErrorCode, mismatchFields: r.mismatchFields });
      }
      return r;
    }
    async function reverifyPermit2(config, permitToken) {
      if (!permitToken || !permitToken.trim()) {
        throw new EnforceError2("no permit_token presented at execution boundary \u2014 refusing to execute", "verify-permit", null, { outcome: "invalid", verifyErrorCode: "MISSING_PERMIT" });
      }
      const r = await postVerify(config, permitToken, null);
      if (!r.verified) {
        throw new EnforceError2(`Permit re-verification failed at execution boundary (outcome=${r.outcome ?? "unknown"}${r.verifyErrorCode ? `, code=${r.verifyErrorCode}` : ""})`, "verify-permit", null, { outcome: r.outcome, verifyErrorCode: r.verifyErrorCode, mismatchFields: r.mismatchFields });
      }
      return r;
    }
    async function enforce2(config, fn) {
      const decision = await evaluate2(config);
      verify2(decision);
      const vp = await verifyPermit4(config, decision);
      const result = await fn();
      return { result, decision, verifyOutcome: vp.outcome };
    }
    function mapDecision(raw) {
      return {
        decision: raw["decision"],
        // The real /v1-evaluate response field is `request_id` (see
        // v1-evaluate/handler.ts's `return json({ ..., request_id: effectiveRequestId, ... })`
        // — confirmed by direct source read; `evaluation_id` is never a key on the
        // HTTP response body, only an internal DB column name on approval_requests
        // and similar tables). Reading only `evaluation_id` left Decision.evaluationId
        // permanently undefined for every real evaluate call (#130). `evaluation_id`
        // is kept as a fallback in case an older or alternate response shape ever
        // emits it, same defensive-dual-name pattern this function already uses for
        // auditHash below.
        evaluationId: raw["request_id"] ?? raw["evaluation_id"],
        permitToken: raw["permit_token"],
        proofHash: raw["proof_hash"],
        executionHashExpected: raw["execution_hash_expected"] ?? raw["payload_hash"],
        riskScore: extractRiskScore(raw),
        denyReason: raw["deny_reason"],
        denyCode: raw["deny_code"],
        remediation: raw["remediation"],
        holdReason: raw["hold_reason"],
        risk_class: raw["risk_class"],
        authority_basis: raw["authority_basis"],
        escalation_id: raw["escalation_id"],
        approvalRequestId: raw["approval_request_id"],
        chainEntry: raw["chain_entry"] ?? null,
        snapshot: raw["snapshot"] ?? null,
        // Real wire field is `audit_entry_hash` (see v1-evaluate/handler.ts and
        // v1-verify-permit/handler.ts). `audit_hash` is accepted too in case an
        // older API build still emits it, but it does not exist on the current
        // response shape — reading only that name left the `audit-hash` action
        // output permanently empty.
        auditHash: raw["audit_entry_hash"] ?? raw["audit_hash"]
      };
    }
    function extractRiskScore(raw) {
      const risk = raw["risk"];
      if (risk && typeof risk === "object" && "score" in risk) {
        const score = risk.score;
        if (typeof score === "number")
          return score;
      }
      const flat = raw["risk_score"];
      if (typeof flat === "number")
        return flat;
      return void 0;
    }
    var functionRegion_2 = require_functionRegion();
    Object.defineProperty(exports2, "DEFAULT_FUNCTION_REGION", { enumerable: true, get: function() {
      return functionRegion_2.DEFAULT_FUNCTION_REGION;
    } });
    Object.defineProperty(exports2, "FUNCTION_REGION_ENV", { enumerable: true, get: function() {
      return functionRegion_2.FUNCTION_REGION_ENV;
    } });
    Object.defineProperty(exports2, "FUNCTION_REGION_HEADER", { enumerable: true, get: function() {
      return functionRegion_2.FUNCTION_REGION_HEADER;
    } });
    Object.defineProperty(exports2, "FunctionRegionConfigError", { enumerable: true, get: function() {
      return functionRegion_2.FunctionRegionConfigError;
    } });
    Object.defineProperty(exports2, "HOSTED_RUNTIME_HOSTS", { enumerable: true, get: function() {
      return functionRegion_2.HOSTED_RUNTIME_HOSTS;
    } });
    Object.defineProperty(exports2, "functionRegionHeaders", { enumerable: true, get: function() {
      return functionRegion_2.functionRegionHeaders;
    } });
    Object.defineProperty(exports2, "parseFunctionRegion", { enumerable: true, get: function() {
      return functionRegion_2.parseFunctionRegion;
    } });
    Object.defineProperty(exports2, "resolveFunctionRegion", { enumerable: true, get: function() {
      return functionRegion_2.resolveFunctionRegion;
    } });
  }
});

// src/index.ts
var src_exports = {};
__export(src_exports, {
  run: () => run
});
module.exports = __toCommonJS(src_exports);
var import_enforce14 = __toESM(require_dist());
var import_enforce15 = __toESM(require_dist());

// src/gate.ts
var GateInfraError = class extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = "GateInfraError";
  }
};

// src/v21.ts
var import_enforce5 = __toESM(require_dist());

// src/batch.ts
var import_enforce = __toESM(require_dist());

// src/canonicalAction.ts
var PRODUCTION_DEPLOY_ACTION = "production.deploy";
var INFRASTRUCTURE_CHANGE_ACTION = "infrastructure.change";
var PRODUCTION_ROLLBACK_ACTION = "production.rollback";
var SECRET_CONFIGURATION_CHANGE_ACTION = "secret.configuration.change";
var PACKAGE_RELEASE_ACTION = "package.release";
var TRIAL_BLINDING_SETUP_ACTION = "trial.blinding.setup";
var TRIAL_UNBLINDING_EXECUTE_ACTION = "trial.unblinding.execute";
var TRIAL_UNBLINDING_EMERGENCY_ACTION = "trial.unblinding.emergency";
var TRUST_ROOT_PUBLISH_ACTION = "trust_root.publish";
var RECONCILIATION_CERTIFY_ACTION = "reconciliation.certify";
var COMMUNICATION_EXTERNAL_SEND_ACTION = "communication.external.send";
var LEGACY_PRODUCTION_DEPLOY_ALIAS = "deployment.production";
var ARTIFACT_RELEASE_ACTION = "artifact.release";
var GATE_PERMITTED_ACTIONS = /* @__PURE__ */ new Set([
  PRODUCTION_DEPLOY_ACTION,
  INFRASTRUCTURE_CHANGE_ACTION,
  PRODUCTION_ROLLBACK_ACTION,
  SECRET_CONFIGURATION_CHANGE_ACTION,
  PACKAGE_RELEASE_ACTION,
  ARTIFACT_RELEASE_ACTION,
  TRIAL_BLINDING_SETUP_ACTION,
  TRIAL_UNBLINDING_EXECUTE_ACTION,
  TRIAL_UNBLINDING_EMERGENCY_ACTION,
  TRUST_ROOT_PUBLISH_ACTION,
  RECONCILIATION_CERTIFY_ACTION,
  COMMUNICATION_EXTERNAL_SEND_ACTION
]);
var MANDATORY_CHANGE_CONTROL_ACTIONS = /* @__PURE__ */ new Set([
  PRODUCTION_DEPLOY_ACTION,
  INFRASTRUCTURE_CHANGE_ACTION,
  PRODUCTION_ROLLBACK_ACTION,
  SECRET_CONFIGURATION_CHANGE_ACTION
]);
var OPTIONAL_VERIFIED_ACTOR_ACTIONS = /* @__PURE__ */ new Set([
  PACKAGE_RELEASE_ACTION
]);
var VERIFIED_ACTOR_REQUIRED_ACTIONS = /* @__PURE__ */ new Set([
  ARTIFACT_RELEASE_ACTION
]);
var SUPPLY_CHAIN_ASSERTION_ACTIONS = /* @__PURE__ */ new Set([
  ARTIFACT_RELEASE_ACTION
]);
function normalizeProtectedAction(raw) {
  if (raw === LEGACY_PRODUCTION_DEPLOY_ALIAS) {
    return { canonical: PRODUCTION_DEPLOY_ACTION, wasLegacyAlias: true };
  }
  return { canonical: raw, wasLegacyAlias: false };
}
var ACTION_TYPE_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){1,3}$/;
function isValidActionType(raw) {
  return ACTION_TYPE_PATTERN.test(raw);
}
function assertValidActionType(raw) {
  const { canonical } = normalizeProtectedAction(raw);
  if (!isValidActionType(canonical)) {
    throw new Error(
      `Invalid action type "${raw}". Expected dot-separated lowercase identifiers, 2\u20134 segments (e.g. "production.deploy", "database.migration.apply").`
    );
  }
}

// src/batch.ts
function readTrustedGithubState() {
  return {
    repository: process.env["GITHUB_REPOSITORY"] ?? "",
    ref: process.env["GITHUB_REF"] ?? "",
    sha: process.env["GITHUB_SHA"] ?? "",
    workflow: process.env["GITHUB_WORKFLOW"] ?? "",
    run_id: process.env["GITHUB_RUN_ID"] ?? "",
    run_number: process.env["GITHUB_RUN_NUMBER"] ?? "",
    event_name: process.env["GITHUB_EVENT_NAME"] ?? ""
  };
}
function bindTrustedStateSnapshot(items) {
  if (!items.some((item) => item.action === PRODUCTION_DEPLOY_ACTION)) {
    return items;
  }
  const state = readTrustedGithubState();
  return items.map((item) => {
    if (item.action !== PRODUCTION_DEPLOY_ACTION) {
      return item;
    }
    const { state_snapshot: _discardedTopLevelSnapshot, context, ...rest } = item;
    const safeContext = { ...context ?? {} };
    delete safeContext["state_snapshot"];
    return {
      ...rest,
      context: {
        ...safeContext,
        // Trusted fields always win over whatever the caller's `context`
        // claimed for these keys — a batch item asserting a wrong
        // repository or wrong ref must never survive past this point.
        repository: state.repository,
        ref: state.ref,
        sha: state.sha,
        workflow: state.workflow,
        run_id: state.run_id,
        run_number: state.run_number,
        event_name: state.event_name
      },
      state_snapshot: {
        source: "github-actions",
        complete: true,
        run_id: state.run_id
      }
    };
  });
}
async function evaluateMany(apiUrl, apiKey, rawItems) {
  const items = bindTrustedStateSnapshot(rawItems);
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
    ...(0, import_enforce.functionRegionHeaders)(apiUrl)
  };
  const { decisions, batchId } = await loopEvaluate(apiUrl, headers, items);
  const verified = await Promise.all(
    decisions.map(async (d, i) => {
      if (d.decision !== "allow" || !d.permitToken) {
        return { ...d, verified: d.decision === "allow" ? false : void 0 };
      }
      const item = items[i];
      const runtimeExecutionHash = d.executionHashExpected ?? d.execution_hash_expected;
      const enforceConfig = {
        apiKey,
        apiUrl,
        action: item.action,
        actor: item.actor,
        environment: item.environment,
        targetId: item.target_id,
        executionPayloadHash: runtimeExecutionHash ?? item.execution_payload_hash,
        requiredBindings: (0, import_enforce.requiredBindingsFor)({
          environment: item.environment,
          targetId: item.target_id,
          executionPayloadHash: runtimeExecutionHash ?? item.execution_payload_hash
        })
      };
      const enforceDecision = {
        decision: "allow",
        permitToken: d.permitToken,
        executionHashExpected: runtimeExecutionHash
      };
      const result = await (0, import_enforce.verifyPermit)(enforceConfig, enforceDecision);
      return { ...d, verified: result.verified, verifyOutcome: result.outcome };
    })
  );
  return { decisions: verified, batchId, items };
}
async function loopEvaluate(apiUrl, headers, items) {
  const decisions = [];
  for (const item of items) {
    const r = await fetch(`${apiUrl}/v1-evaluate`, {
      method: "POST",
      headers,
      body: JSON.stringify(item)
    });
    if (!r.ok) {
      throw new Error(`atlasent /v1-evaluate ${r.status}`);
    }
    decisions.push(await r.json());
  }
  return { decisions, batchId: `loop-${Date.now()}` };
}

// src/inputs.ts
function parseInputs(env) {
  const apiKey = required(env, "ATLASENT_API_KEY");
  const apiUrl = env["INPUT_API-URL"] || env["ATLASENT_BASE_URL"] || "https://api.atlasent.io/functions/v1";
  const failOnDeny = (env["INPUT_FAIL-ON-DENY"] || "true") === "true";
  const policySyncEnabled = (env["INPUT_POLICY-SYNC"] ?? "").toLowerCase() === "true";
  if (policySyncEnabled) {
    const bundlePath = (env["INPUT_POLICY-BUNDLE"] ?? "").trim();
    if (!bundlePath) {
      throw new Error("`policy-bundle` is required when `policy-sync` is 'true'");
    }
    const dryRun = (env["INPUT_POLICY-DRY-RUN"] ?? "true").toLowerCase() !== "false";
    return {
      apiKey,
      apiUrl,
      failOnDeny,
      policySync: {
        bundlePath,
        source: (env["INPUT_POLICY-SOURCE"] ?? "").trim() || void 0,
        dryRun
      }
    };
  }
  const evaluationsRaw = env["INPUT_EVALUATIONS"];
  if (evaluationsRaw && evaluationsRaw.trim()) {
    let parsed;
    try {
      parsed = JSON.parse(evaluationsRaw);
    } catch {
      throw new Error("`evaluations` is not valid JSON \u2014 expected a JSON array of evaluation requests");
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error(
        "`evaluations` must be a non-empty JSON array of evaluation requests"
      );
    }
    const evaluations = parsed;
    for (const item of evaluations) {
      assertValidActionType(item.action);
      item.action = normalizeProtectedAction(item.action).canonical;
    }
    return {
      apiKey,
      apiUrl,
      failOnDeny,
      evaluations,
      waitForId: env["INPUT_WAIT-FOR-ID"] || void 0,
      waitTimeoutMs: parseInt(env["INPUT_WAIT-TIMEOUT-MS"] || "600000", 10)
    };
  }
  const rawAction = required(env, "INPUT_ACTION");
  assertValidActionType(rawAction);
  const action = normalizeProtectedAction(rawAction).canonical;
  const actor = env["INPUT_ACTOR"] || env["GITHUB_ACTOR"] || "unknown";
  const environment = env["INPUT_ENVIRONMENT"];
  const contextRaw = env["INPUT_CONTEXT"] || "{}";
  let context = {};
  try {
    context = JSON.parse(contextRaw);
  } catch {
    throw new Error("`context` is not valid JSON \u2014 expected a JSON object");
  }
  return {
    apiKey,
    apiUrl,
    failOnDeny,
    single: { action, actor, environment, context },
    waitForId: env["INPUT_WAIT-FOR-ID"] || void 0,
    waitTimeoutMs: parseInt(env["INPUT_WAIT-TIMEOUT-MS"] || "600000", 10)
  };
}
function required(env, key) {
  const v = env[key];
  if (!v) {
    throw new Error(
      key === "ATLASENT_API_KEY" ? "Missing required secret: ATLASENT_API_KEY" : `Missing required input: ${key.replace("INPUT_", "").toLowerCase()}`
    );
  }
  return v;
}

// src/stream.ts
var import_enforce2 = __toESM(require_dist());
async function waitForTerminalDecision(opts) {
  const resolution = await (0, import_enforce2.waitForApprovalResolution)({
    apiKey: opts.apiKey,
    apiUrl: opts.apiUrl,
    approvalId: opts.evaluationId,
    maxWaitMs: opts.timeoutMs
  });
  if (resolution.status === "approved" && resolution.permitToken) {
    return {
      decision: "allow",
      permitToken: resolution.permitToken,
      evaluatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  return {
    decision: "deny",
    evaluatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// src/evidenceClient.ts
var import_enforce3 = __toESM(require_dist());
async function emitEvidenceEvent(cfg, event, log = console) {
  const url = `${cfg.apiUrl.replace(/\/$/, "")}${cfg.endpoint ?? "/v1-runtime-events"}`;
  const timeoutMs = cfg.timeoutMs ?? 5e3;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
        ...(0, import_enforce3.functionRegionHeaders)(url)
      },
      body: JSON.stringify(event),
      signal: controller.signal
    });
    if (res.status === 404) {
      log.info(
        `AtlaSent: runtime evidence endpoint not present at ${url} (skipping ${event.event_type})`
      );
      return;
    }
    if (!res.ok) {
      log.warning(
        `AtlaSent: evidence emit ${event.event_type} \u2192 HTTP ${res.status} (advisory; build not affected)`
      );
      return;
    }
    log.info(`AtlaSent: evidence event ${event.event_type} emitted`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warning(
      `AtlaSent: evidence emit failed (advisory; build not affected): ${msg}`
    );
  } finally {
    clearTimeout(timer);
  }
}

// src/workloadIdentity.ts
var import_node_crypto = require("node:crypto");
var import_enforce4 = __toESM(require_dist());
var GITHUB_ACTIONS_OIDC_AUDIENCE = "atlasent:actor_identity.v1";
var SUPPLY_CHAIN_OIDC_AUDIENCE = "atlasent:supply_chain.v1";
var WORKLOAD_IDENTITY_REQUEST_TIMEOUT_MS = 3e4;
var WorkloadIdentityError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkloadIdentityError";
  }
};
function responseDetail(body) {
  try {
    const parsed = JSON.parse(body);
    const message = parsed["message"] ?? parsed["error_description"] ?? parsed["error"];
    if (typeof message === "string" && message.trim())
      return message.trim().slice(0, 300);
  } catch {
  }
  return body.trim().slice(0, 300) || "empty response";
}
function isMissingBrokerMintScope(status, body) {
  if (status !== 403)
    return false;
  try {
    const parsed = JSON.parse(body);
    return parsed["error"] === "insufficient_scope" && typeof parsed["message"] === "string" && parsed["message"].includes("idp_broker:mint");
  } catch {
    return false;
  }
}
function apiKeyCredentialReference(apiKey) {
  return `sha256:${(0, import_node_crypto.createHash)("sha256").update(apiKey).digest("hex").slice(0, 16)}`;
}
async function requestGithubOidcToken(deps, audience = GITHUB_ACTIONS_OIDC_AUDIENCE) {
  const requestUrl = (deps.env["ACTIONS_ID_TOKEN_REQUEST_URL"] ?? "").trim();
  const requestToken = (deps.env["ACTIONS_ID_TOKEN_REQUEST_TOKEN"] ?? "").trim();
  if (!requestUrl || !requestToken) {
    throw new WorkloadIdentityError(
      "GitHub OIDC is unavailable. Grant this job `permissions: id-token: write`; this gate will not fall back to a caller-supplied actor or unverified provenance."
    );
  }
  deps.mask?.(requestToken);
  const url = new URL(requestUrl);
  url.searchParams.set("audience", audience);
  let response;
  try {
    response = await deps.fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${requestToken}`,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(WORKLOAD_IDENTITY_REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    throw new WorkloadIdentityError(
      `Could not obtain the GitHub OIDC token: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const body = await response.text();
  if (!response.ok) {
    throw new WorkloadIdentityError(
      `GitHub OIDC token request failed (HTTP ${response.status}): ${responseDetail(body)}`
    );
  }
  let token = "";
  try {
    const parsed = JSON.parse(body);
    token = typeof parsed["value"] === "string" ? parsed["value"] : "";
  } catch {
  }
  if (!token) {
    throw new WorkloadIdentityError("GitHub OIDC token response did not contain `value`");
  }
  deps.mask?.(token);
  return token;
}
function isIdentitySource(value) {
  if (!value || typeof value !== "object")
    return false;
  const source = value;
  return source["issuer"] === "https://token.actions.githubusercontent.com" && typeof source["repository"] === "string" && typeof source["repository_id"] === "string" && typeof source["ref"] === "string" && typeof source["sha"] === "string" && typeof source["workflow_ref"] === "string" && typeof source["actor"] === "string" && typeof source["actor_id"] === "string" && typeof source["run_id"] === "string" && typeof source["run_attempt"] === "string" && typeof source["environment"] === "string";
}
async function mintGithubActionsActorIdentity(args, deps = {}) {
  const resolved = {
    fetchImpl: deps.fetchImpl ?? fetch,
    env: deps.env ?? process.env,
    mask: deps.mask
  };
  const idToken = await requestGithubOidcToken(resolved);
  const apiUrl = args.apiUrl.replace(/\/+$/, "");
  let response;
  try {
    response = await resolved.fetchImpl(`${apiUrl}/v1-idp-broker/mint/actor-identity`, {
      method: "POST",
      headers: {
        ...(0, import_enforce4.functionRegionHeaders)(apiUrl),
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        provider: "github_actions",
        id_token: idToken,
        action_type: args.actionType,
        environment: args.environment
      }),
      signal: AbortSignal.timeout(WORKLOAD_IDENTITY_REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    throw new WorkloadIdentityError(
      `AtlaSent workload identity broker is unreachable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const body = await response.text();
  if (!response.ok) {
    const remediation = isMissingBrokerMintScope(response.status, body) ? ` Credential reference ${apiKeyCredentialReference(args.apiKey)}; an operator can match it to the first 16 characters of api_keys.key_hash and grant only idp_broker:mint.` : "";
    throw new WorkloadIdentityError(
      `AtlaSent workload identity broker rejected this job (HTTP ${response.status}): ${responseDetail(body)}.${remediation}`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new WorkloadIdentityError("AtlaSent workload identity broker returned non-JSON");
  }
  const actorId = typeof parsed["actor_id"] === "string" ? parsed["actor_id"] : "";
  const assertion = parsed["assertion"];
  if (!actorId || !assertion || typeof assertion !== "object" || assertion["version"] !== "actor_identity.v1" || !isIdentitySource(parsed["source"])) {
    throw new WorkloadIdentityError(
      "AtlaSent workload identity broker returned an invalid actor_identity.v1 response"
    );
  }
  return {
    actorId,
    assertion,
    source: parsed["source"]
  };
}
var SHA256_DIGEST_RE = /^(?:sha256:)?([0-9a-f]{64})$/i;
function normalizeArtifactDigest(value) {
  const m = SHA256_DIGEST_RE.exec((value ?? "").trim());
  return m ? `sha256:${m[1].toLowerCase()}` : null;
}
async function mintSupplyChainAssertion(args, deps = {}) {
  const digest = normalizeArtifactDigest(args.artifactDigest);
  if (!digest)
    throw new WorkloadIdentityError("artifact-digest must be sha256:<64 hex> to mint a supply_chain assertion");
  if (!args.resourceId.trim())
    throw new WorkloadIdentityError("target-id is required to mint a supply_chain assertion");
  const resolved = { fetchImpl: deps.fetchImpl ?? fetch, env: deps.env ?? process.env, mask: deps.mask };
  const idToken = await requestGithubOidcToken(resolved, SUPPLY_CHAIN_OIDC_AUDIENCE);
  const apiUrl = args.apiUrl.replace(/\/+$/, "");
  let response;
  try {
    response = await resolved.fetchImpl(`${apiUrl}/v1-supply-chain-assertion`, {
      method: "POST",
      headers: {
        ...(0, import_enforce4.functionRegionHeaders)(apiUrl),
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        id_token: idToken,
        artifact_digest: digest,
        resource_id: args.resourceId.trim(),
        environment: args.environment
      }),
      signal: AbortSignal.timeout(WORKLOAD_IDENTITY_REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    throw new WorkloadIdentityError(
      `AtlaSent supply-chain assertion issuer is unreachable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const body = await response.text();
  if (!response.ok) {
    throw new WorkloadIdentityError(
      `AtlaSent supply-chain assertion issuer refused this release (HTTP ${response.status}): ${responseDetail(body)}`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new WorkloadIdentityError("AtlaSent supply-chain assertion issuer returned non-JSON");
  }
  const a = parsed["assertion"];
  const subject = a?.["subject"];
  const claim = a?.["claim"];
  if (parsed["kind"] !== "supply_chain_assertion.v1" || !a || a["schema"] !== "assertion.v1" || a["class"] !== "supply_chain" || subject?.["type"] !== "resource" || subject?.["ref"] !== args.resourceId.trim() || normalizeArtifactDigest(String(claim?.["artifact_digest"] ?? "")) !== digest) {
    throw new WorkloadIdentityError("AtlaSent supply-chain assertion issuer returned an assertion for a different artifact or resource");
  }
  return a;
}

// src/v21.ts
async function bindBatchWorkloadIdentities(items, cfg, deps) {
  const mint = deps.mintWorkloadIdentity ?? mintGithubActionsActorIdentity;
  const bound = [];
  for (const item of items) {
    if (SUPPLY_CHAIN_ASSERTION_ACTIONS.has(item.action) || VERIFIED_ACTOR_REQUIRED_ACTIONS.has(item.action)) {
      throw new WorkloadIdentityError(
        `"${item.action}" is not supported in batch mode: it needs a verified actor and a supply_chain assertion minted per artifact. Evaluate it with the single \`action:\` input instead.`
      );
    }
    const sanitized = { ...item };
    delete sanitized.actor_identity;
    if (item.action === PRODUCTION_DEPLOY_ACTION) {
      const environment = item.environment?.trim();
      if (!environment) {
        throw new WorkloadIdentityError(
          "Every production.deploy batch evaluation requires its own non-empty `environment` binding"
        );
      }
      const identity = await mint(
        {
          apiUrl: cfg.apiUrl,
          apiKey: cfg.apiKey,
          actionType: item.action,
          environment
        },
        { mask: deps.mask }
      );
      const artifactRef = sanitized.execution_payload_hash;
      delete sanitized.execution_payload_hash;
      bound.push({
        ...sanitized,
        actor: identity.actorId,
        environment,
        actor_identity: identity.assertion,
        change_plan: {
          operation: "deploy",
          revision: identity.source.sha,
          ...artifactRef ? { artifact_ref: artifactRef } : {}
        },
        context: {
          ...item.context ?? {},
          triggering_actor: `github:${identity.source.actor}`
        }
      });
      continue;
    }
    if (OPTIONAL_VERIFIED_ACTOR_ACTIONS.has(item.action)) {
      try {
        const identity = await mint(
          {
            apiUrl: cfg.apiUrl,
            apiKey: cfg.apiKey,
            actionType: item.action,
            environment: item.environment?.trim() || "production"
          },
          { mask: deps.mask }
        );
        bound.push({
          ...sanitized,
          actor: identity.actorId,
          actor_identity: identity.assertion,
          context: {
            ...item.context ?? {},
            triggering_actor: `github:${identity.source.actor}`
          }
        });
      } catch {
        bound.push(sanitized);
      }
      continue;
    }
    bound.push(sanitized);
  }
  return bound;
}
async function emitBatchEvidence(decisions, items, cfg, log = console) {
  const tasks = [];
  for (let i = 0; i < decisions.length; i++) {
    const d = decisions[i];
    const item = items[i];
    if (!d || !item)
      continue;
    if (d.decision !== "allow")
      continue;
    if (d.verified !== true)
      continue;
    if (!d.permitToken || !d.id)
      continue;
    tasks.push(
      emitEvidenceEvent(
        cfg,
        {
          event_type: "execution_started",
          permit_token: d.permitToken,
          evaluation_id: d.id,
          environment: item.environment ?? "unknown",
          execution_started_at: (/* @__PURE__ */ new Date()).toISOString(),
          metadata: {
            ...item.context ?? {},
            source: "github-action-batch",
            action: item.action,
            actor: item.actor
          }
        },
        log
      ).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        log.warning(`AtlaSent: batch emit threw (advisory): ${msg}`);
      })
    );
  }
  await Promise.allSettled(tasks);
}
async function runV21(env, flags, deps = {}) {
  const inputs = parseInputs(env);
  const parsedItems = inputs.evaluations ?? [inputs.single];
  const items = inputs.evaluations ? await bindBatchWorkloadIdentities(
    parsedItems,
    { apiKey: inputs.apiKey, apiUrl: inputs.apiUrl },
    deps
  ) : parsedItems;
  const batch = await evaluateMany(inputs.apiUrl, inputs.apiKey, items);
  const boundItems = batch.items ?? items;
  let decisions = batch.decisions;
  if (inputs.waitForId) {
    const idx = decisions.findIndex(
      (d) => d.id === inputs.waitForId && (d.decision === "hold" || d.decision === "escalate")
    );
    if (idx >= 0) {
      const originalExecutionHash = decisions[idx].executionHashExpected ?? decisions[idx].execution_hash_expected;
      const terminal = await waitForTerminalDecision({
        apiUrl: inputs.apiUrl,
        apiKey: inputs.apiKey,
        evaluationId: inputs.waitForId,
        timeoutMs: inputs.waitTimeoutMs ?? 6e5,
        v2Streaming: flags.v2Streaming
      });
      decisions = [...decisions];
      if (terminal.decision === "allow") {
        const item = boundItems[idx];
        const runtimeExecutionHash = terminal.executionHashExpected ?? terminal.execution_hash_expected ?? originalExecutionHash;
        const vr = terminal.permitToken ? await (0, import_enforce5.verifyPermit)(
          {
            apiKey: inputs.apiKey,
            apiUrl: inputs.apiUrl,
            action: item.action,
            actor: item.actor,
            // Bind + require the same environment / target / digest the item was
            // evaluated with. A terminal allow (hold→allow) is verified under the
            // SAME bindings as the direct-allow path — not an unbound verify.
            environment: item.environment,
            targetId: item.target_id,
            executionPayloadHash: runtimeExecutionHash ?? item.execution_payload_hash,
            requiredBindings: (0, import_enforce5.requiredBindingsFor)({
              environment: item.environment,
              targetId: item.target_id,
              executionPayloadHash: runtimeExecutionHash ?? item.execution_payload_hash
            })
          },
          {
            decision: "allow",
            permitToken: terminal.permitToken,
            executionHashExpected: runtimeExecutionHash
          }
        ) : { verified: false, outcome: void 0 };
        decisions[idx] = { ...terminal, verified: vr.verified, verifyOutcome: vr.outcome };
      } else {
        decisions[idx] = terminal;
      }
    }
  }
  await emitBatchEvidence(decisions, boundItems, {
    apiKey: inputs.apiKey,
    apiUrl: inputs.apiUrl
  });
  const failed = decisions.some(
    (d) => d.decision === "deny" || d.decision === "hold" || d.decision === "escalate" || d.decision === "allow" && d.verified !== true
  );
  return { decisions, failed, batchId: batch.batchId };
}

// src/policySync.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var import_enforce6 = __toESM(require_dist());
async function runPolicySync(opts) {
  const { apiKey, apiUrl, bundlePath, source, commitSha, ref, dryRun } = opts;
  const workspace = process.env["GITHUB_WORKSPACE"] ?? ".";
  const absPath = path.isAbsolute(bundlePath) ? bundlePath : path.resolve(workspace, bundlePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(
      `Policy bundle not found: ${bundlePath} (resolved to ${absPath})`
    );
  }
  let policies;
  try {
    const raw = fs.readFileSync(absPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("Policy bundle must be a JSON array of policy entries");
    }
    policies = parsed;
  } catch (err) {
    throw new Error(
      `Failed to parse policy bundle at ${bundlePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (policies.length === 0) {
    throw new Error("Policy bundle is empty \u2014 at least one entry is required");
  }
  const url = `${apiUrl.replace(/\/$/, "")}/v1/policy-sync`;
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(0, import_enforce6.functionRegionHeaders)(url)
      },
      body: JSON.stringify({
        policies,
        source: source ?? "github-action",
        commit_sha: commitSha,
        ref,
        dry_run: dryRun
      })
    });
  } catch (err) {
    throw new Error(
      `Network error reaching ${url}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!resp.ok) {
    let detail = "";
    try {
      const errBody = await resp.json();
      detail = errBody.error ?? errBody.message ?? "";
    } catch {
    }
    throw new Error(
      `v1-policy-sync responded ${resp.status}${detail ? `: ${detail}` : ""}`
    );
  }
  let run2;
  try {
    run2 = await resp.json();
  } catch {
    throw new Error("Could not parse JSON response from v1-policy-sync");
  }
  return {
    run: run2,
    diff: formatSyncDiff(run2),
    rejected: run2.status === "rejected" || run2.status === "failed"
  };
}
function formatSyncDiff(run2) {
  const parts = [];
  if (run2.policies_added > 0)
    parts.push(`+${run2.policies_added} added`);
  if (run2.policies_updated > 0)
    parts.push(`~${run2.policies_updated} updated`);
  if (run2.policies_removed > 0)
    parts.push(`-${run2.policies_removed} removed`);
  return parts.length > 0 ? parts.join(", ") : "no changes";
}

// src/governanceAgents.ts
var import_node_crypto2 = require("node:crypto");
var fs2 = __toESM(require("node:fs"));
var path2 = __toESM(require("node:path"));
var import_enforce7 = __toESM(require_dist());
var SEVERITY_RANK = {
  info: 1,
  low: 2,
  medium: 3,
  high: 4,
  blocker: 5
};
async function runGovernanceAgents(opts) {
  if (!opts.apiKey)
    throw new Error("apiKey is required");
  if (!opts.apiUrl)
    throw new Error("apiUrl is required");
  if (!opts.changeId) {
    throw new Error("changeId is required \u2014 set governance-change-id input");
  }
  if (opts.agentSlugs.length === 0) {
    throw new Error("agentSlugs must be non-empty");
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const fs_ = opts.fileSystem ?? defaultFs();
  const workspace = opts.workspace ?? process.env["GITHUB_WORKSPACE"] ?? process.cwd();
  const artifactMap = opts.artifactFile ? readArtifactFile(opts.artifactFile, workspace, fs_) : {};
  const evaluations = [];
  const findings = [];
  for (const slug of opts.agentSlugs) {
    const artifact = artifactMap[slug] ?? autoDiscoverArtifact(slug, workspace, fs_);
    if (!artifact) {
      throw new Error(
        `No artifact for agent "${slug}". Either supply one via governance-artifact-file (a JSON object keyed by agent slug) or use a slug that supports auto-discovery (migration_review, runtime_contract_drift).`
      );
    }
    const result = await invokeAgent(
      {
        apiKey: opts.apiKey,
        apiUrl: opts.apiUrl,
        changeId: opts.changeId,
        slug,
        artifact,
        invokedBy: opts.invokedBy ?? "github-action",
        fetchImpl
      }
    );
    evaluations.push(result.evaluation);
    findings.push(...result.findings);
  }
  const highest = highestSeverity(findings);
  const failed = !!opts.failOnSeverity && !!highest && SEVERITY_RANK[highest] >= SEVERITY_RANK[opts.failOnSeverity];
  return { evaluations, findings, highest_severity: highest, failed };
}
async function invokeAgent(args) {
  const url = `${args.apiUrl.replace(/\/$/, "")}/v1/governance/agents/${encodeURIComponent(args.slug)}/evaluate`;
  const body = JSON.stringify({
    change_id: args.changeId,
    input_hash: hashArtifact(args.artifact),
    artifact: args.artifact,
    invoked_by_kind: "service_account",
    invoked_by: args.invokedBy
  });
  let resp;
  try {
    resp = await args.fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.apiKey}`,
        ...(0, import_enforce7.functionRegionHeaders)(url)
      },
      body
    });
  } catch (err) {
    throw new Error(
      `governance agent ${args.slug}: network error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    if (resp.status === 501) {
      throw new Error(
        `governance agent ${args.slug}: registered in the DB but no in-process implementation is deployed (501). Skip this slug or upgrade the API.`
      );
    }
    throw new Error(
      `governance agent ${args.slug}: HTTP ${resp.status} ${resp.statusText} \u2014 ${text.slice(0, 500)}`
    );
  }
  const parsed = await resp.json();
  if (!parsed.evaluation || !Array.isArray(parsed.findings)) {
    throw new Error(`governance agent ${args.slug}: malformed response`);
  }
  return parsed;
}
var MIGRATION_DIRS = [
  "supabase/migrations",
  "supabase/migrations-runtime",
  "supabase/migrations-console",
  "supabase/migrations-shared"
];
function defaultFs() {
  return {
    readFileSync: (p, enc) => fs2.readFileSync(p, enc),
    existsSync: (p) => fs2.existsSync(p),
    readdirSync: (p) => fs2.readdirSync(p),
    statSync: (p) => fs2.statSync(p)
  };
}
function autoDiscoverArtifact(slug, workspace, fs_) {
  if (slug === "migration_review")
    return discoverMigrationArtifact(workspace, fs_);
  if (slug === "runtime_contract_drift")
    return discoverRuntimeContractArtifact(workspace, fs_);
  return null;
}
function discoverMigrationArtifact(workspace, fs_) {
  const files = [];
  for (const dir of MIGRATION_DIRS) {
    const abs = path2.resolve(workspace, dir);
    if (!fs_.existsSync(abs))
      continue;
    if (!fs_.statSync(abs).isDirectory())
      continue;
    for (const entry of fs_.readdirSync(abs)) {
      if (!entry.endsWith(".sql"))
        continue;
      const full = path2.join(abs, entry);
      if (!fs_.statSync(full).isFile())
        continue;
      files.push({
        path: path2.relative(workspace, full),
        content: fs_.readFileSync(full, "utf-8")
      });
    }
  }
  return { migrations: files };
}
function discoverRuntimeContractArtifact(workspace, fs_) {
  const openapiPath = ["openapi.yaml", "openapi-v1.yaml", "openapi.yml"].map((p) => path2.resolve(workspace, p)).find((p) => fs_.existsSync(p));
  if (!openapiPath)
    return null;
  const openapi = parseOpenApiPaths(fs_.readFileSync(openapiPath, "utf-8"));
  const routesDir = path2.resolve(workspace, "supabase/functions");
  const routes = fs_.existsSync(routesDir) ? discoverRuntimeRoutes(routesDir, fs_) : [];
  const typeNames = [];
  const typesIndex = path2.resolve(workspace, "packages/types/src/index.ts");
  if (fs_.existsSync(typesIndex)) {
    const content = fs_.readFileSync(typesIndex, "utf-8");
    for (const m of content.matchAll(/export\s+(?:type|interface)\s+([A-Z][A-Za-z0-9_]*)/g)) {
      typeNames.push(m[1]);
    }
  }
  return {
    openapi: { paths: openapi },
    runtime: { routes },
    sdk: { type_names: typeNames }
  };
}
function parseOpenApiPaths(yaml) {
  const out = [];
  const lines = yaml.split("\n");
  let inPaths = false;
  let currentPath = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!inPaths) {
      if (/^paths:\s*$/.test(line))
        inPaths = true;
      continue;
    }
    if (/^[A-Za-z]/.test(line)) {
      inPaths = false;
      if (currentPath) {
        out.push(currentPath);
        currentPath = null;
      }
      continue;
    }
    const pathMatch = /^  (\/[\w/{}.-]+):/.exec(line);
    if (pathMatch) {
      if (currentPath)
        out.push(currentPath);
      currentPath = { path: pathMatch[1], methods: [] };
      continue;
    }
    const methodMatch = /^    (get|post|put|patch|delete):/i.exec(line);
    if (methodMatch && currentPath) {
      currentPath.methods.push(methodMatch[1].toLowerCase());
    }
  }
  if (currentPath)
    out.push(currentPath);
  return out;
}
function discoverRuntimeRoutes(routesDir, fs_) {
  const routes = [];
  for (const entry of fs_.readdirSync(routesDir)) {
    if (!entry.startsWith("v1-"))
      continue;
    const dir = path2.join(routesDir, entry);
    if (!fs_.statSync(dir).isDirectory())
      continue;
    const inferredPath = "/" + entry.replace(/-/g, "/").replace(/^\//, "");
    routes.push({
      path: inferredPath,
      // Methods unknown without parsing the handler; leave empty so the
      // drift agent treats per-method as "not asserted by runtime" and
      // only flags path-level drift.
      methods: [],
      function_name: entry
    });
  }
  return routes;
}
function readArtifactFile(artifactPath, workspace, fs_) {
  const abs = path2.isAbsolute(artifactPath) ? artifactPath : path2.resolve(workspace, artifactPath);
  if (!fs_.existsSync(abs)) {
    throw new Error(`governance-artifact-file not found: ${artifactPath}`);
  }
  const raw = fs_.readFileSync(abs, "utf-8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `governance-artifact-file is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      "governance-artifact-file must be a JSON object keyed by agent slug"
    );
  }
  return parsed;
}
function hashArtifact(artifact) {
  const canonical = canonicalJson(artifact);
  return "sha256:" + (0, import_node_crypto2.createHash)("sha256").update(canonical).digest("hex");
}
function canonicalJson(value) {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value);
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(value[k])).join(",") + "}";
}
function highestSeverity(findings) {
  let best = null;
  let rank = 0;
  for (const f of findings) {
    if (SEVERITY_RANK[f.severity] > rank) {
      rank = SEVERITY_RANK[f.severity];
      best = f.severity;
    }
  }
  return best;
}
function renderStepSummary(result) {
  const lines = [];
  lines.push("## Constrained Governance Agents \u2014 findings");
  lines.push("");
  lines.push(
    "> Findings are advisory. They produce signal, not authorization. Required gates remain on the governance authority surface."
  );
  lines.push("");
  for (const e of result.evaluations) {
    lines.push(`### ${e.agent_slug} \`${e.agent_version}\``);
    lines.push("");
    lines.push(
      `Status: **${e.status}** \u2014 findings: **${e.findings_count}** \u2014 highest: **${e.highest_severity ?? "\u2014"}**`
    );
    if (e.summary)
      lines.push(`> ${e.summary}`);
    lines.push("");
    const own = result.findings.filter((f) => f.agent_slug === e.agent_slug);
    if (own.length === 0) {
      lines.push("_No findings._");
      lines.push("");
      continue;
    }
    lines.push("| Severity | Type | Authority | Summary |");
    lines.push("|---|---|---|---|");
    for (const f of own) {
      const auth = f.required_authority ?? "\u2014";
      const summary = f.summary.replace(/\|/g, "\\|").replace(/\n+/g, " ");
      lines.push(`| ${f.severity} | \`${f.finding_type}\` | ${auth} | ${summary} |`);
    }
    lines.push("");
  }
  if (result.highest_severity) {
    lines.push(`**Overall highest severity:** \`${result.highest_severity}\``);
  } else {
    lines.push("**No findings.**");
  }
  return lines.join("\n") + "\n";
}

// src/financialGovernanceAdvisory.ts
var USD_EQUIVALENT_CURRENCIES = /* @__PURE__ */ new Set(["USD", "USDC", "USDT", "DAI"]);
var REGULATORY_ACTION_TYPES = /* @__PURE__ */ new Set(["wire_transfer", "trading_execution"]);
var TIER_LOW_MAX = 1e3;
var TIER_MEDIUM_MAX = 5e4;
var TIER_HIGH_MAX = 1e6;
function computeRiskScore(value, tier) {
  switch (tier) {
    case "non_financial":
      return 0;
    case "low":
      return Math.min(19, Math.round(value / TIER_LOW_MAX * 19));
    case "medium":
      return Math.min(49, 20 + Math.round((value - TIER_LOW_MAX) / (TIER_MEDIUM_MAX - TIER_LOW_MAX) * 29));
    case "high":
      return Math.min(79, 50 + Math.round((value - TIER_MEDIUM_MAX) / (TIER_HIGH_MAX - TIER_MEDIUM_MAX) * 29));
    case "critical":
      return Math.min(100, 80 + Math.round(Math.log10(value / TIER_HIGH_MAX) * 10));
  }
}
function assessFinancialGovernance(input) {
  const { actionType, actionValue, currency, actorId } = input;
  const isUsdEquivalent = USD_EQUIVALENT_CURRENCIES.has(currency.toUpperCase());
  if (!actionValue || actionValue <= 0 || !isUsdEquivalent) {
    return {
      adviceMode: "advisory",
      riskTier: "non_financial",
      riskScore: 0,
      evidenceRequired: false,
      signals: [],
      summary: `Financial governance advisory: no financial action detected (actor=${actorId})`
    };
  }
  let riskTier;
  if (actionValue < TIER_LOW_MAX) {
    riskTier = "low";
  } else if (actionValue < TIER_MEDIUM_MAX) {
    riskTier = "medium";
  } else if (actionValue < TIER_HIGH_MAX) {
    riskTier = "high";
  } else {
    riskTier = "critical";
  }
  const evidenceRequired = riskTier === "high" || riskTier === "critical";
  const riskScore = computeRiskScore(actionValue, riskTier);
  const signals = [];
  if (riskTier === "high" || riskTier === "critical") {
    signals.push(
      `High-value financial action ($${actionValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}) \u2014 quorum approval recommended`
    );
  }
  if (evidenceRequired) {
    signals.push("Evidence bundle required for audit trail");
  }
  if (REGULATORY_ACTION_TYPES.has(actionType)) {
    signals.push(
      `Action type '${actionType}' has regulatory reporting implications`
    );
  }
  const summary = `Financial governance advisory: ${riskTier.toUpperCase()} risk | $${actionValue.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency} | score=${riskScore} | evidenceRequired=${evidenceRequired} | actor=${actorId}`;
  return {
    adviceMode: "advisory",
    riskTier,
    riskScore,
    evidenceRequired,
    signals,
    summary
  };
}

// src/releaseCandidate.ts
async function postJson(url, token, body, fetchFn = globalThis.fetch) {
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`POST ${url} failed (${res.status}): ${text.slice(0, 400)}`);
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "data" in parsed && parsed.success) {
      return parsed.data;
    }
    return parsed;
  } catch {
    throw new Error(`POST ${url} returned non-JSON body: ${text.slice(0, 200)}`);
  }
}
async function registerAndVerify(inputs, fetchFn = globalThis.fetch) {
  const base = inputs.controlPlaneUrl.replace(/\/$/, "");
  const registered = await postJson(
    `${base}/v1/release/candidates`,
    inputs.controlPlaneToken,
    {
      repo: inputs.repo,
      commitSha: inputs.commitSha,
      imageDigest: inputs.imageDigest,
      semver: inputs.semver,
      environment: inputs.environment,
      targetRuntimeUrl: inputs.targetRuntimeUrl
    },
    fetchFn
  );
  const runtime = await postJson(
    `${base}/v1/release/candidates/${registered.candidateId}/verify/runtime`,
    inputs.controlPlaneToken,
    {},
    fetchFn
  );
  const deploy = await postJson(
    `${base}/v1/release/candidates/${registered.candidateId}/verify/deploy`,
    inputs.controlPlaneToken,
    {},
    fetchFn
  );
  return { candidateId: registered.candidateId, runtime, deploy };
}
function summarizeOutcome(o) {
  if (o.status === "passed")
    return { ok: true, level: "passed" };
  if (o.status === "partial")
    return { ok: true, level: "warned" };
  return { ok: false, level: "failed" };
}

// src/evidenceBundle.ts
var import_node_crypto3 = require("node:crypto");
function genId() {
  return (0, import_node_crypto3.randomUUID)();
}
function hmacSha256(secret, input) {
  return (0, import_node_crypto3.createHmac)("sha256", secret).update(input, "utf8").digest("hex");
}
function sha256Hex(input) {
  return (0, import_node_crypto3.createHash)("sha256").update(input, "utf8").digest("hex");
}
function buildComplianceControls(hasAuditHash) {
  return [
    {
      control_id: "CC7.2",
      framework: "SOC2",
      satisfied: true,
      evidence_type: "audit_trail"
    },
    {
      control_id: "CC8.1",
      framework: "SOC2",
      satisfied: true,
      evidence_type: "change_management_gate"
    },
    {
      control_id: "CC6.1",
      framework: "SOC2",
      satisfied: true,
      evidence_type: "logical_access_control"
    },
    {
      control_id: "CC3.2",
      framework: "SOC2",
      // CC3.2 (policy violations) requires the audit hash to be present.
      satisfied: hasAuditHash,
      evidence_type: "policy_evaluation_evidence"
    }
  ];
}
function buildEvidenceBundle(args) {
  const receiptId = genId();
  const bundleId = genId();
  const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const receiptPayload = {
    receipt_id: receiptId,
    evaluation_id: args.evaluationId,
    permit_id: args.permitToken || null,
    audit_hash: args.auditHash ?? null,
    issued_at: generatedAt,
    action: args.action,
    actor: args.actor,
    environment: args.environment,
    repository: args.repository,
    sha: args.sha,
    run_id: args.runId,
    decision: "allow"
  };
  let signature = null;
  let algorithm = "none";
  if (args.signingSecret) {
    const sigInput = `${receiptId}
${generatedAt}
${JSON.stringify(receiptPayload)}`;
    signature = hmacSha256(args.signingSecret, sigInput);
    algorithm = "hmac-sha256";
  }
  const receipt = {
    ...receiptPayload,
    algorithm,
    signature,
    signing_key_id: args.signingKeyId ?? null
  };
  const hasAuditHash = Boolean(args.auditHash);
  const complianceControls = buildComplianceControls(hasAuditHash);
  const bundleBody = {
    v: 1,
    bundle_id: bundleId,
    action: args.action,
    actor: args.actor,
    decision: "allow",
    environment: args.environment,
    repository: args.repository,
    sha: args.sha,
    run_id: args.runId,
    run_url: args.runUrl,
    receipt,
    compliance_controls: complianceControls,
    generated_at: generatedAt
  };
  const bundleHash = sha256Hex(JSON.stringify(bundleBody));
  return { ...bundleBody, bundle_hash: bundleHash };
}

// src/postDeployEvidenceBundle.ts
var import_enforce8 = __toESM(require_dist());
var VALID_EVIDENCE_REGIMES = /* @__PURE__ */ new Set([
  "soc2_type_ii",
  "hipaa",
  "gdpr"
]);
function isoNow() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function isoOffsetDays(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1e3).toISOString();
}
async function callPostDeployEvidenceBundle(args, log, timeoutMs = 3e4) {
  const empty = { sha256: "", exportId: "" };
  const url = `${args.apiUrl.replace(/\/$/, "")}/v1/orgs/${encodeURIComponent(args.orgId)}/evidence-exports`;
  const windowTo = isoNow();
  const windowFrom = isoOffsetDays(args.days);
  const body = {
    regime: args.regime,
    window: { from: windowFrom, to: windowTo }
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        ...(0, import_enforce8.functionRegionHeaders)(url),
        ...args.actor ? { "X-AtlaSent-Actor": args.actor } : {}
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (res.status === 402) {
      log.warning(
        "AtlaSent evidence-bundle: organization is not on the enterprise plan (HTTP 402). Upgrade to generate compliance evidence bundles from CI."
      );
      return empty;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log.warning(
        `AtlaSent evidence-bundle: POST ${url} \u2192 HTTP ${res.status} (advisory; build not affected). ${text}`.trim()
      );
      return empty;
    }
    const data = await res.json();
    const exportId = data.export?.id ?? "";
    const sha256 = data.sha256 ?? data.export?.bundle_sha256 ?? "";
    log.info(`AtlaSent evidence-bundle: export ${exportId} sha256=${sha256}`);
    return { sha256, exportId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warning(
      `AtlaSent evidence-bundle: request failed (advisory; build not affected): ${msg}`
    );
    return empty;
  } finally {
    clearTimeout(timer);
  }
}

// src/executionPayloadHash.ts
function normalizeExecutionPayloadHash(digest) {
  if (!digest)
    return digest;
  const colonIndex = digest.indexOf(":");
  const stripped = colonIndex === -1 ? digest : digest.slice(colonIndex + 1);
  return /^[0-9a-f]{64}$/i.test(stripped) ? stripped.toLowerCase() : digest;
}

// src/vqpVerify.ts
var import_enforce9 = __toESM(require_dist());
async function runVqpVerify(inputs, fetchFn = globalThis.fetch) {
  const base = inputs.supabaseUrl.replace(/\/$/, "");
  const url = `${base}/functions/v1/v1-verify-vqp`;
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${inputs.serviceRoleKey}`,
      ...(0, import_enforce9.functionRegionHeaders)(url)
    },
    body: JSON.stringify({
      snapshot_id: inputs.snapshotId,
      rerun: inputs.rerun
    })
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`v1-verify-vqp failed (${res.status}): ${text.slice(0, 400)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`v1-verify-vqp returned non-JSON: ${text.slice(0, 200)}`);
  }
  const body = parsed.success && parsed.data ? parsed.data : parsed;
  return {
    hashMatch: body.hash_match === true,
    scoreDelta: body.score_delta !== void 0 ? body.score_delta : null,
    verdictChanged: body.verdict_changed === true,
    auditId: body.audit_id ?? ""
  };
}

// src/approvals.ts
var EMPTY = {
  approvals: 0,
  approving_reviewers: [],
  pr_number: null,
  source: "none"
};
var MAX_REVIEW_PAGES = 10;
var PER_PAGE = 100;
function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}
async function resolvePrNumber(opts) {
  const explicit = typeof opts.prNumber === "number" ? opts.prNumber : typeof opts.prNumber === "string" && /^\d+$/.test(opts.prNumber.trim()) ? parseInt(opts.prNumber.trim(), 10) : null;
  if (explicit && explicit > 0)
    return explicit;
  if (!opts.sha)
    return null;
  const url = `${opts.apiBase}/repos/${opts.repository}/commits/${opts.sha}/pulls`;
  try {
    const res = await opts.fetchImpl(url, { headers: ghHeaders(opts.token) });
    if (!res.ok) {
      opts.warn(
        `AtlaSent: could not resolve PR for commit ${opts.sha.slice(0, 8)} (${res.status}); treating as 0 approvals`
      );
      return null;
    }
    const pulls = await res.json();
    if (!Array.isArray(pulls) || pulls.length === 0)
      return null;
    const merged = pulls.find((p) => p.state === "closed") ?? pulls[0];
    return typeof merged.number === "number" ? merged.number : null;
  } catch (err) {
    opts.warn(
      `AtlaSent: PR resolution error (advisory, non-blocking): ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}
async function fetchAllReviews(opts) {
  const reviews = [];
  for (let page = 1; page <= MAX_REVIEW_PAGES; page++) {
    const url = `${opts.apiBase}/repos/${opts.repository}/pulls/${opts.prNumber}/reviews?per_page=${PER_PAGE}&page=${page}`;
    let batch;
    try {
      const res = await opts.fetchImpl(url, { headers: ghHeaders(opts.token) });
      if (!res.ok) {
        opts.warn(
          `AtlaSent: could not read reviews for PR #${opts.prNumber} (${res.status}); treating as 0 approvals`
        );
        return null;
      }
      batch = await res.json();
    } catch (err) {
      opts.warn(
        `AtlaSent: review fetch error (advisory, non-blocking): ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
    if (!Array.isArray(batch) || batch.length === 0)
      break;
    reviews.push(...batch);
    if (batch.length < PER_PAGE)
      break;
  }
  return reviews;
}
function countApprovals(reviews) {
  const STATEFUL = /* @__PURE__ */ new Set(["APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);
  const latestByUser = /* @__PURE__ */ new Map();
  for (const r of reviews) {
    const login = r.user?.login;
    const state = (r.state ?? "").toUpperCase();
    if (!login || !STATEFUL.has(state))
      continue;
    latestByUser.set(login, state);
  }
  const approving = [...latestByUser.entries()].filter(([, state]) => state === "APPROVED").map(([login]) => login).sort();
  return { approvals: approving.length, approving_reviewers: approving };
}
async function resolveApprovals(options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const warn = options.warn ?? (() => {
  });
  const log = options.log ?? (() => {
  });
  const apiBase = (options.apiBase ?? "https://api.github.com").replace(/\/+$/, "");
  const token = options.token?.trim();
  if (!token) {
    warn(
      "AtlaSent: GITHUB_TOKEN not available \u2014 cannot read PR reviews for approval evidence. Pass `env: GITHUB_TOKEN: ${{ github.token }}` or supply `approvals` via the `context` input. Treating as 0 approvals."
    );
    return { ...EMPTY };
  }
  if (!options.repository) {
    warn("AtlaSent: GITHUB_REPOSITORY not set \u2014 cannot read PR reviews. Treating as 0 approvals.");
    return { ...EMPTY };
  }
  const prNumber = await resolvePrNumber({
    repository: options.repository,
    sha: options.sha,
    token,
    apiBase,
    prNumber: options.prNumber,
    fetchImpl,
    warn
  });
  if (!prNumber) {
    log("AtlaSent: no associated pull request found \u2014 0 approvals from PR reviews.");
    return { ...EMPTY };
  }
  const reviews = await fetchAllReviews({
    repository: options.repository,
    token,
    apiBase,
    prNumber,
    fetchImpl,
    warn
  });
  if (reviews === null) {
    return { approvals: 0, approving_reviewers: [], pr_number: prNumber, source: "none" };
  }
  const { approvals, approving_reviewers } = countApprovals(reviews);
  log(
    `AtlaSent: PR #${prNumber} has ${approvals} approving review${approvals === 1 ? "" : "s"}` + (approving_reviewers.length ? ` (${approving_reviewers.join(", ")})` : "")
  );
  return { approvals, approving_reviewers, pr_number: prNumber, source: "pr-reviews" };
}

// src/stepSummary.ts
var DEFAULT_CONSOLE = "https://console.atlasent.io";
function truncHash(h) {
  if (!h)
    return void 0;
  return h.length > 24 ? `${h.slice(0, 24)}\u2026` : h;
}
function buildGateStepSummary(input) {
  const consoleBase = (input.consoleBaseUrl ?? DEFAULT_CONSOLE).replace(/\/$/, "");
  const isAllow = input.outcome === "allow";
  const icon = input.outcome === "allow" ? "\u2705" : input.outcome === "deny" ? "\u{1F534}" : input.outcome === "hold" ? "\u{1F7E1}" : input.outcome === "escalate" ? "\u{1F6A8}" : "\u26D4";
  const label = input.outcome === "allow" ? "AUTHORIZED" : input.outcome === "deny" ? "DENIED" : input.outcome === "hold" ? "ON HOLD" : input.outcome === "escalate" ? "ESCALATED" : "BLOCKED (fail-closed)";
  const lines = [];
  lines.push("", "---", `## ${icon} AtlaSent Deploy Gate \u2014 ${label}`, "");
  if (isAllow) {
    lines.push(
      `Authorization **granted** for \`${input.action}\` by **${input.actor}** in **${input.environment}**. The deploy is permitted to proceed.`
    );
  } else if (input.outcome === "error") {
    lines.push(
      `The gate **could not confirm authorization** for \`${input.action}\`, so the deploy did **not** run. This is fail-closed behavior by design \u2014 a gate that cannot verify a decision blocks rather than waves the action through.`
    );
  } else {
    lines.push(
      `The gate **blocked** \`${input.action}\` by **${input.actor}** in **${input.environment}**. The deploy did not run.`
    );
  }
  lines.push("");
  lines.push(`| Field | Value |`, `|---|---|`);
  lines.push(`| Decision | \`${input.outcome}\` |`);
  if (!isAllow && input.reason)
    lines.push(`| Reason | ${input.reason} |`);
  if (!isAllow && input.denyCode)
    lines.push(`| Deny code | \`${input.denyCode}\` |`);
  lines.push(`| Action | \`${input.action}\` |`);
  lines.push(`| Actor | \`${input.actor}\` |`);
  lines.push(`| Environment | \`${input.environment}\` |`);
  if (input.targetId)
    lines.push(`| Target | \`${input.targetId}\` |`);
  if (typeof input.riskScore === "number") {
    const cls = input.riskClass ? ` (${input.riskClass})` : "";
    lines.push(`| Risk score | ${input.riskScore}${cls} |`);
  } else if (input.riskClass) {
    lines.push(`| Risk class | \`${input.riskClass}\` |`);
  }
  lines.push("");
  const evalId = input.evaluationId;
  const audit = truncHash(input.auditHash);
  const hasEvidence = !!(evalId || audit || isAllow && input.permitIssued);
  if (hasEvidence) {
    lines.push("### Evidence", "");
    if (evalId)
      lines.push(`- **Evaluation ID:** \`${evalId}\``);
    if (audit)
      lines.push(`- **Audit chain hash:** \`${audit}\``);
    if (isAllow && input.permitIssued) {
      const verifiedNote = input.verified ? `issued and **verified**${input.verifyOutcome ? ` (${input.verifyOutcome})` : ""}` : "issued";
      lines.push(`- **Permit:** ${verifiedNote} \u2713`);
    }
    if (isAllow && input.evidenceReceiptId) {
      lines.push(`- **Evidence receipt:** \`${input.evidenceReceiptId}\``);
    }
    lines.push("");
  }
  if (!isAllow && input.remediation) {
    const r = input.remediation;
    const steps = (r.how_to ?? []).filter((s) => typeof s === "string" && s.length > 0);
    if (r.summary || steps.length > 0) {
      lines.push("### How to fix", "");
      if (r.summary)
        lines.push(r.summary, "");
      for (const step of steps)
        lines.push(`- ${step}`);
      if (r.docs)
        lines.push("", `See [deny-code reference](${r.docs}).`);
      lines.push("");
    }
  }
  if (evalId) {
    lines.push(
      `[View the full decision & replay the evidence](${consoleBase}/decisions/${evalId}/replay)`
    );
  }
  lines.push(`[View workflow run](${input.runUrl})`);
  if (input.outcome === "hold" || input.outcome === "escalate") {
    lines.push(
      "",
      `> **Next step:** an authorized reviewer must approve this deployment in the [AtlaSent console](${consoleBase}/approvals) or via the Slack Approval Bot, then re-run this job.`
    );
  } else if (input.outcome === "deny") {
    lines.push(
      "",
      `> **Why blocked?** The decision above is recorded as an immutable, hash-linked audit entry. Open the decision link to see exactly which policy rule fired.`
    );
  } else if (isAllow) {
    lines.push(
      "",
      `> This decision is recorded as a tamper-evident, hash-linked audit entry and can be verified offline against the signed audit chain.`
    );
  }
  lines.push("");
  return lines.join("\n");
}

// src/changeBrief.ts
var fs3 = __toESM(require("fs"));
var import_enforce10 = __toESM(require_dist());
var GITHUB_API_DEFAULT = "https://api.github.com";
function canonicalize(value) {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(canonicalize).join(",")}]`;
  const obj = value;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}
async function computeGithubPlanDigest(input) {
  const projection = {
    plan_format: "git-sha",
    repository: input.repository,
    base_sha: input.base_sha,
    head_sha: input.head_sha,
    ref: input.ref ?? null
  };
  const encoded = new TextEncoder().encode(canonicalize(projection));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}
function resolveBaseHead(args) {
  const readFile = args.readFile ?? ((p) => fs3.readFileSync(p, "utf-8"));
  const empty = {
    base_sha: args.overrideBase || null,
    head_sha: args.overrideHead || args.fallbackSha,
    ref: args.fallbackRef || null,
    pull_request_number: null,
    pr_author: null,
    merge_actor: null,
    pr_url: null
  };
  if (args.overrideBase && args.overrideHead) {
    return { ...empty, base_sha: args.overrideBase, head_sha: args.overrideHead };
  }
  if (!args.eventPath)
    return empty;
  let payload;
  try {
    payload = JSON.parse(readFile(args.eventPath));
  } catch {
    return empty;
  }
  if ((args.eventName === "pull_request" || args.eventName === "pull_request_target") && payload && typeof payload === "object") {
    const pr = payload.pull_request;
    if (pr?.base?.sha && pr?.head?.sha) {
      return {
        base_sha: args.overrideBase || pr.base.sha,
        head_sha: args.overrideHead || pr.head.sha,
        ref: pr.head.ref ?? args.fallbackRef ?? null,
        pull_request_number: payload.number ?? null,
        pr_author: pr.user?.login ?? null,
        merge_actor: pr.merged_by?.login ?? null,
        pr_url: pr.html_url ?? null
      };
    }
  }
  if (args.eventName === "push" && payload && typeof payload === "object") {
    const push = payload;
    const ALL_ZERO = /^0+$/;
    if (push.before && push.after && !ALL_ZERO.test(push.before)) {
      return {
        base_sha: args.overrideBase || push.before,
        head_sha: args.overrideHead || push.after,
        ref: args.fallbackRef || null,
        pull_request_number: null,
        pr_author: null,
        merge_actor: null,
        pr_url: null
      };
    }
  }
  return empty;
}
function ghHeaders2(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}
var COMPARE_FILES_SOFT_CAP = 300;
var STATUS_MAP = {
  added: "added",
  removed: "removed",
  modified: "modified",
  renamed: "renamed",
  copied: "copied",
  changed: "changed",
  unchanged: "unchanged"
};
async function fetchChangedFiles(args) {
  const fetchImpl = args.fetchImpl ?? fetch;
  const apiBase = (args.apiBase ?? GITHUB_API_DEFAULT).replace(/\/+$/, "");
  const url = `${apiBase}/repos/${args.repository}/compare/${args.base_sha}...${args.head_sha}`;
  try {
    const res = await fetchImpl(url, { headers: ghHeaders2(args.token) });
    if (!res.ok) {
      const text = await res.text().catch(() => "<unreadable>");
      return {
        ok: false,
        files: [],
        truncated: false,
        additions_total: 0,
        deletions_total: 0,
        compare_url: null,
        error: `compare failed (${res.status}): ${text.slice(0, 200)}`
      };
    }
    const data = await res.json();
    const rawFiles = data.files ?? [];
    const files = rawFiles.map((f) => ({
      path: f.filename,
      additions: f.additions,
      deletions: f.deletions,
      status: STATUS_MAP[f.status] ?? "modified",
      previous_path: f.previous_filename ?? null
    }));
    return {
      ok: true,
      files,
      truncated: rawFiles.length >= COMPARE_FILES_SOFT_CAP,
      additions_total: files.reduce((sum, f) => sum + f.additions, 0),
      deletions_total: files.reduce((sum, f) => sum + f.deletions, 0),
      compare_url: data.html_url ?? null
    };
  } catch (err) {
    return {
      ok: false,
      files: [],
      truncated: false,
      additions_total: 0,
      deletions_total: 0,
      compare_url: null,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
var MAX_CHECK_RUN_PAGES = 10;
var CHECK_RUNS_PER_PAGE = 100;
async function fetchCheckRuns(args) {
  const fetchImpl = args.fetchImpl ?? fetch;
  const apiBase = (args.apiBase ?? GITHUB_API_DEFAULT).replace(/\/+$/, "");
  const checks = [];
  for (let page = 1; page <= MAX_CHECK_RUN_PAGES; page++) {
    const url = `${apiBase}/repos/${args.repository}/commits/${args.ref}/check-runs?per_page=${CHECK_RUNS_PER_PAGE}&page=${page}`;
    let batch;
    try {
      const res = await fetchImpl(url, { headers: ghHeaders2(args.token) });
      if (!res.ok) {
        const text = await res.text().catch(() => "<unreadable>");
        return {
          ok: false,
          checks: [],
          truncated: false,
          error: `check-runs failed (${res.status}): ${text.slice(0, 200)}`
        };
      }
      const data = await res.json();
      batch = data.check_runs ?? [];
    } catch (err) {
      return {
        ok: false,
        checks: [],
        truncated: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
    if (batch.length === 0)
      break;
    for (const c of batch) {
      checks.push({
        name: c.name,
        status: c.status ?? "queued",
        conclusion: c.conclusion ?? null,
        html_url: c.html_url ?? null
      });
    }
    if (batch.length < CHECK_RUNS_PER_PAGE)
      break;
  }
  return {
    ok: true,
    checks,
    truncated: checks.length >= MAX_CHECK_RUN_PAGES * CHECK_RUNS_PER_PAGE
  };
}
var ChangeBriefError = class extends Error {
};
async function runChangeBrief(opts) {
  const log = opts.log ?? (() => {
  });
  const warn = opts.warn ?? (() => {
  });
  const now = (opts.now?.() ?? /* @__PURE__ */ new Date()).toISOString();
  const token = (opts.githubToken ?? "").trim();
  if (!token) {
    throw new ChangeBriefError(
      "change-brief mode requires GITHUB_TOKEN to read the diff and check runs (pass `env: GITHUB_TOKEN: ${{ github.token }}`)."
    );
  }
  const resolved = resolveBaseHead({
    eventName: opts.eventName,
    eventPath: opts.eventPath,
    fallbackSha: opts.fallbackSha,
    fallbackRef: opts.fallbackRef,
    overrideBase: opts.overrideBaseSha,
    overrideHead: opts.overrideHeadSha,
    readFile: opts.readFile
  });
  if (!resolved.base_sha) {
    warn(
      `AtlaSent change-brief: no base revision could be resolved for this event ("${opts.eventName}") \u2014 the brief's baseline comparison will report "not possible" rather than a fabricated diff. Pass change-brief-base-sha / change-brief-head-sha explicitly for events other than pull_request/push.`
    );
  }
  let changed_files = [];
  let changed_files_truncated = false;
  let additions_total = 0;
  let deletions_total = 0;
  let compare_url = null;
  let comparisonCollection = {
    source: "github_compare",
    state: "unavailable",
    reason: "No base revision was available, so no source comparison could be collected."
  };
  if (resolved.base_sha) {
    const compare = await fetchChangedFiles({
      repository: opts.repository,
      base_sha: resolved.base_sha,
      head_sha: resolved.head_sha,
      token,
      apiBase: opts.githubApiBase,
      fetchImpl: opts.fetchImpl
    });
    if (compare.ok) {
      changed_files = compare.files;
      changed_files_truncated = compare.truncated;
      additions_total = compare.additions_total;
      deletions_total = compare.deletions_total;
      compare_url = compare.compare_url;
      comparisonCollection = {
        source: "github_compare",
        state: compare.truncated ? "partial" : "complete",
        reason: compare.truncated ? `GitHub returned ${COMPARE_FILES_SOFT_CAP}+ changed files; the comparison may omit additional files.` : null
      };
      log(`AtlaSent change-brief: ${changed_files.length} file(s) changed (+${additions_total}/-${deletions_total}).`);
      if (compare.truncated) {
        warn(
          `AtlaSent change-brief: the changed-file list hit GitHub's compare API cap (${COMPARE_FILES_SOFT_CAP}+ files) \u2014 this diff may be incomplete.`
        );
      }
    } else {
      comparisonCollection = {
        source: "github_compare",
        state: "unavailable",
        reason: compare.error ?? "GitHub comparison could not be collected."
      };
      warn(`AtlaSent change-brief: could not read the diff (${compare.error}) \u2014 proceeding without it.`);
    }
  }
  const checksResult = await fetchCheckRuns({
    repository: opts.repository,
    ref: resolved.head_sha,
    token,
    apiBase: opts.githubApiBase,
    fetchImpl: opts.fetchImpl
  });
  if (!checksResult.ok) {
    warn(`AtlaSent change-brief: could not read check runs (${checksResult.error}) \u2014 proceeding without them.`);
  } else if (checksResult.truncated) {
    warn(
      `AtlaSent change-brief: the check-run list reached the bounded read limit (${MAX_CHECK_RUN_PAGES * CHECK_RUNS_PER_PAGE}); additional checks may exist.`
    );
  }
  const checksCollection = checksResult.ok ? {
    source: "github_check_runs",
    state: checksResult.truncated ? "partial" : "complete",
    reason: checksResult.truncated ? `The first ${MAX_CHECK_RUN_PAGES * CHECK_RUNS_PER_PAGE} check runs were collected; additional checks may exist.` : null
  } : {
    source: "github_check_runs",
    state: "unavailable",
    reason: checksResult.error ?? "GitHub check runs could not be collected."
  };
  const collection = {
    status: comparisonCollection.state === "complete" && checksCollection.state === "complete" ? "complete" : "partial",
    sources: {
      comparison: comparisonCollection,
      checks: checksCollection
    }
  };
  const facts = {
    repository: opts.repository,
    pull_request_number: resolved.pull_request_number,
    base_sha: resolved.base_sha ?? resolved.head_sha,
    head_sha: resolved.head_sha,
    ref: resolved.ref,
    environment: opts.environment,
    actor: opts.actorId,
    pr_author: resolved.pr_author,
    merge_actor: resolved.merge_actor,
    changed_files,
    changed_files_truncated,
    additions_total,
    deletions_total,
    checks: checksResult.checks,
    workflow: opts.workflow ?? null,
    rollback: opts.rollback ?? null,
    pr_url: resolved.pr_url,
    compare_url,
    retrieved_at: now
  };
  const canonicalPlanDigest = await computeGithubPlanDigest({
    repository: opts.repository,
    base_sha: resolved.base_sha ?? resolved.head_sha,
    head_sha: resolved.head_sha,
    ref: resolved.ref
  });
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${opts.apiUrl.replace(/\/$/, "")}/v1-change-brief`;
  let res;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
        ...(0, import_enforce10.functionRegionHeaders)(url)
      },
      body: JSON.stringify({
        action_type: opts.actionType,
        target_system: opts.targetSystem,
        target_id: opts.targetId,
        environment: opts.environment,
        canonical_plan_digest: canonicalPlanDigest,
        actor_id: opts.actorId,
        change_request: opts.changeRequest,
        plan_format: "git-sha",
        github_change_plan: facts
      })
    });
  } catch (err) {
    throw new ChangeBriefError(
      `Network error reaching ${url}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body.error ?? body.message ?? "";
    } catch {
    }
    throw new ChangeBriefError(`v1-change-brief responded ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  let brief;
  try {
    brief = await res.json();
  } catch {
    throw new ChangeBriefError("Could not parse JSON response from v1-change-brief");
  }
  return { facts, canonicalPlanDigest, brief, collection };
}
function buildManagementDecisionBrief(result) {
  const { brief, facts, canonicalPlanDigest, collection } = result;
  const blocking = brief.missing_evidence.filter((item) => item.blocking);
  const reviewItems = brief.missing_evidence.filter((item) => !item.blocking);
  const evidenceIncomplete = collection.status === "partial" || blocking.length > 0 || brief.classification.value === "incomplete" || brief.recommendation.value === "request_evidence";
  const nextActions = [];
  for (const source of Object.values(collection.sources)) {
    if (source.state !== "complete") {
      nextActions.push(
        `Restore or confirm ${source.source}: ${source.reason ?? "source collection is incomplete"}`
      );
    }
  }
  for (const item of blocking)
    nextActions.push(item.precise_question);
  for (const item of reviewItems)
    nextActions.push(item.precise_question);
  if (nextActions.length === 0) {
    nextActions.push(
      "Review this advisory brief, then use the separate AtlaSent evaluate/permit gate before execution."
    );
  }
  let decisionRequested;
  if (evidenceIncomplete) {
    decisionRequested = "Resolve the identified evidence gaps before relying on this brief for a management decision.";
  } else if (brief.recommendation.value === "deny" || brief.classification.value === "prohibited") {
    decisionRequested = "Review the reported prohibition; this brief cannot authorize execution or create an exception.";
  } else if (brief.recommendation.value === "escalate" || brief.classification.value === "exceptional") {
    decisionRequested = "Decide whether to route a separately authorized exception for this exact change plan.";
  } else {
    decisionRequested = "Review the recommendation and, if appropriate, continue to the separate authority gate.";
  }
  return {
    schema: "management_decision_brief.v1",
    brief_id: brief.brief_id,
    readiness: evidenceIncomplete ? "evidence_incomplete" : "ready_for_review",
    recommendation: brief.recommendation,
    classification: brief.classification,
    decision_requested: decisionRequested,
    management_summary: {
      business_rationale: brief.recommendation.rationale,
      impact: brief.impact.blast_radius_note ?? "No business-impact narrative was reported; impact remains unknown.",
      automated_analysis: {
        changed_files_observed: collection.sources.comparison.state === "unavailable" ? null : facts.changed_files.length,
        check_runs_observed: collection.sources.checks.state === "unavailable" ? null : facts.checks.length,
        material_differences: brief.material_differences.length,
        blocking_evidence_gaps: blocking.length,
        review_items: reviewItems.length,
        source_collection: collection.status
      }
    },
    next_actions: nextActions,
    evidence_binding: {
      repository: facts.repository,
      base_sha: facts.base_sha,
      head_sha: facts.head_sha,
      retrieved_at: facts.retrieved_at,
      canonical_plan_digest: canonicalPlanDigest,
      source_collection: collection.sources
    },
    authority_boundary: {
      advisory_only: true,
      separate_evaluate_and_permit_required: true
    }
  };
}
function findingLine(label, finding) {
  if (!finding)
    return `| ${label} | _not reported_ |`;
  if (finding.determination === "unavailable") {
    return `| ${label} | \u26AA Unknown \u2014 ${finding.unavailable_reason ?? "no reason given"} |`;
  }
  return `| ${label} | \`${JSON.stringify(finding.value)}\` (${finding.determination}) |`;
}
var SIGNIFICANCE_EMOJI = {
  decision_relevant: "\u{1F7E0}",
  notable: "\u{1F7E1}",
  informational: "\u26AA"
};
function renderObservedCount(value) {
  return value === null ? "Unknown \u2014 source unavailable" : String(value);
}
function renderChangeBriefStepSummary(result) {
  const { brief, facts, canonicalPlanDigest, collection } = result;
  const management = buildManagementDecisionBrief(result);
  const changedFilesObserved = management.management_summary.automated_analysis.changed_files_observed;
  const changedFilesSummary = changedFilesObserved === null ? "Unknown \u2014 GitHub comparison unavailable" : `${changedFilesObserved} (+${facts.additions_total}/-${facts.deletions_total})`;
  const lines = [
    "",
    "## \u{1F4CB} AtlaSent Management Decision Brief",
    "",
    `**Decision readiness:** \`${management.readiness}\``,
    "",
    `**Decision requested:** ${management.decision_requested}`,
    "",
    `**Recommendation:** \`${brief.recommendation.value}\` \u2014 ${brief.recommendation.rationale}`,
    "",
    "### Business translation",
    "",
    `- **Why this matters:** ${management.management_summary.business_rationale}`,
    `- **Potential impact:** ${management.management_summary.impact}`,
    "",
    "### Work AtlaSent performed automatically",
    "",
    "| Analysis | Observed result |",
    "|---|---|",
    `| Source collection | \`${management.management_summary.automated_analysis.source_collection}\` |`,
    `| Changed files compared | ${renderObservedCount(management.management_summary.automated_analysis.changed_files_observed)} |`,
    `| GitHub check runs inspected | ${renderObservedCount(management.management_summary.automated_analysis.check_runs_observed)} |`,
    `| Material differences identified | ${management.management_summary.automated_analysis.material_differences} |`,
    `| Blocking evidence gaps routed | ${management.management_summary.automated_analysis.blocking_evidence_gaps} |`,
    `| Additional review items | ${management.management_summary.automated_analysis.review_items} |`,
    "",
    "### Evidence binding",
    "",
    `| Field | Value |`,
    `|---|---|`,
    `| Brief ID | \`${brief.brief_id}\` |`,
    `| Classification | \`${brief.classification.value}\` |`,
    `| Repository | \`${facts.repository}\` |`,
    `| Base \u2192 Head | \`${facts.base_sha.slice(0, 8)}\` \u2192 \`${facts.head_sha.slice(0, 8)}\` |`,
    `| Files changed | ${changedFilesSummary} |`,
    `| Canonical plan digest | \`${canonicalPlanDigest}\` |`,
    `| Baseline comparison | ${brief.baseline.comparison_possible ? "\u2705 possible" : "\u26AA not possible"} |`
  ];
  lines.push(
    "",
    "### Source collection integrity",
    "",
    "| Source | Status | Disclosure |",
    "|---|---|---|",
    `| GitHub comparison | \`${collection.sources.comparison.state}\` | ${collection.sources.comparison.reason ?? "Collected without a known gap."} |`,
    `| GitHub check runs | \`${collection.sources.checks.state}\` | ${collection.sources.checks.reason ?? "Collected without a known gap."} |`
  );
  if (brief.material_differences.length > 0) {
    lines.push("", "### Material differences from baseline", "");
    for (const d of brief.material_differences) {
      lines.push(`- ${SIGNIFICANCE_EMOJI[d.significance] ?? "\u26AA"} **${d.kind}** (${d.significance}): ${d.description}`);
    }
  }
  const blockingMissing = brief.missing_evidence.filter((m) => m.blocking);
  const nonBlockingMissing = brief.missing_evidence.filter((m) => !m.blocking);
  if (blockingMissing.length > 0) {
    lines.push("", "### \u26D4 Blocking evidence missing", "");
    for (const m of blockingMissing)
      lines.push(`- **${m.kind}**: ${m.precise_question}`);
  }
  if (nonBlockingMissing.length > 0) {
    lines.push("", "### What needs review", "");
    for (const m of nonBlockingMissing)
      lines.push(`- **${m.kind}**: ${m.precise_question}`);
  }
  lines.push("", "### Recommended next actions", "");
  for (const action of management.next_actions)
    lines.push(`- ${action}`);
  lines.push(
    "",
    "### Impact",
    "",
    "| Field | Value |",
    "|---|---|",
    findingLine("Affected principals", brief.impact.affected_principals),
    findingLine("Affected records", brief.impact.affected_records),
    findingLine("Permissions added", brief.impact.permissions_added),
    findingLine("Data access introduced", brief.impact.data_access_introduced)
  );
  if (brief.impact.blast_radius_note) {
    lines.push("", `> ${brief.impact.blast_radius_note}`);
  }
  lines.push(
    "",
    "> This is a preparation artifact for human review. It authorizes nothing \u2014 a separate evaluate/permit step gates execution.",
    ""
  );
  return lines.join("\n");
}

// src/soloOperatorAttest.ts
var import_enforce11 = __toESM(require_dist());
var SOLO_OPERATOR_ATTEST_ACTION_TYPE = "solo_operator.attest";
var SoloOperatorAttestError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "SoloOperatorAttestError";
  }
};
function productionDeployChangePlan(verifiedSha, artifactDigest) {
  return {
    operation: "deploy",
    revision: verifiedSha,
    ...artifactDigest ? { artifact_ref: artifactDigest } : {}
  };
}
async function attestSoloOperator(args, deps = {}) {
  const resolved = {
    fetchImpl: deps.fetchImpl ?? fetch,
    env: deps.env ?? process.env,
    mask: deps.mask
  };
  if (args.actionType !== PRODUCTION_DEPLOY_ACTION && !args.evidenceProfile) {
    throw new SoloOperatorAttestError(
      `'${args.actionType}' is not production.deploy and requires an 'evidence-profile' input \u2014 a typed JSON object (see atlasent-api _shared/solo-operator-evidence-profile.ts for the supported kinds: control_override, access_grant).`
    );
  }
  let identity;
  try {
    identity = await mintGithubActionsActorIdentity(
      {
        apiUrl: args.apiUrl,
        apiKey: args.apiKey,
        actionType: SOLO_OPERATOR_ATTEST_ACTION_TYPE,
        environment: ""
      },
      resolved
    );
  } catch (error) {
    if (error instanceof WorkloadIdentityError) {
      throw new SoloOperatorAttestError(
        `Could not mint a verified actor identity for the solo-operator attestation: ${error.message}`
      );
    }
    throw error;
  }
  let changePlan;
  if (args.actionType === PRODUCTION_DEPLOY_ACTION) {
    const verifiedSha = identity.source.sha;
    if (!verifiedSha) {
      throw new SoloOperatorAttestError(
        "production.deploy requires a change_plan with a non-empty revision, but the verified GitHub workload identity did not carry a commit SHA."
      );
    }
    changePlan = productionDeployChangePlan(verifiedSha, args.artifactDigest);
  }
  const body = {
    action_class_id: args.actionClassId,
    commit_sha: args.commitSha,
    attestation_reason: args.attestationReason,
    actor_identity: identity.assertion,
    ...args.targetId ? { target_id: args.targetId } : {},
    ...args.environment ? { environment: args.environment } : {},
    ...changePlan ? { change_plan: changePlan } : {},
    ...args.evidenceProfile ? { evidence_profile: args.evidenceProfile } : {}
  };
  const apiUrl = args.apiUrl.replace(/\/+$/, "");
  let response;
  try {
    response = await resolved.fetchImpl(`${apiUrl}/v1-solo-operator-attest`, {
      method: "POST",
      headers: {
        ...(0, import_enforce11.functionRegionHeaders)(apiUrl),
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new SoloOperatorAttestError(
      `AtlaSent solo-operator attest endpoint is unreachable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const responseText = await response.text();
  if (!response.ok) {
    let detail = responseText.trim().slice(0, 300);
    try {
      const parsed2 = JSON.parse(responseText);
      const message = parsed2["error"] ?? parsed2["message"];
      if (typeof message === "string" && message.trim())
        detail = message.trim().slice(0, 300);
    } catch {
    }
    throw new SoloOperatorAttestError(
      `Solo-operator attestation was rejected (HTTP ${response.status}): ${detail || "empty response"}`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new SoloOperatorAttestError("Solo-operator attest endpoint returned non-JSON");
  }
  const attestation = parsed.attestation;
  const attestationId = typeof attestation?.["id"] === "string" ? attestation["id"] : "";
  const attestedBy = typeof attestation?.["attested_by"] === "string" ? attestation["attested_by"] : "";
  const changePlanHash = typeof attestation?.["change_plan_hash"] === "string" ? attestation["change_plan_hash"] : "";
  if (!attestationId || !attestedBy || !changePlanHash) {
    throw new SoloOperatorAttestError(
      "Solo-operator attest endpoint returned an incomplete attestation record"
    );
  }
  return { attestationId, attestedBy, changePlanHash };
}

// src/githubApprovalMint.ts
var import_enforce12 = __toESM(require_dist());
var GithubApprovalMintError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "GithubApprovalMintError";
  }
};
async function mintGithubApprovalArtifacts(args, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiUrl = args.apiUrl.replace(/\/+$/, "");
  const body = {
    evaluation_id: args.evaluationId,
    repository: args.repository,
    pull_request_number: args.pullRequestNumber,
    action_type: args.actionType,
    action_hash: args.hint.bind.action_hash,
    environment: args.hint.bind.environment,
    ...args.resourceId ? { resource_id: args.resourceId } : {}
  };
  let response;
  try {
    response = await fetchImpl(`${apiUrl}/v1-github-approval-mint`, {
      method: "POST",
      headers: {
        ...(0, import_enforce12.functionRegionHeaders)(apiUrl),
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new GithubApprovalMintError(
      `AtlaSent GitHub-approval-mint endpoint is unreachable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const responseText = await response.text();
  if (!response.ok) {
    let detail = responseText.trim().slice(0, 300);
    try {
      const parsed2 = JSON.parse(responseText);
      const message = parsed2["message"] ?? parsed2["error"];
      if (typeof message === "string" && message.trim())
        detail = message.trim().slice(0, 300);
    } catch {
    }
    throw new GithubApprovalMintError(
      `GitHub-approval-mint was rejected (HTTP ${response.status}): ${detail || "empty response"}`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new GithubApprovalMintError("GitHub-approval-mint endpoint returned non-JSON");
  }
  const reviewers = Array.isArray(parsed.reviewers) ? parsed.reviewers.filter((r) => typeof r === "string") : [];
  const artifacts = Array.isArray(parsed.artifacts) ? parsed.artifacts : [];
  if (artifacts.length === 0) {
    throw new GithubApprovalMintError("GitHub-approval-mint endpoint returned no artifacts");
  }
  return { reviewers, artifacts };
}
function buildApprovalQuorum(hint, artifacts) {
  return {
    version: "approval_quorum.v1",
    tenant_id: hint.bind.tenant_id,
    action_hash: hint.bind.action_hash,
    environment: hint.bind.environment,
    issued_at: (/* @__PURE__ */ new Date()).toISOString(),
    policy: { required_count: artifacts.length },
    approvals: artifacts
  };
}

// src/postureScan.ts
var fs4 = __toESM(require("node:fs"));
var path3 = __toESM(require("node:path"));
function defaultFs2() {
  return {
    existsSync: (p) => fs4.existsSync(p),
    readFileSync: (p, enc) => fs4.readFileSync(p, enc),
    readdirSync: (p) => fs4.readdirSync(p)
  };
}
function ghHeaders3(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}
function isWorkspaceCheckedOut(workspace, fs_) {
  return fs_.existsSync(path3.resolve(workspace, ".git"));
}
function notCheckedOutFinding(id, label) {
  return {
    id,
    label,
    observable: false,
    status: "unknown",
    reason: "workspace_not_checked_out",
    detail: "No .git directory found under the workspace \u2014 this step likely ran without a preceding `actions/checkout`, so a file genuinely being absent from the real repository cannot be distinguished from there being no checkout to look at. Add an `actions/checkout` step before posture-scan to make this observable."
  };
}
var CODEOWNERS_PATHS = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"];
var DEPENDABOT_CONFIG_PATHS = [".github/dependabot.yml", ".github/dependabot.yaml"];
function checkCodeowners(workspace, fs_) {
  const found = CODEOWNERS_PATHS.find((p) => fs_.existsSync(path3.resolve(workspace, p)));
  if (!found && !isWorkspaceCheckedOut(workspace, fs_)) {
    return notCheckedOutFinding("codeowners", "CODEOWNERS file");
  }
  return {
    id: "codeowners",
    label: "CODEOWNERS file",
    observable: true,
    status: found ? "present" : "absent",
    reason: "observed",
    detail: found ? `Found at ${found}.` : `None of the standard locations exist: ${CODEOWNERS_PATHS.join(", ")}.`,
    evidence: { checked_paths: CODEOWNERS_PATHS, found_path: found ?? null }
  };
}
function checkDependabotConfig(workspace, fs_) {
  const found = DEPENDABOT_CONFIG_PATHS.find((p) => fs_.existsSync(path3.resolve(workspace, p)));
  if (!found && !isWorkspaceCheckedOut(workspace, fs_)) {
    return notCheckedOutFinding("dependabot_config", "Dependabot config file");
  }
  return {
    id: "dependabot_config",
    label: "Dependabot config file",
    observable: true,
    status: found ? "present" : "absent",
    reason: "observed",
    detail: found ? `Found at ${found}.` : `Neither ${DEPENDABOT_CONFIG_PATHS.join(" nor ")} exists in the checked-out tree.`,
    evidence: { checked_paths: DEPENDABOT_CONFIG_PATHS, found_path: found ?? null }
  };
}
var CODEQL_USES_MARKER = /\buses:\s*["']?github\/codeql-action\//i;
function checkCodeqlWorkflow(workspace, fs_) {
  const checkedOut = isWorkspaceCheckedOut(workspace, fs_);
  const workflowsDir = path3.resolve(workspace, ".github/workflows");
  if (!fs_.existsSync(workflowsDir)) {
    if (!checkedOut) {
      return notCheckedOutFinding("codeql_workflow", "CodeQL / code-scanning workflow");
    }
    return {
      id: "codeql_workflow",
      label: "CodeQL / code-scanning workflow",
      observable: true,
      status: "absent",
      reason: "observed",
      detail: "No .github/workflows directory in the checked-out tree.",
      evidence: { workflows_dir_exists: false }
    };
  }
  let entries;
  try {
    entries = fs_.readdirSync(workflowsDir);
  } catch {
    entries = [];
  }
  const workflowFiles = entries.filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  const matches = [];
  for (const file of workflowFiles) {
    let content;
    try {
      content = fs_.readFileSync(path3.join(workflowsDir, file), "utf-8");
    } catch {
      continue;
    }
    if (CODEQL_USES_MARKER.test(content)) {
      matches.push(file);
    }
  }
  return {
    id: "codeql_workflow",
    label: "CodeQL / code-scanning workflow",
    observable: true,
    status: matches.length > 0 ? "present" : "absent",
    reason: "observed",
    detail: matches.length > 0 ? `A "uses: github/codeql-action/..." step found in: ${matches.join(", ")}.` : `Scanned ${workflowFiles.length} workflow file(s) in .github/workflows \u2014 none reference a github/codeql-action step.`,
    evidence: { workflow_files_scanned: workflowFiles, matched_files: matches }
  };
}
async function fetchRepoInfo(args) {
  const url = `${args.apiBase}/repos/${args.repository}`;
  try {
    const res = await args.fetchImpl(url, { headers: ghHeaders3(args.token) });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, message: text.slice(0, 300) };
    }
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, status: 0, message: err instanceof Error ? err.message : String(err) };
  }
}
async function fetchBranchProtection(args) {
  const url = `${args.apiBase}/repos/${args.repository}/branches/${encodeURIComponent(args.branch)}/protection`;
  let res;
  try {
    res = await args.fetchImpl(url, { headers: ghHeaders3(args.token) });
  } catch (err) {
    return { kind: "check_failed", message: err instanceof Error ? err.message : String(err) };
  }
  if (res.status === 200) {
    try {
      return { kind: "protected", data: await res.json() };
    } catch (err) {
      return { kind: "check_failed", message: `malformed protection body: ${String(err)}` };
    }
  }
  if (res.status === 403) {
    const text2 = await res.text().catch(() => "");
    return { kind: "insufficient_permission", message: text2.slice(0, 300) };
  }
  if (res.status === 404) {
    const text2 = await res.text().catch(() => "");
    if (/not protected/i.test(text2)) {
      return { kind: "unprotected" };
    }
    return { kind: "check_failed", message: text2.slice(0, 300) || "404 (ambiguous \u2014 branch not found?)" };
  }
  const text = await res.text().catch(() => "");
  return { kind: "check_failed", message: `HTTP ${res.status}: ${text.slice(0, 300)}` };
}
function branchProtectionFindings(branch, outcome) {
  if (outcome.kind === "protected") {
    const rsc = outcome.data.required_status_checks ?? null;
    const prr = outcome.data.required_pull_request_reviews ?? null;
    const branchProtection = {
      id: "branch_protection",
      label: `Branch protection (${branch})`,
      observable: true,
      status: "present",
      reason: "observed",
      detail: `Branch protection is enabled on "${branch}".`,
      evidence: {
        branch,
        enforce_admins: outcome.data.enforce_admins?.enabled ?? null,
        required_approving_review_count: prr?.required_approving_review_count ?? null,
        require_code_owner_reviews: prr?.require_code_owner_reviews ?? null,
        dismiss_stale_reviews: prr?.dismiss_stale_reviews ?? null,
        allow_force_pushes: outcome.data.allow_force_pushes?.enabled ?? null
      }
    };
    const requiredChecks = {
      id: "required_status_checks",
      label: `Required status checks (${branch})`,
      observable: true,
      status: rsc ? "present" : "absent",
      reason: "observed",
      detail: rsc ? `Required status checks configured (strict=${rsc.strict ?? false}, contexts=${(rsc.contexts ?? []).length}).` : `Branch protection is enabled on "${branch}" but no required status checks are configured.`,
      evidence: rsc ? { branch, strict: rsc.strict ?? null, contexts: rsc.contexts ?? [] } : { branch }
    };
    return [branchProtection, requiredChecks];
  }
  if (outcome.kind === "unprotected") {
    const detail2 = `Branch "${branch}" has no protection rules configured.`;
    return [
      {
        id: "branch_protection",
        label: `Branch protection (${branch})`,
        observable: true,
        status: "absent",
        reason: "observed",
        detail: detail2,
        evidence: { branch }
      },
      {
        id: "required_status_checks",
        label: `Required status checks (${branch})`,
        observable: true,
        status: "absent",
        reason: "observed",
        detail: `No branch protection on "${branch}", so no required status checks either.`,
        evidence: { branch }
      }
    ];
  }
  if (outcome.kind === "insufficient_permission") {
    const detail2 = `Reading branch protection for "${branch}" requires the "Administration" repository permission on the credential used \u2014 the default Actions GITHUB_TOKEN can NEVER hold this permission (verified against GitHub's own workflow permissions schema: "administration" is not a grantable \`permissions:\` key at all, so adding it to the workflow YAML would not help and would in fact make the workflow invalid). To observe this signal, pass a fine-grained PAT or GitHub App installation token that actually has Administration: Read access via the \`posture-scan-token\` input. GitHub responded: ${outcome.message}`;
    return [
      {
        id: "branch_protection",
        label: `Branch protection (${branch})`,
        observable: false,
        status: "unknown",
        reason: "insufficient_permission",
        detail: detail2,
        evidence: { branch }
      },
      {
        id: "required_status_checks",
        label: `Required status checks (${branch})`,
        observable: false,
        status: "unknown",
        reason: "insufficient_permission",
        detail: `Same "Administration" permission gap as branch_protection blocks this signal too.`,
        evidence: { branch }
      }
    ];
  }
  const detail = `Could not determine branch protection for "${branch}": ${outcome.message}`;
  return [
    {
      id: "branch_protection",
      label: `Branch protection (${branch})`,
      observable: false,
      status: "unknown",
      reason: "check_failed",
      detail,
      evidence: { branch }
    },
    {
      id: "required_status_checks",
      label: `Required status checks (${branch})`,
      observable: false,
      status: "unknown",
      reason: "check_failed",
      detail: "Branch protection check failed, so required-status-checks could not be derived either.",
      evidence: { branch }
    }
  ];
}
function secretScanningFindings(repoInfoResult) {
  const ids = [
    { id: "secret_scanning", label: "Secret scanning", key: "secret_scanning" },
    { id: "secret_scanning_push_protection", label: "Secret scanning push protection", key: "secret_scanning_push_protection" },
    { id: "dependabot_security_updates", label: "Dependabot security updates", key: "dependabot_security_updates" }
  ];
  if (!repoInfoResult.ok) {
    return ids.map(({ id, label }) => ({
      id,
      label,
      observable: false,
      status: "unknown",
      reason: repoInfoResult.status === 403 ? "insufficient_permission" : "check_failed",
      detail: `GET /repos/{owner}/{repo} failed (HTTP ${repoInfoResult.status || "network error"}): ${repoInfoResult.message}`
    }));
  }
  const sa = repoInfoResult.data.security_and_analysis;
  if (sa === void 0) {
    return ids.map(({ id, label }) => ({
      id,
      label,
      observable: false,
      status: "unknown",
      reason: "insufficient_permission",
      detail: "GET /repos/{owner}/{repo} succeeded, but the `security_and_analysis` field was not present in the response. GitHub only includes this field for callers with admin-level access to the repository; a default-permission GITHUB_TOKEN cannot see it under any `permissions:` grant available to a workflow (there is no such grant for repository administration access). Its absence is NOT evidence that these features are disabled. Pass a token with admin-level repo access via the `posture-scan-token` input to observe this signal."
    }));
  }
  return ids.map(({ id, label, key }) => {
    const status = sa[key]?.status;
    return {
      id,
      label,
      observable: status !== void 0,
      status: status === "enabled" ? "present" : status === "disabled" ? "absent" : "unknown",
      reason: status !== void 0 ? "observed" : "check_failed",
      detail: status !== void 0 ? `Reported status: "${status}".` : `\`security_and_analysis.${key}\` was present but carried no recognizable status.`,
      evidence: { raw_status: status ?? null }
    };
  });
}
async function fetchDependabotAlertsFinding(args) {
  const url = `${args.apiBase}/repos/${args.repository}/vulnerability-alerts`;
  const id = "dependabot_alerts_enabled";
  const label = "Dependabot alerts enabled";
  let res;
  try {
    res = await args.fetchImpl(url, { headers: ghHeaders3(args.token) });
  } catch (err) {
    return {
      id,
      label,
      observable: false,
      status: "unknown",
      reason: "check_failed",
      detail: `Network error checking vulnerability-alerts: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  if (res.status === 204) {
    return { id, label, observable: true, status: "present", reason: "observed", detail: "Dependabot alerts are enabled for this repository." };
  }
  if (res.status === 404) {
    if (!args.repoAccessible) {
      return {
        id,
        label,
        observable: false,
        status: "unknown",
        reason: "check_failed",
        detail: `GET /repos/{owner}/{repo}/vulnerability-alerts returned 404, but this same credential's GET /repos/{owner}/{repo} call did not succeed either \u2014 GitHub also returns 404 here when the repository itself is not visible to the credential (expired, misscoped, or wrong token), so this cannot be safely read as "alerts disabled" without independently confirmed repository access.`
      };
    }
    return {
      id,
      label,
      observable: true,
      status: "absent",
      reason: "observed",
      detail: "Dependabot alerts are disabled for this repository (repository visibility with this credential was independently confirmed via GET /repos/{owner}/{repo})."
    };
  }
  if (res.status === 403) {
    const text2 = await res.text().catch(() => "");
    return {
      id,
      label,
      observable: false,
      status: "unknown",
      reason: "insufficient_permission",
      detail: `Checking whether Dependabot alerts are enabled requires elevated read access this token does not have (GitHub responded 403: ${text2.slice(0, 200)}). Distinct from the dependabot_config signal, which only checks for a config FILE, not this setting.`
    };
  }
  const text = await res.text().catch(() => "");
  return {
    id,
    label,
    observable: false,
    status: "unknown",
    reason: "check_failed",
    detail: `Unexpected HTTP ${res.status} checking vulnerability-alerts: ${text.slice(0, 200)}`
  };
}
async function fetchOrg2faAndSsoFindings(args) {
  const twoFaId = "org_2fa_enforcement";
  const twoFaLabel = "Org-level 2FA enforcement";
  const ssoId = "org_sso_enforcement";
  const ssoLabel = "Org-level SSO enforcement";
  const owner = args.repository.split("/")[0] ?? "";
  const ssoFinding = {
    id: ssoId,
    label: ssoLabel,
    observable: false,
    status: args.ownerType === "User" ? "not_applicable" : "unknown",
    reason: args.ownerType === "User" ? "not_applicable" : "not_observable_by_repo_token",
    detail: args.ownerType === "User" ? `"${owner}" is a user account, not an organization \u2014 org-level SSO enforcement does not apply.` : "GitHub does not expose organization SAML SSO enforcement anywhere in the REST API (confirmed against GitHub's own published REST OpenAPI spec). It is only queryable via the Enterprise GraphQL API's samlIdentityProvider field with enterprise-owner-level credentials \u2014 independent of, and never inferred from, the org_2fa_enforcement finding above."
  };
  if (args.ownerType === "User") {
    return [
      {
        id: twoFaId,
        label: twoFaLabel,
        observable: false,
        status: "not_applicable",
        reason: "not_applicable",
        detail: `"${owner}" is a user account, not an organization \u2014 org-level 2FA enforcement does not apply.`
      },
      ssoFinding
    ];
  }
  const url = `${args.apiBase}/orgs/${encodeURIComponent(owner)}`;
  let res;
  try {
    res = await args.fetchImpl(url, { headers: ghHeaders3(args.token) });
  } catch (err) {
    return [
      {
        id: twoFaId,
        label: twoFaLabel,
        observable: false,
        status: "unknown",
        reason: "check_failed",
        detail: `Network error checking org settings: ${err instanceof Error ? err.message : String(err)}`
      },
      ssoFinding
    ];
  }
  if (res.ok) {
    let data = {};
    try {
      data = await res.json();
    } catch {
    }
    if (typeof data.two_factor_requirement_enabled === "boolean") {
      return [
        {
          id: twoFaId,
          label: twoFaLabel,
          observable: true,
          status: data.two_factor_requirement_enabled ? "present" : "absent",
          reason: "observed",
          detail: `Org 2FA requirement is ${data.two_factor_requirement_enabled ? "enabled" : "not enabled"}.`
        },
        ssoFinding
      ];
    }
    return [
      {
        id: twoFaId,
        label: twoFaLabel,
        observable: false,
        status: "unknown",
        reason: "not_observable_by_repo_token",
        detail: "GET /orgs/{org} succeeded but did not include `two_factor_requirement_enabled` \u2014 this field is only returned to an org-admin-scoped credential, which a repository-scoped GITHUB_TOKEN can never be, regardless of workflow `permissions:` settings."
      },
      ssoFinding
    ];
  }
  const text = await res.text().catch(() => "");
  return [
    {
      id: twoFaId,
      label: twoFaLabel,
      observable: false,
      status: "unknown",
      reason: "not_observable_by_repo_token",
      detail: `Org-level settings are not observable by a repository-scoped GITHUB_TOKEN under any \`permissions:\` grant a workflow can request \u2014 this is a GitHub platform limitation, not a configuration gap this workflow can close. GitHub responded HTTP ${res.status}: ${text.slice(0, 200)}`
    },
    ssoFinding
  ];
}
async function runPostureScan(opts) {
  const fs_ = opts.fileSystem ?? defaultFs2();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const warn = opts.warn ?? (() => {
  });
  const workspace = opts.workspace ?? process.env["GITHUB_WORKSPACE"] ?? process.cwd();
  const apiBase = (opts.apiBase ?? "https://api.github.com").replace(/\/+$/, "");
  const repository = opts.repository?.trim();
  const token = opts.token?.trim();
  const findings = [];
  findings.push(checkCodeowners(workspace, fs_));
  findings.push(checkDependabotConfig(workspace, fs_));
  findings.push(checkCodeqlWorkflow(workspace, fs_));
  const apiSignalIds = [
    "branch_protection",
    "required_status_checks",
    "secret_scanning",
    "secret_scanning_push_protection",
    "dependabot_security_updates",
    "dependabot_alerts_enabled",
    "org_2fa_enforcement",
    "org_sso_enforcement"
  ];
  if (!repository) {
    warn("AtlaSent Posture Scan: GITHUB_REPOSITORY not set \u2014 API-based signals cannot be checked.");
    for (const id of apiSignalIds) {
      findings.push({
        id,
        label: id,
        observable: false,
        status: "unknown",
        reason: "check_failed",
        detail: "GITHUB_REPOSITORY was not set \u2014 no repository to query."
      });
    }
    return summarize(findings);
  }
  if (!token) {
    warn(
      "AtlaSent Posture Scan: no GITHUB_TOKEN supplied \u2014 API-based signals cannot be checked. Pass `env: GITHUB_TOKEN: ${{ github.token }}` to observe them."
    );
    for (const id of apiSignalIds) {
      findings.push({
        id,
        label: id,
        observable: false,
        status: "unknown",
        reason: "no_token",
        detail: "No GITHUB_TOKEN was supplied to this step."
      });
    }
    return summarize(findings);
  }
  const repoInfoResult = await fetchRepoInfo({ repository, token, apiBase, fetchImpl });
  const defaultBranch = repoInfoResult.ok ? repoInfoResult.data.default_branch ?? "main" : "main";
  const protectionOutcome = await fetchBranchProtection({
    repository,
    branch: defaultBranch,
    token,
    apiBase,
    fetchImpl
  });
  findings.push(...branchProtectionFindings(defaultBranch, protectionOutcome));
  findings.push(...secretScanningFindings(repoInfoResult));
  findings.push(
    await fetchDependabotAlertsFinding({
      repository,
      token,
      apiBase,
      fetchImpl,
      repoAccessible: repoInfoResult.ok
    })
  );
  findings.push(
    ...await fetchOrg2faAndSsoFindings({
      repository,
      ownerType: repoInfoResult.ok ? repoInfoResult.data.owner?.type : void 0,
      token,
      apiBase,
      fetchImpl
    })
  );
  return summarize(findings);
}
function summarize(findings) {
  let observed = 0;
  let notObservable = 0;
  let present = 0;
  let absent = 0;
  let notApplicable = 0;
  for (const f of findings) {
    if (f.status === "present" || f.status === "absent")
      observed++;
    else if (f.status === "unknown")
      notObservable++;
    else if (f.status === "not_applicable")
      notApplicable++;
    if (f.status === "present")
      present++;
    if (f.status === "absent")
      absent++;
  }
  return {
    findings,
    observed_count: observed,
    not_observable_count: notObservable,
    not_applicable_count: notApplicable,
    present_count: present,
    absent_count: absent
  };
}
var STATUS_ICON = {
  present: "\u2705",
  absent: "\u26A0\uFE0F",
  unknown: "\u2753",
  not_applicable: "\u2796"
};
function renderPostureStepSummary(result) {
  const lines = [];
  lines.push("## AtlaSent Posture Scan \u2014 GitHub security posture");
  lines.push("");
  lines.push(
    "> Advisory only. Every row is either a directly observed signal or an honestly reported `unknown` \u2014 never a guess, never a synthetic score. This mode gates nothing."
  );
  lines.push("");
  lines.push("| Signal | Status | Reason | Detail |");
  lines.push("|---|---|---|---|");
  for (const f of result.findings) {
    const detail = f.detail.replace(/\|/g, "\\|").replace(/\n+/g, " ");
    lines.push(`| ${f.label} | ${STATUS_ICON[f.status]} ${f.status} | \`${f.reason}\` | ${detail} |`);
  }
  lines.push("");
  lines.push(
    `**${result.observed_count} of ${result.findings.length} signals observed** (${result.present_count} present, ${result.absent_count} absent, ${result.not_observable_count} not observable with the current token` + (result.not_applicable_count > 0 ? `, ${result.not_applicable_count} not applicable` : "") + `).`
  );
  return lines.join("\n") + "\n";
}

// src/insights.ts
var import_enforce13 = __toESM(require_dist());
async function runInsightsEvaluate(cfg, log = console) {
  try {
    const res = await fetch(
      `${cfg.apiUrl}/v1/orgs/${cfg.orgId}/insights/evaluate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
          ...(0, import_enforce13.functionRegionHeaders)(cfg.apiUrl)
        },
        body: JSON.stringify({
          subjectId: cfg.subjectId,
          sessionCount: cfg.sessionCount,
          patternScores: cfg.patternScores,
          events: cfg.events
        }),
        signal: AbortSignal.timeout(1e4)
      }
    );
    if (res.status === 403) {
      log.info("AtlaSent insights: feature flag not enabled, skipping");
      return null;
    }
    if (!res.ok) {
      log.warning(`AtlaSent insights evaluate returned ${res.status} (advisory)`);
      return null;
    }
    const result = await res.json();
    if (result.fired.length > 0) {
      log.info(
        `AtlaSent insights: ${result.fired.length} campaign(s) fired for subject "${cfg.subjectId}": ` + result.fired.map((f) => f.name).join(", ")
      );
    }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warning(`AtlaSent insights evaluate failed (advisory): ${msg}`);
    return null;
  }
}

// src/index.ts
function getApiKey() {
  const apiKey = (process.env["ATLASENT_API_KEY"] ?? "").trim();
  if (!apiKey) {
    setFailed("ATLASENT_API_KEY is required");
  }
  return apiKey;
}
function normalizeAndValidateProtectedAction(actionType) {
  const { canonical } = normalizeProtectedAction(actionType);
  if (!GATE_PERMITTED_ACTIONS.has(canonical)) {
    setOutput("decision", "error");
    setOutput("verified", "false");
    setFailed(
      `AtlaSent Gate: unsupported protected action "${actionType}". Permitted actions: ${[...GATE_PERMITTED_ACTIONS].map((a) => `"${a}"`).join(", ")} (legacy alias "${LEGACY_PRODUCTION_DEPLOY_ALIAS}" is accepted and normalized to "${PRODUCTION_DEPLOY_ACTION}").`
    );
  }
  return canonical;
}
function getInput(name, required2 = false) {
  const envKey = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  const val = (process.env[envKey] ?? "").trim();
  if (required2 && !val) {
    setFailed(`Input required and not supplied: ${name}`);
  }
  return val;
}
function setOutput(name, value) {
  const outputFile = process.env["GITHUB_OUTPUT"];
  if (outputFile) {
    const fs5 = require("node:fs");
    fs5.appendFileSync(outputFile, `${name}=${value}
`);
  }
}
function setFailed(message) {
  console.log(`::error::${message}`);
  process.exit(1);
}
function warning(message) {
  console.log(`::warning::${message}`);
}
function info(message) {
  console.log(message);
}
function maskValue(value) {
  console.log(`::add-mask::${value}`);
}
async function postCommitStatus(args) {
  const token = process.env["GITHUB_TOKEN"];
  if (!token || !args.sha || !args.repository)
    return;
  const apiBase = process.env["GITHUB_API_URL"] ?? "https://api.github.com";
  const url = `${apiBase}/repos/${args.repository}/statuses/${args.sha}`;
  const body = {
    state: args.state,
    description: args.description.slice(0, 140),
    // GitHub caps at 140 chars
    context: args.context ?? "AtlaSent Policy Gate"
  };
  if (args.targetUrl)
    body.target_url = args.targetUrl;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "<unreadable>");
      warning(`AtlaSent: commit status post failed (${res.status}): ${text}`);
    }
  } catch (err) {
    warning(
      `AtlaSent: commit status post error (advisory, non-blocking): ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
function decisionLabel(decision) {
  switch (decision) {
    case "deny":
      return "DENIED";
    case "hold":
      return "ON HOLD";
    case "escalate":
      return "ESCALATED";
    default:
      return "BLOCKED";
  }
}
async function notifySlack(webhookUrl, opts) {
  const emoji = opts.decision === "deny" ? ":no_entry:" : opts.decision === "hold" ? ":hourglass_flowing_sand:" : opts.decision === "escalate" ? ":rotating_light:" : ":warning:";
  const label = decisionLabel(opts.decision);
  const fields = [
    { type: "mrkdwn", text: `*Actor:*
${opts.actor}` },
    { type: "mrkdwn", text: `*Environment:*
${opts.environment}` }
  ];
  if (opts.evaluationId) {
    fields.push({ type: "mrkdwn", text: `*Evaluation ID:*
${opts.evaluationId}` });
  }
  if (opts.auditHash) {
    fields.push({
      type: "mrkdwn",
      text: `*Audit hash:*
\`${opts.auditHash.slice(0, 16)}\u2026\``
    });
  }
  const payload = {
    text: `${emoji} AtlaSent Deploy Gate ${label}: ${opts.action} (${opts.environment})`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `${emoji} AtlaSent: Deploy ${label}`, emoji: true }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Action:* \`${opts.action}\`
*Reason:* ${opts.reason}`
        }
      },
      { type: "section", fields },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View Run", emoji: false },
            url: opts.runUrl
          }
        ]
      }
    ]
  };
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      warning(`AtlaSent: Slack notification failed (${res.status}) \u2014 advisory, non-blocking`);
    }
  } catch (err) {
    warning(
      `AtlaSent: Slack notification error (advisory, non-blocking): ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
async function notifyTeams(webhookUrl, opts) {
  const themeColor = opts.decision === "deny" ? "D9534F" : opts.decision === "hold" ? "F0AD4E" : opts.decision === "escalate" ? "D9534F" : "808080";
  const label = decisionLabel(opts.decision);
  const facts = [
    { name: "Actor", value: opts.actor },
    { name: "Environment", value: opts.environment }
  ];
  if (opts.evaluationId) {
    facts.push({ name: "Evaluation ID", value: opts.evaluationId });
  }
  if (opts.auditHash) {
    facts.push({ name: "Audit hash", value: `${opts.auditHash.slice(0, 16)}\u2026` });
  }
  const payload = {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor,
    summary: `AtlaSent Deploy Gate ${label}: ${opts.action} (${opts.environment})`,
    sections: [
      {
        activityTitle: `AtlaSent: Deploy ${label}`,
        text: `**Action:** \`${opts.action}\`

**Reason:** ${opts.reason}`,
        facts
      }
    ],
    potentialAction: [
      {
        "@type": "OpenUri",
        name: "View Run",
        targets: [{ os: "default", uri: opts.runUrl }]
      }
    ]
  };
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      warning(`AtlaSent: Teams notification failed (${res.status}) \u2014 advisory, non-blocking`);
    }
  } catch (err) {
    warning(
      `AtlaSent: Teams notification error (advisory, non-blocking): ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
function buildGateDenyComment(opts) {
  const icon = opts.decision === "deny" ? "\u{1F534}" : opts.decision === "hold" ? "\u{1F7E1}" : opts.decision === "escalate" ? "\u{1F6A8}" : "\u274C";
  const label = decisionLabel(opts.decision);
  const lines = [
    `## ${icon} AtlaSent Deploy Gate \u2014 ${label}`,
    "",
    `The AtlaSent gate blocked \`${opts.action}\` for actor **${opts.actor}** in **${opts.environment}**.`,
    "",
    `**Decision:** \`${opts.decision}\``,
    `**Reason:** ${opts.reason}`
  ];
  if (opts.evaluationId) {
    lines.push(`**Evaluation ID:** \`${opts.evaluationId}\``);
  }
  if (opts.auditHash) {
    lines.push(`**Audit hash:** \`${opts.auditHash.slice(0, 24)}\u2026\``);
  }
  lines.push("", `[View workflow run](${opts.runUrl})`);
  if (opts.decision === "hold" || opts.decision === "escalate") {
    lines.push(
      "",
      "> **Next step:** An authorized reviewer must approve this deployment in the [AtlaSent console](https://console.atlasent.io/approvals) or via the Slack Approval Bot."
    );
  }
  return lines.join("\n");
}
async function postPRComment(args) {
  const token = process.env["GITHUB_TOKEN"];
  if (!token || !args.repository || !args.prNumber)
    return;
  const apiBase = process.env["GITHUB_API_URL"] ?? "https://api.github.com";
  const url = `${apiBase}/repos/${args.repository}/issues/${args.prNumber}/comments`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({ body: args.body })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "<unreadable>");
      warning(
        `AtlaSent: PR comment post failed (${res.status}): ${text.slice(0, 200)} \u2014 advisory, non-blocking`
      );
    }
  } catch (err) {
    warning(
      `AtlaSent: PR comment post error (advisory, non-blocking): ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
function getGitHubContext() {
  return {
    repository: process.env["GITHUB_REPOSITORY"] ?? "",
    ref: process.env["GITHUB_REF"] ?? "",
    sha: process.env["GITHUB_SHA"] ?? "",
    run_id: process.env["GITHUB_RUN_ID"] ?? "",
    run_number: process.env["GITHUB_RUN_NUMBER"] ?? "",
    workflow: process.env["GITHUB_WORKFLOW"] ?? "",
    event_name: process.env["GITHUB_EVENT_NAME"] ?? "",
    pr_number: process.env["GITHUB_REF"]?.match(/^refs\/pull\/(\d+)\//)?.[1],
    server_url: process.env["GITHUB_SERVER_URL"] ?? "https://github.com"
  };
}
function resolveEnvironment(explicit, ref, apiKey) {
  if (explicit)
    return explicit;
  if (apiKey.startsWith("ask_test_"))
    return "test";
  if (apiKey.startsWith("ask_live_"))
    return "live";
  const branch = ref.replace("refs/heads/", "");
  return branch === "main" || branch === "master" ? "live" : "test";
}
async function resolveProtectedActor(args) {
  const triggeringActorId = `github:${args.triggeringActor}`;
  const isMandatory = MANDATORY_CHANGE_CONTROL_ACTIONS.has(args.actionType) || VERIFIED_ACTOR_REQUIRED_ACTIONS.has(args.actionType);
  const isOptional = OPTIONAL_VERIFIED_ACTOR_ACTIONS.has(args.actionType);
  if (!isMandatory && !isOptional) {
    return { actorId: triggeringActorId, triggeringActorId };
  }
  try {
    const workloadIdentity = await mintGithubActionsActorIdentity(
      {
        apiUrl: args.apiUrl,
        apiKey: args.apiKey,
        actionType: args.actionType,
        environment: args.environment
      },
      { mask: maskValue }
    );
    return {
      actorId: workloadIdentity.actorId,
      triggeringActorId: `github:${workloadIdentity.source.actor}`,
      workloadIdentity
    };
  } catch (error) {
    if (isMandatory)
      throw error;
    warning(
      `AtlaSent gate: could not obtain a verified workload actor for "${args.actionType}" \u2014 falling back to the caller-supplied actor "${triggeringActorId}": ${error instanceof Error ? error.message : String(error)}`
    );
    return { actorId: triggeringActorId, triggeringActorId };
  }
}
function setDecisionOutputs(d) {
  if (d.permitToken)
    maskValue(d.permitToken);
  if (d.proofHash)
    maskValue(d.proofHash);
  setOutput("decision", d.decision);
  setOutput("permit-token", d.permitToken ?? "");
  setOutput("evaluation-id", d.evaluationId ?? "");
  setOutput("execution-hash", d.executionHashExpected ?? "");
  setOutput("proof-hash", d.proofHash ?? "");
  setOutput("risk-score", d.riskScore !== void 0 ? String(d.riskScore) : "");
  setOutput("chain-entry", JSON.stringify(d.chainEntry ?? null));
  setOutput("snapshot", JSON.stringify(d.snapshot ?? null));
  setOutput("audit-hash", d.auditHash ?? "");
}
function appendToStepSummary(content) {
  const summaryFile = process.env["GITHUB_STEP_SUMMARY"];
  if (summaryFile) {
    try {
      const fs5 = require("node:fs");
      fs5.appendFileSync(summaryFile, content);
    } catch {
    }
  }
}
function emitFinancialGovernanceAdvisory(actionType, actor, orgId) {
  const governanceMode = getInput("financial-governance");
  if (governanceMode !== "advisory")
    return;
  const rawValue = getInput("financial-action-value");
  const currency = getInput("financial-action-currency") || "USD";
  const actionValue = rawValue ? parseFloat(rawValue) : null;
  const advisoryInput = {
    actionType,
    actionValue: actionValue !== null && !isNaN(actionValue) ? actionValue : null,
    currency,
    actorId: actor,
    orgId
  };
  let advisory;
  try {
    advisory = assessFinancialGovernance(advisoryInput);
  } catch {
    warning("Financial governance advisory: assessment failed (non-fatal)");
    return;
  }
  setOutput("financial-governance-advice", JSON.stringify(advisory));
  info(`[Financial Governance Advisory] ${advisory.summary}`);
  for (const signal of advisory.signals) {
    info(`  \u2022 ${signal}`);
  }
  const tierEmoji = {
    non_financial: "\u26AA",
    low: "\u{1F7E2}",
    medium: "\u{1F7E1}",
    high: "\u{1F7E0}",
    critical: "\u{1F534}"
  };
  const emoji = tierEmoji[advisory.riskTier] ?? "\u26AA";
  const signalLines = advisory.signals.length > 0 ? advisory.signals.map((s) => `- ${s}`).join("\n") : "- No advisory signals";
  const summaryBlock = [
    "",
    "---",
    `## ${emoji} Financial Governance Advisory`,
    "",
    `| Field | Value |`,
    `|---|---|`,
    `| Risk Tier | \`${advisory.riskTier}\` |`,
    `| Risk Score | ${advisory.riskScore} / 100 |`,
    `| Evidence Required | ${advisory.evidenceRequired ? "**Yes**" : "No"} |`,
    `| Action Type | \`${actionType}\` |`,
    `| Actor | \`${actor}\` |`,
    `| Currency | ${currency} |`,
    actionValue !== null ? `| Action Value | $${actionValue.toLocaleString("en-US", { maximumFractionDigits: 2 })} |` : `| Action Value | N/A |`,
    "",
    "### Advisory Signals",
    "",
    signalLines,
    "",
    "> **Advisory only** \u2014 this assessment is non-blocking and does not affect enforcement decisions.",
    ""
  ].join("\n");
  appendToStepSummary(summaryBlock);
}
var VALID_SEVERITIES = [
  "info",
  "low",
  "medium",
  "high",
  "blocker"
];
async function runVerifyPermitStep(apiKey, apiUrl) {
  const permitToken = getInput("permit-token", true);
  const rawActionType = getInput("action", true);
  const actionType = normalizeAndValidateProtectedAction(rawActionType);
  const actor = getInput("actor") || "unknown";
  const targetId = getInput("target-id") || void 0;
  const artifactDigest = getInput("artifact-digest") || void 0;
  const runtimeExecutionHash = getInput("execution-hash") || void 0;
  const gh = getGitHubContext();
  const environment = resolveEnvironment(getInput("environment"), gh.ref, apiKey);
  let boundaryContext;
  const rawContext = getInput("context");
  if (rawContext) {
    try {
      const parsed = JSON.parse(rawContext);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("not an object");
      boundaryContext = parsed;
    } catch {
      setOutput("decision", "deny");
      setOutput("verified", "false");
      setOutput("verify-outcome", "invalid");
      setOutput("verify-error-code", "INVALID_CONTEXT");
      setFailed("Deploy blocked at execution boundary: the 'context' input is not a JSON object.");
      return;
    }
  }
  const carriedActor = OPTIONAL_VERIFIED_ACTOR_ACTIONS.has(actionType) ? getInput("resolved-actor") || void 0 : void 0;
  let actorId;
  let boundaryActorIdentity;
  if (carriedActor) {
    actorId = carriedActor;
  } else {
    let actorResolution;
    try {
      actorResolution = await resolveProtectedActor({
        apiKey,
        apiUrl,
        actionType,
        environment,
        triggeringActor: actor
      });
    } catch (error) {
      setOutput("decision", "deny");
      setOutput("verified", "false");
      setOutput("verify-outcome", "actor_unverified");
      setOutput("verify-error-code", "ACTOR_UNVERIFIED");
      setFailed(
        `Deploy blocked at execution boundary: ${error instanceof WorkloadIdentityError || error instanceof Error ? error.message : String(error)}`
      );
      return;
    }
    actorId = actorResolution.actorId;
    boundaryActorIdentity = actorResolution.workloadIdentity?.assertion;
  }
  if (MANDATORY_CHANGE_CONTROL_ACTIONS.has(actionType) && !runtimeExecutionHash) {
    setOutput("decision", "deny");
    setOutput("verified", "false");
    setOutput("verify-outcome", "invalid");
    setOutput("verify-error-code", "MISSING_BINDING");
    setFailed(
      `Deploy blocked at execution boundary: "${actionType}" requires the opaque execution-hash output from its evaluate-only gate. The raw artifact-digest is not the runtime-derived change-plan binding.`
    );
    return;
  }
  const verificationPayloadHash = MANDATORY_CHANGE_CONTROL_ACTIONS.has(actionType) ? runtimeExecutionHash : normalizeExecutionPayloadHash(artifactDigest);
  maskValue(permitToken);
  const config = {
    apiKey,
    apiUrl,
    action: actionType,
    actor: actorId,
    ...boundaryActorIdentity ? { actorIdentity: boundaryActorIdentity } : {},
    environment,
    targetId,
    executionPayloadHash: verificationPayloadHash,
    ...boundaryContext ? { context: boundaryContext } : {},
    // Boundary re-verify must re-present every binding it was given, or fail
    // closed (MISSING_BINDING) — never a silently-unbound boundary verify.
    requiredBindings: (0, import_enforce14.requiredBindingsFor)({
      environment,
      targetId,
      executionPayloadHash: verificationPayloadHash
    })
  };
  info(
    `AtlaSent boundary re-verification: "${actionType}" for "${actorId}" in ${environment}` + (artifactDigest ? ` (artifact=${artifactDigest})` : "")
  );
  try {
    const r = await (0, import_enforce14.reverifyPermit)(config, permitToken);
    setOutput("decision", "allow");
    setOutput("verified", "true");
    setOutput("verify-outcome", r.outcome ?? "verified");
    setOutput("verify-error-code", "");
    setOutput("permit-token", permitToken);
    setOutput("audit-hash", r.auditHash ?? "");
    setOutput("verify-audit-hash", r.verifyAuditHash ?? "");
    info(
      `Permit re-verified at the execution boundary (outcome=${r.outcome ?? "verified"}). Deployment may proceed.`
    );
  } catch (err) {
    setOutput("decision", "deny");
    setOutput("verified", "false");
    if (err instanceof import_enforce14.EnforceError) {
      setOutput("verify-outcome", err.outcome ?? "invalid");
      setOutput("verify-error-code", err.verifyErrorCode ?? "");
      setFailed(
        `Deploy blocked at execution boundary (outcome=${err.outcome ?? "unknown"}${err.verifyErrorCode ? `, code=${err.verifyErrorCode}` : ""}): ${err.message}`
      );
      return;
    }
    setOutput("verify-outcome", "invalid");
    setOutput("verify-error-code", "");
    setFailed(
      `Deploy blocked at execution boundary: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
async function runPostureScanStep() {
  const gh = getGitHubContext();
  const token = getInput("posture-scan-token") || process.env["GITHUB_TOKEN"] || "";
  const apiBase = process.env["GITHUB_API_URL"] ?? "https://api.github.com";
  info(`AtlaSent Posture Scan: scanning ${gh.repository || "(repository unknown)"}`);
  const result = await runPostureScan({
    repository: gh.repository,
    token,
    apiBase,
    log: info,
    warn: warning
  });
  setOutput("posture-findings", JSON.stringify(result.findings));
  setOutput("posture-observed-count", String(result.observed_count));
  setOutput("posture-not-observable-count", String(result.not_observable_count));
  setOutput("posture-not-applicable-count", String(result.not_applicable_count));
  setOutput(
    "posture-summary",
    `${result.present_count} present / ${result.absent_count} absent / ${result.not_observable_count} not observable` + (result.not_applicable_count > 0 ? ` / ${result.not_applicable_count} not applicable` : "") + ` (of ${result.findings.length} signals)`
  );
  appendToStepSummary(renderPostureStepSummary(result));
  for (const f of result.findings) {
    if (f.status === "unknown") {
      info(`Posture Scan: ${f.label} \u2014 unknown (${f.reason}): ${f.detail}`);
    } else {
      info(`Posture Scan: ${f.label} \u2014 ${f.status}: ${f.detail}`);
    }
  }
  info(
    `AtlaSent Posture Scan complete: ${result.observed_count}/${result.findings.length} signals observed. Advisory only \u2014 this step never fails the run.`
  );
}
async function runGovernanceAgentsStep(apiKey, apiUrl) {
  const slugsRaw = getInput("governance-agents", true);
  const agentSlugs = slugsRaw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (agentSlugs.length === 0) {
    setFailed("governance-agents input is empty after trimming");
    return;
  }
  const changeId = getInput("governance-change-id", true);
  const artifactFile = getInput("governance-artifact-file") || void 0;
  const failOnBlocker = getInput("governance-fail-on-blocker").toLowerCase() === "true";
  const failOnSeverityRaw = getInput("governance-fail-on-severity");
  let failOnSeverity;
  if (failOnSeverityRaw) {
    if (!VALID_SEVERITIES.includes(failOnSeverityRaw)) {
      setFailed(
        `governance-fail-on-severity must be one of ${VALID_SEVERITIES.join("|")} (got "${failOnSeverityRaw}")`
      );
      return;
    }
    failOnSeverity = failOnSeverityRaw;
  } else if (failOnBlocker) {
    failOnSeverity = "blocker";
  }
  const gh = getGitHubContext();
  info(
    `AtlaSent Governance Agents: running [${agentSlugs.join(", ")}] against change ${changeId} (commit ${gh.sha.slice(0, 8)})`
  );
  let result;
  try {
    result = await runGovernanceAgents({
      apiKey,
      apiUrl,
      changeId,
      agentSlugs,
      artifactFile,
      failOnSeverity,
      invokedBy: `github-action:${gh.repository}@${gh.sha.slice(0, 8)}`
    });
  } catch (err) {
    setOutput("governance-findings-count", "0");
    setOutput("governance-highest-severity", "");
    setOutput("governance-evaluations", "[]");
    setOutput("governance-findings", "[]");
    setFailed(
      `AtlaSent Governance Agents: ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }
  setOutput("governance-findings-count", String(result.findings.length));
  setOutput("governance-highest-severity", result.highest_severity ?? "");
  setOutput("governance-evaluations", JSON.stringify(result.evaluations));
  setOutput("governance-findings", JSON.stringify(result.findings));
  appendToStepSummary(renderStepSummary(result));
  if (result.failed) {
    setFailed(
      `Governance findings at or above severity "${failOnSeverity}" \u2014 highest emitted: ${result.highest_severity}`
    );
    return;
  }
  if (result.highest_severity) {
    warning(
      `Governance Agents: highest severity ${result.highest_severity} (advisory; not gating)`
    );
  } else {
    info("Governance Agents: no findings.");
  }
}
async function runPolicySyncStep(apiKey, apiUrl) {
  const bundlePath = getInput("policy-bundle", true);
  const source = getInput("policy-source") || "github-action";
  const dryRun = getInput("policy-dry-run").toLowerCase() !== "false";
  const gh = getGitHubContext();
  info(
    `AtlaSent Policy Sync: submitting "${bundlePath}" (source=${source}, dry_run=${dryRun}, sha=${gh.sha.slice(0, 8)})`
  );
  let result;
  try {
    result = await runPolicySync({
      apiKey,
      apiUrl,
      bundlePath,
      source,
      commitSha: gh.sha,
      ref: gh.ref,
      dryRun
    });
  } catch (err) {
    setOutput("sync-run-id", "");
    setOutput("sync-status", "error");
    setOutput("sync-diff", "");
    setOutput("sync-summary", "");
    setFailed(
      `AtlaSent Policy Sync: ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }
  const { run: run2, diff, rejected } = result;
  setOutput("sync-run-id", run2.id ?? "");
  setOutput("sync-status", run2.status);
  setOutput("sync-diff", diff);
  setOutput(
    "sync-summary",
    JSON.stringify({
      added: run2.policies_added,
      updated: run2.policies_updated,
      removed: run2.policies_removed,
      status: run2.status
    })
  );
  appendToStepSummary(
    [
      "",
      "## \u{1F4CB} AtlaSent Policy Sync",
      "",
      `| Field | Value |`,
      `|---|---|`,
      `| Run ID | \`${run2.id ?? "n/a"}\` |`,
      `| Status | \`${run2.status}\` |`,
      `| Mode | ${dryRun ? "Dry run (preview only)" : "Applied"} |`,
      `| Changes | ${diff} |`,
      `| Source | \`${source}\` |`,
      `| Ref | \`${gh.ref}\` |`,
      `| Commit | \`${gh.sha.slice(0, 8)}\` |`,
      ""
    ].join("\n")
  );
  if (rejected) {
    setFailed(
      `AtlaSent Policy Sync: bundle ${run2.status} \u2014 ${diff}. Fix policy errors and push again.`
    );
    return;
  }
  if (dryRun) {
    info(`Policy sync dry run: ${diff}`);
    info(`  Run ID: ${run2.id}`);
    info(`  Set policy-dry-run: 'false' on the default branch to apply.`);
  } else {
    info(`Policy sync applied: ${diff}`);
    info(`  Run ID: ${run2.id}`);
  }
}
async function runChangeBriefStep(apiKey, apiUrl) {
  const gh = getGitHubContext();
  const actor = getInput("actor") || "unknown";
  const environment = resolveEnvironment(getInput("environment"), gh.ref, apiKey);
  const actionType = (getInput("change-brief-action") || getInput("action") || PRODUCTION_DEPLOY_ACTION).trim();
  const targetSystem = getInput("change-brief-target-system") || "github";
  const targetId = getInput("change-brief-target-id") || getInput("target-id") || gh.repository;
  const changeRequest = getInput("change-request") || void 0;
  const consoleBaseUrl = (getInput("console-base-url") || "https://console.atlasent.io").replace(
    /\/$/,
    ""
  );
  const rollbackPreviousSha = getInput("rollback-previous-sha") || void 0;
  const rollbackWorkflow = getInput("rollback-workflow") || void 0;
  const rollbackReference = getInput("rollback-reference") || void 0;
  const rollback = rollbackPreviousSha || rollbackWorkflow || rollbackReference ? {
    previous_deployed_sha: rollbackPreviousSha ?? null,
    rollback_workflow: rollbackWorkflow ?? null,
    rollback_reference: rollbackReference ?? null
  } : void 0;
  info(
    `AtlaSent Change Brief: preparing "${actionType}" for ${targetSystem}/${targetId} (${environment}), commit ${gh.sha.slice(0, 8)}`
  );
  const clearOutputs = () => {
    setOutput("change-brief-id", "");
    setOutput("change-brief-recommendation", "");
    setOutput("change-brief-classification", "");
    setOutput("change-brief-material-differences-count", "");
    setOutput("change-brief-canonical-plan-digest", "");
    setOutput("change-brief-console-url", "");
    setOutput("change-brief-decision-readiness", "");
    setOutput("change-brief-source-collection", "");
    setOutput("change-brief-blocking-evidence-count", "");
    setOutput("change-brief-decision-brief", "");
  };
  let result;
  try {
    result = await runChangeBrief({
      apiKey,
      apiUrl,
      actionType,
      targetSystem,
      targetId,
      environment,
      actorId: `github:${actor}`,
      changeRequest,
      githubToken: process.env["GITHUB_TOKEN"],
      githubApiBase: process.env["GITHUB_API_URL"],
      repository: gh.repository,
      eventName: gh.event_name,
      eventPath: process.env["GITHUB_EVENT_PATH"],
      fallbackSha: gh.sha,
      fallbackRef: gh.ref,
      overrideBaseSha: getInput("change-brief-base-sha") || void 0,
      overrideHeadSha: getInput("change-brief-head-sha") || void 0,
      workflow: {
        name: gh.workflow,
        run_id: gh.run_id,
        run_url: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`
      },
      rollback,
      log: info,
      warn: warning
    });
  } catch (err) {
    clearOutputs();
    const message = err instanceof ChangeBriefError || err instanceof Error ? err.message : String(err);
    setFailed(`AtlaSent Change Brief: ${message}`);
    return;
  }
  const { brief, canonicalPlanDigest, collection } = result;
  const managementBrief = buildManagementDecisionBrief(result);
  setOutput("change-brief-id", brief.brief_id);
  setOutput("change-brief-recommendation", brief.recommendation.value);
  setOutput("change-brief-classification", brief.classification.value);
  setOutput("change-brief-material-differences-count", String(brief.material_differences.length));
  setOutput("change-brief-canonical-plan-digest", canonicalPlanDigest);
  setOutput("change-brief-decision-readiness", managementBrief.readiness);
  setOutput("change-brief-source-collection", collection.status);
  setOutput(
    "change-brief-blocking-evidence-count",
    String(managementBrief.management_summary.automated_analysis.blocking_evidence_gaps)
  );
  setOutput("change-brief-decision-brief", JSON.stringify(managementBrief));
  const consoleUrl = `${consoleBaseUrl}/change-brief?` + new URLSearchParams({
    action_type: actionType,
    target_system: targetSystem,
    target_id: targetId,
    environment,
    canonical_plan_digest: canonicalPlanDigest,
    actor_id: `github:${actor}`
  }).toString();
  setOutput("change-brief-console-url", consoleUrl);
  info(`  Brief ID:             ${brief.brief_id}`);
  info(`  Recommendation:       ${brief.recommendation.value}`);
  info(`  Classification:       ${brief.classification.value}`);
  info(`  Decision readiness:   ${managementBrief.readiness}`);
  info(`  Source collection:    ${collection.status}`);
  info(`  Material differences: ${brief.material_differences.length}`);
  const summary = `
## \u{1F4CB} AtlaSent Change Brief

**Decision requested:** ${managementBrief.decision_requested}

**Recommendation:** \`${brief.recommendation.value}\` \u2014 ${brief.recommendation.rationale}

### \u{1F449} [Review and decide in the AtlaSent console](${consoleUrl})

<details>
<summary>Full evidence detail (source facts, hashes, evidence binding \u2014 click to expand)</summary>

` + renderChangeBriefStepSummary(result) + "\n</details>\n\n> Note: the console page above does not yet carry this run's GitHub-sourced facts (see this action's README); the expanded detail is the full picture for those.\n";
  appendToStepSummary(summary);
  const commentEnabled = getInput("pr-comment-on-change-brief").toLowerCase() === "true";
  if (commentEnabled && gh.pr_number) {
    await postPRComment({ repository: gh.repository, prNumber: gh.pr_number, body: summary });
  }
}
async function runReleaseModeStep() {
  const cpUrl = getInput("control-plane-url", true);
  const cpToken = getInput("control-plane-token") || (process.env["ATLASENT_CP_TOKEN"] ?? "").trim();
  if (!cpToken) {
    setFailed(
      "release-mode: control-plane-token input or ATLASENT_CP_TOKEN env var is required"
    );
    return;
  }
  maskValue(cpToken);
  const targetUrl = getInput("release-target-runtime-url", true);
  const gh = getGitHubContext();
  const repo = getInput("release-repo") || gh.repository;
  const commitSha = getInput("release-commit-sha") || gh.sha;
  if (!commitSha) {
    setFailed("release-mode: commit SHA is required (set release-commit-sha or GITHUB_SHA)");
    return;
  }
  const imageDigest = getInput("release-image-digest") || void 0;
  const semver = getInput("release-semver") || void 0;
  const environment = getInput("release-environment", true);
  if (!["preview", "staging", "production"].includes(environment)) {
    setFailed(
      `release-mode: release-environment must be preview | staging | production (got "${environment}")`
    );
    return;
  }
  const failOnVerify = getInput("release-fail-on-verify").toLowerCase() !== "false";
  info(
    `AtlaSent release: registering candidate for ${repo}@${commitSha.slice(0, 8)} in ${environment} against ${targetUrl}`
  );
  let result;
  try {
    result = await registerAndVerify({
      controlPlaneUrl: cpUrl,
      controlPlaneToken: cpToken,
      targetRuntimeUrl: targetUrl,
      repo,
      commitSha,
      imageDigest,
      semver,
      environment
    });
  } catch (err) {
    setOutput("release-candidate-id", "");
    setOutput("release-runtime-status", "error");
    setOutput("release-deploy-status", "error");
    setOutput("release-runtime-result", "{}");
    setOutput("release-deploy-result", "{}");
    setFailed(
      `AtlaSent release: ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }
  setOutput("release-candidate-id", result.candidateId);
  setOutput("release-runtime-status", result.runtime.status);
  setOutput("release-deploy-status", result.deploy.status);
  setOutput("release-runtime-result", JSON.stringify(result.runtime));
  setOutput("release-deploy-result", JSON.stringify(result.deploy));
  const runtimeSummary = summarizeOutcome(result.runtime);
  const deploySummary = summarizeOutcome(result.deploy);
  info(`  Candidate: ${result.candidateId}`);
  info(`  Runtime verify: ${result.runtime.status}`);
  for (const c of result.runtime.checks) {
    info(`    \u2022 ${c.name}: ${c.status}${c.detail ? ` \u2014 ${c.detail}` : ""}`);
  }
  info(`  Deploy verify: ${result.deploy.status}`);
  for (const c of result.deploy.checks) {
    info(`    \u2022 ${c.name}: ${c.status}${c.detail ? ` \u2014 ${c.detail}` : ""}`);
  }
  appendToStepSummary(
    [
      "",
      "## \u{1F680} AtlaSent Release Candidate",
      "",
      `| Field | Value |`,
      `|---|---|`,
      `| Candidate ID | \`${result.candidateId}\` |`,
      `| Repo | \`${repo}\` |`,
      `| Commit | \`${commitSha.slice(0, 8)}\` |`,
      `| Environment | \`${environment}\` |`,
      `| Runtime verify | ${runtimeSummary.level === "passed" ? "\u2705" : runtimeSummary.level === "warned" ? "\u26A0\uFE0F" : "\u274C"} \`${result.runtime.status}\` |`,
      `| Deploy verify | ${deploySummary.level === "passed" ? "\u2705" : deploySummary.level === "warned" ? "\u26A0\uFE0F" : "\u274C"} \`${result.deploy.status}\` |`,
      ""
    ].join("\n")
  );
  if (failOnVerify && (!runtimeSummary.ok || !deploySummary.ok)) {
    const failed = [];
    if (!runtimeSummary.ok)
      failed.push(`runtime=${result.runtime.status}`);
    if (!deploySummary.ok)
      failed.push(`deploy=${result.deploy.status}`);
    setFailed(
      `AtlaSent release: verification failed (${failed.join(", ")}). Promotion should not proceed.`
    );
    return;
  }
}
async function runSoloOperatorAttestStep(apiKey, apiUrl) {
  const rawAction = getInput("action", true);
  try {
    assertValidActionType(rawAction);
  } catch (err) {
    setOutput("solo-attestation-id", "");
    setFailed(
      `AtlaSent solo-operator-attest: ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }
  const actionType = normalizeProtectedAction(rawAction).canonical;
  const actionClassId = getInput("solo-operator-action-class-id", true);
  const attestationReason = getInput("solo-operator-attestation-reason", true);
  const gh = getGitHubContext();
  const commitSha = getInput("commit-sha") || gh.sha;
  if (!commitSha) {
    setOutput("solo-attestation-id", "");
    setFailed(
      "AtlaSent solo-operator-attest: commit SHA is required (set commit-sha or GITHUB_SHA)"
    );
    return;
  }
  const targetId = getInput("target-id") || void 0;
  const environment = getInput("environment") || void 0;
  const artifactDigest = getInput("artifact-digest") || void 0;
  let evidenceProfile;
  const evidenceProfileRaw = getInput("evidence-profile");
  if (evidenceProfileRaw) {
    try {
      evidenceProfile = JSON.parse(evidenceProfileRaw);
    } catch {
      setOutput("solo-attestation-id", "");
      setFailed("AtlaSent solo-operator-attest: `evidence-profile` is not valid JSON");
      return;
    }
  }
  info(
    `AtlaSent solo-operator attest: recording evidence for ${actionType}@${commitSha.slice(0, 8)}`
  );
  let result;
  try {
    result = await attestSoloOperator(
      {
        apiUrl,
        apiKey,
        actionType,
        actionClassId,
        commitSha,
        attestationReason,
        targetId,
        environment,
        artifactDigest,
        evidenceProfile
      },
      { mask: maskValue }
    );
  } catch (err) {
    setOutput("solo-attestation-id", "");
    const msg = err instanceof SoloOperatorAttestError || err instanceof WorkloadIdentityError ? err.message : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
    setFailed(`AtlaSent solo-operator-attest: ${msg}. No attestation recorded (fail-closed).`);
    return;
  }
  setOutput("solo-attestation-id", result.attestationId);
  setOutput("solo-attested-by", result.attestedBy);
  info(`  Attestation recorded: ${result.attestationId} (attested by ${result.attestedBy})`);
}
async function runVqpVerifyStep() {
  const snapshotId = getInput("vqp-snapshot-id", true);
  const supabaseUrl = getInput("vqp-supabase-url") || (process.env["ATLASENT_SUPABASE_URL"] ?? "").trim();
  if (!supabaseUrl) {
    setFailed(
      "vqp-verify: vqp-supabase-url input or ATLASENT_SUPABASE_URL env var is required"
    );
    return;
  }
  const serviceRoleKey = getInput("vqp-service-role-key") || (process.env["ATLASENT_SUPABASE_SERVICE_ROLE_KEY"] ?? "").trim();
  if (!serviceRoleKey) {
    setFailed(
      "vqp-verify: vqp-service-role-key input or ATLASENT_SUPABASE_SERVICE_ROLE_KEY env var is required"
    );
    return;
  }
  maskValue(serviceRoleKey);
  const rerun = getInput("vqp-rerun").toLowerCase() === "true";
  const failOnDrift = getInput("vqp-fail-on-drift").toLowerCase() !== "false";
  info(
    `AtlaSent VQP verify: re-deriving snapshot ${snapshotId}` + (rerun ? " (with AI rerun)" : " (hash check only)")
  );
  const setEmptyVqpOutputs = () => {
    setOutput("vqp-hash-match", "false");
    setOutput("vqp-score-delta", "");
    setOutput("vqp-verdict-changed", "false");
    setOutput("vqp-audit-id", "");
  };
  let result;
  try {
    result = await runVqpVerify({ supabaseUrl, serviceRoleKey, snapshotId, rerun });
  } catch (err) {
    setEmptyVqpOutputs();
    setFailed(
      `AtlaSent VQP verify: ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }
  setOutput("vqp-hash-match", result.hashMatch ? "true" : "false");
  setOutput(
    "vqp-score-delta",
    result.scoreDelta !== null ? String(result.scoreDelta) : ""
  );
  setOutput("vqp-verdict-changed", result.verdictChanged ? "true" : "false");
  setOutput("vqp-audit-id", result.auditId);
  info(`  Hash match:      ${result.hashMatch}`);
  if (result.scoreDelta !== null) {
    info(`  Score delta:     ${result.scoreDelta}`);
    info(`  Verdict changed: ${result.verdictChanged}`);
  }
  info(`  Audit ID:        ${result.auditId}`);
  appendToStepSummary(
    [
      "",
      "## \u{1F9EC} AtlaSent VQP Re-Derivation Audit",
      "",
      `| Field | Value |`,
      `|---|---|`,
      `| Snapshot ID | \`${snapshotId}\` |`,
      `| Hash Match | ${result.hashMatch ? "\u2705 `true`" : "\u274C `false`"} |`,
      result.scoreDelta !== null ? `| Score Delta | \`${result.scoreDelta}\` |` : "| Score Delta | N/A (rerun not requested) |",
      result.scoreDelta !== null ? `| Verdict Changed | ${result.verdictChanged ? "\u26A0\uFE0F `true`" : "\u2705 `false`"} |` : "| Verdict Changed | N/A |",
      `| Audit ID | \`${result.auditId || "\u2014"}\` |`,
      ""
    ].join("\n")
  );
  if (!failOnDrift) {
    if (!result.hashMatch) {
      warning(
        `VQP hash mismatch for snapshot ${snapshotId} (advisory; vqp-fail-on-drift=false)`
      );
    }
    return;
  }
  if (!result.hashMatch) {
    setFailed(
      `AtlaSent VQP verify: hash mismatch for snapshot ${snapshotId} \u2014 prompt was mutated after snapshot creation (integrity violation). Investigate vqp_snapshots and vqp_audit_log for root cause.`
    );
    return;
  }
  if (result.verdictChanged) {
    setFailed(
      `AtlaSent VQP verify: verdict changed for snapshot ${snapshotId} \u2014 score drift detected (rerun verdict differs from original). Review score_delta in vqp_audit_log.`
    );
    return;
  }
  info(
    `AtlaSent VQP verify: integrity confirmed for snapshot ${snapshotId}` + (rerun ? " \u2014 no score drift" : "")
  );
}
var LEGACY_TRAJECTORY_INPUTS = [
  "trajectory-verify",
  "trajectory-permit-id",
  "trajectory-step-id",
  "trajectory-step-name",
  "trajectory-halt-on-deviation"
];
async function run() {
  const trajectoryInputsSet = LEGACY_TRAJECTORY_INPUTS.filter((name) => getInput(name) !== "");
  if (trajectoryInputsSet.length > 0) {
    setOutput("decision", "error");
    setOutput("verified", "false");
    setFailed(
      `AtlaSent Gate: trajectory-verify mode is not supported \u2014 the runtime does not implement /v1/trajectory-verify and no version of this action has ever called it. Remove ${trajectoryInputsSet.join(", ")} from this step's inputs. Use the evaluate-only + verify-permit execution-boundary pattern instead \u2014 see docs/trajectory-verify.md.`
    );
    return;
  }
  const functionRegionInput = getInput("function-region");
  try {
    if (functionRegionInput) {
      (0, import_enforce15.parseFunctionRegion)(functionRegionInput);
      process.env[import_enforce15.FUNCTION_REGION_ENV] = functionRegionInput.trim();
    } else if (process.env[import_enforce15.FUNCTION_REGION_ENV]?.trim()) {
      (0, import_enforce15.parseFunctionRegion)(process.env[import_enforce15.FUNCTION_REGION_ENV]);
    }
  } catch (err) {
    setOutput("decision", "error");
    setOutput("verified", "false");
    setFailed(`AtlaSent Gate: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  if (getInput("release-mode") === "register-and-verify") {
    await runReleaseModeStep();
    return;
  }
  if (getInput("vqp-snapshot-id")) {
    await runVqpVerifyStep();
    return;
  }
  if (getInput("posture-scan").toLowerCase() === "true") {
    await runPostureScanStep();
    return;
  }
  const apiKey = getApiKey();
  maskValue(apiKey);
  const apiUrl = getInput("api-url") || (process.env["ATLASENT_BASE_URL"] ?? "").trim() || "https://api.atlasent.io/functions/v1";
  if (!apiUrl.includes("/functions/v1")) {
    warning(
      "ATLASENT_BASE_URL does not contain '/functions/v1'. For Supabase-hosted AtlaSent instances set ATLASENT_BASE_URL to your project URL ending in /functions/v1 (e.g. https://<project-ref>.supabase.co/functions/v1). Without this suffix every API call will 404."
    );
  }
  const failOnDeny = getInput("fail-on-deny") !== "false";
  if (!failOnDeny) {
    warning(
      "Input fail-on-deny=false is deprecated for Deploy Gate V1 pilot readiness; deny/hold/escalate now fail closed."
    );
  }
  maskValue(apiKey);
  if (getInput("policy-sync").toLowerCase() === "true") {
    await runPolicySyncStep(apiKey, apiUrl);
    return;
  }
  if (getInput("governance-agents")) {
    await runGovernanceAgentsStep(apiKey, apiUrl);
    return;
  }
  if (getInput("change-brief").toLowerCase() === "true") {
    await runChangeBriefStep(apiKey, apiUrl);
    return;
  }
  if (getInput("solo-operator-attest").toLowerCase() === "true") {
    await runSoloOperatorAttestStep(apiKey, apiUrl);
    return;
  }
  if (getInput("verify-permit").toLowerCase() === "true") {
    await runVerifyPermitStep(apiKey, apiUrl);
    return;
  }
  const evaluationsRaw = getInput("evaluations");
  if (evaluationsRaw) {
    const waitForId = getInput("wait-for-id") || void 0;
    const waitTimeoutMs = parseInt(getInput("wait-timeout-ms") || "600000", 10);
    const v2Streaming = getInput("v2-streaming") === "true";
    let result;
    try {
      result = await runV21(
        {
          ATLASENT_API_KEY: apiKey,
          "INPUT_API-URL": apiUrl,
          "INPUT_FAIL-ON-DENY": failOnDeny ? "true" : "false",
          INPUT_EVALUATIONS: evaluationsRaw,
          "INPUT_WAIT-FOR-ID": waitForId,
          "INPUT_WAIT-TIMEOUT-MS": String(waitTimeoutMs)
        },
        { v2Streaming },
        { mask: maskValue }
      );
    } catch (err) {
      const msg = err instanceof import_enforce14.EnforceError || err instanceof GateInfraError || err instanceof WorkloadIdentityError ? err.message : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
      setOutput("verified", "false");
      setOutput("decisions", "[]");
      setOutput("batch-id", "");
      setFailed(`AtlaSent Gate (batch): ${msg}. Deploy blocked (fail-closed).`);
      return;
    }
    const decisionsJson = JSON.stringify(
      result.decisions.map((d2) => ({
        decision: d2.decision,
        verified: d2.verified ?? false,
        evaluationId: d2.id ?? "",
        permitToken: d2.permitToken ? "(masked)" : "",
        reasons: d2.reasons ?? [],
        verifyOutcome: d2.verifyOutcome ?? ""
      }))
    );
    const allVerified = result.decisions.every(
      (d2) => d2.decision !== "allow" || d2.verified === true
    );
    setOutput("batch-id", result.batchId);
    setOutput("decisions", decisionsJson);
    setOutput("verified", allVerified ? "true" : "false");
    if (result.failed) {
      {
        const gh2 = getGitHubContext();
        const runUrl = `${gh2.server_url}/${gh2.repository}/actions/runs/${gh2.run_id}`;
        const slackWebhook = getInput("slack-webhook");
        const teamsWebhook = getInput("teams-webhook");
        const prCommentEnabled = getInput("pr-comment-on-deny").toLowerCase() !== "false";
        const blockedDecisions = result.decisions.filter(
          (d2) => d2.decision === "deny" || d2.decision === "hold" || d2.decision === "escalate" || d2.decision === "allow" && d2.verified !== true
        );
        const worstDecision = blockedDecisions.some((d2) => d2.decision === "deny") ? "deny" : blockedDecisions.some((d2) => d2.decision === "escalate") ? "escalate" : blockedDecisions.some((d2) => d2.decision === "hold") ? "hold" : "verification_failed";
        const batchActor = getInput("actor") || "unknown";
        const batchEnv = resolveEnvironment(getInput("environment"), gh2.ref, apiKey);
        const reasonSummary = `${blockedDecisions.length} of ${result.decisions.length} evaluation(s) blocked (${worstDecision})`;
        if (slackWebhook) {
          await notifySlack(slackWebhook, {
            decision: worstDecision,
            action: "batch evaluation",
            actor: batchActor,
            environment: batchEnv,
            reason: reasonSummary,
            runUrl
          });
        }
        if (teamsWebhook) {
          await notifyTeams(teamsWebhook, {
            decision: worstDecision,
            action: "batch evaluation",
            actor: batchActor,
            environment: batchEnv,
            reason: reasonSummary,
            runUrl
          });
        }
        if (prCommentEnabled && gh2.pr_number) {
          await postPRComment({
            repository: gh2.repository,
            prNumber: gh2.pr_number,
            body: buildGateDenyComment({
              decision: worstDecision,
              reason: reasonSummary,
              action: "batch evaluation",
              actor: batchActor,
              environment: batchEnv,
              runUrl
            })
          });
        }
      }
      setFailed(
        `AtlaSent Gate: one or more evaluations were not allowed (deny/hold/escalate) or had an allow decision that failed permit verification. See 'decisions' output for details.`
      );
      return;
    }
    if (!allVerified) {
      setFailed(
        `AtlaSent Gate: one or more allow decisions failed permit verification. Deploy blocked.`
      );
      return;
    }
    info(`AtlaSent Gate: all ${result.decisions.length} evaluation(s) allowed and verified`);
    info(`  Batch ID: ${result.batchId}`);
    return;
  }
  const rawActionType = getInput("action", true);
  const actionType = normalizeAndValidateProtectedAction(rawActionType);
  const actor = getInput("actor") || "unknown";
  const targetId = getInput("target-id") || void 0;
  const explicitEnv = getInput("environment");
  let extraContext = {};
  try {
    extraContext = JSON.parse(getInput("context") || "{}");
  } catch {
    warning("Could not parse 'context' input as JSON \u2014 ignoring");
  }
  const gh = getGitHubContext();
  const environment = resolveEnvironment(explicitEnv, gh.ref, apiKey);
  const orgId = gh.repository.split("/")[0] ?? "unknown";
  let actorResolution;
  try {
    actorResolution = await resolveProtectedActor({
      apiKey,
      apiUrl,
      actionType,
      environment,
      triggeringActor: actor
    });
  } catch (error) {
    setOutput("decision", "deny");
    setOutput("verified", "false");
    setOutput("permit-issued", "false");
    setOutput("verify-outcome", "actor_unverified");
    setOutput("verify-error-code", "ACTOR_UNVERIFIED");
    setFailed(
      `AtlaSent Gate: ${error instanceof WorkloadIdentityError || error instanceof Error ? error.message : String(error)} Deploy blocked (fail-closed).`
    );
    return;
  }
  const actorId = actorResolution.actorId;
  const triggeringActorId = actorResolution.triggeringActorId;
  setOutput("resolved-actor", actorId);
  info(
    `AtlaSent Gate: evaluating "${actionType}" for actor "${actorId}" in ${environment} environment` + (targetId ? ` (target=${targetId})` : "")
  );
  const approvalsFrom = (getInput("approvals-from") || "pr-reviews").toLowerCase();
  let approvalEvidence = null;
  if (approvalsFrom === "pr-reviews") {
    approvalEvidence = await resolveApprovals({
      repository: gh.repository,
      sha: gh.sha,
      prNumber: gh.pr_number ?? null,
      token: process.env["GITHUB_TOKEN"],
      apiBase: process.env["GITHUB_API_URL"],
      log: info,
      warn: warning
    });
  }
  const approvalArtifactMintEnabled = (getInput("approval-artifact-mint") || "true").trim().toLowerCase() !== "false";
  const mintPrNumber = approvalEvidence?.pr_number ?? (gh.pr_number && /^\d+$/.test(gh.pr_number) ? parseInt(gh.pr_number, 10) : null);
  const onInsufficientApprovals = approvalsFrom === "pr-reviews" && approvalArtifactMintEnabled && mintPrNumber ? async (hint, evaluationId) => {
    if (!evaluationId) {
      warning(
        "AtlaSent Gate: the evaluate() deny carried no evaluation_id \u2014 cannot mint a bound GitHub approval artifact for it"
      );
      return void 0;
    }
    try {
      const minted = await mintGithubApprovalArtifacts({
        apiUrl,
        apiKey,
        repository: gh.repository,
        pullRequestNumber: mintPrNumber,
        actionType,
        hint,
        evaluationId,
        resourceId: targetId
      });
      info(
        `AtlaSent Gate: minted ${minted.artifacts.length} approval_artifact.v1 from GitHub PR review(s) by ${minted.reviewers.join(", ")}`
      );
      return buildApprovalQuorum(hint, minted.artifacts);
    } catch (error) {
      if (error instanceof GithubApprovalMintError) {
        warning(`AtlaSent Gate: could not mint a GitHub approval artifact: ${error.message}`);
        return void 0;
      }
      throw error;
    }
  } : void 0;
  const artifactDigest = getInput("artifact-digest") || void 0;
  const changePlanOperation = actionType.split(".").pop() || actionType;
  const productionChangePlan = MANDATORY_CHANGE_CONTROL_ACTIONS.has(actionType) ? {
    operation: changePlanOperation,
    revision: actorResolution.workloadIdentity?.source.sha ?? "",
    ...artifactDigest ? { artifact_ref: artifactDigest } : {}
  } : void 0;
  if (productionChangePlan && !productionChangePlan.revision) {
    setOutput("decision", "deny");
    setOutput("verified", "false");
    setOutput("permit-issued", "false");
    setOutput("verify-outcome", "invalid");
    setOutput("verify-error-code", "MISSING_BINDING");
    setFailed(
      `AtlaSent Gate: the verified GitHub workload identity did not carry a commit SHA, so a complete "${actionType}" change_plan cannot be derived. Deploy blocked (fail-closed).`
    );
    return;
  }
  let supplyChainAssertion;
  const supplyChainDigest = SUPPLY_CHAIN_ASSERTION_ACTIONS.has(actionType) ? normalizeArtifactDigest(artifactDigest) : null;
  if (SUPPLY_CHAIN_ASSERTION_ACTIONS.has(actionType)) {
    const failClosed = (why) => {
      setOutput("decision", "deny");
      setOutput("verified", "false");
      setOutput("permit-issued", "false");
      setOutput("verify-outcome", "assertion_unverified");
      setOutput("verify-error-code", "ASSERTION_UNVERIFIED");
      setFailed(`AtlaSent Gate: ${why} Release blocked (fail-closed).`);
    };
    if ((getInput("wait-for-approval") || "false").trim().toLowerCase() === "true") {
      failClosed(`"${actionType}" does not support \`wait-for-approval\`: its verified actor and supply_chain assertion are minted before evaluate and are not refreshed after a human wait.`);
      return;
    }
    if (!supplyChainDigest) {
      failClosed(`"${actionType}" needs \`artifact-digest\` as sha256:<64 hex> so a supply_chain assertion can be minted for it.`);
      return;
    }
    if (!targetId) {
      failClosed(`"${actionType}" needs \`target-id\` (what is being released, e.g. npm:@scope/pkg); the supply_chain assertion is bound to it.`);
      return;
    }
    try {
      supplyChainAssertion = await mintSupplyChainAssertion(
        { apiUrl, apiKey, artifactDigest: supplyChainDigest, resourceId: targetId, environment },
        { mask: maskValue }
      );
    } catch (error) {
      failClosed(error instanceof Error ? error.message : String(error));
      return;
    }
  }
  const directExecutionPayloadHash = MANDATORY_CHANGE_CONTROL_ACTIONS.has(actionType) ? void 0 : normalizeExecutionPayloadHash(artifactDigest);
  let evidenceProfile;
  const evidenceProfileRaw = getInput("evidence-profile") || void 0;
  if (evidenceProfileRaw) {
    try {
      evidenceProfile = JSON.parse(evidenceProfileRaw);
    } catch {
      setOutput("decision", "deny");
      setOutput("verified", "false");
      setFailed("AtlaSent Gate: `evidence-profile` is not valid JSON");
      return;
    }
  }
  const evaluateOnly = (getInput("mode") || "enforce").trim().toLowerCase() === "evaluate-only";
  const waitForApprovalInput = (getInput("wait-for-approval") || "false").trim().toLowerCase() === "true";
  const maxWaitMinutesRaw = parseInt(getInput("max-wait-minutes") || "30", 10);
  const maxWaitMinutes = Number.isFinite(maxWaitMinutesRaw) && maxWaitMinutesRaw > 0 ? maxWaitMinutesRaw : 30;
  const maxWaitMs = maxWaitMinutes * 6e4;
  const soloOperatorContext = (getInput("solo-operator-context") || "false").trim().toLowerCase() === "true";
  const config = {
    apiKey,
    apiUrl,
    action: actionType,
    actor: actorId,
    actorIdentity: actorResolution.workloadIdentity?.assertion,
    ...supplyChainAssertion ? { assertions: [supplyChainAssertion], resourceId: targetId } : {},
    environment,
    targetId,
    changePlan: productionChangePlan,
    evidenceProfile,
    onInsufficientApprovals,
    // Canonical artifact binding — the runtime binds this into the permit and
    // re-checks it at verify time (artifact-substitution defense).
    executionPayloadHash: directExecutionPayloadHash,
    // Re-present every binding provided here at verify, or fail closed
    // (MISSING_BINDING) rather than silently drop it.
    requiredBindings: (0, import_enforce14.requiredBindingsFor)({
      environment,
      targetId,
      executionPayloadHash: directExecutionPayloadHash
    }),
    // state_snapshot is required for all action classes (requires_state_snapshot=true).
    // Auto-populate from GitHub Actions context; callers can override via the context input.
    state_snapshot: {
      source: "github-actions",
      complete: true,
      run_id: gh.run_id
    },
    context: {
      source: "github-action",
      // The operator's `context` input is spread FIRST so it can supply
      // arbitrary additional fields (target-specific business context, e.g.
      // `financial-action-value`), but every key below is applied AFTER it
      // and therefore always wins. Those keys are either read directly from
      // the GitHub Actions environment (repository/ref/sha/workflow/run_id/
      // ...) or, for `approvals`/`approving_reviewers`, derived from a live
      // GitHub API call to the PR's actual review state. A caller writing
      // `context: '{"approvals": 999}'` or `context: '{"ref": "..."}'` in
      // their workflow YAML must NOT be able to shadow these — self-asserting
      // a verified fact defeats the entire point of deriving it. Do not
      // reorder this spread; a prior version had `...extraContext` last,
      // which silently let operator-supplied context override the real
      // PR-review-derived approval count (and repository/ref/sha/workflow)
      // for every caller of this action.
      ...extraContext,
      // The digest the supply_chain assertion vouches for; applied after the
      // operator's context so it cannot be shadowed by a different value.
      ...supplyChainDigest ? { artifact_digest: supplyChainDigest } : {},
      repository: gh.repository,
      ref: gh.ref,
      sha: gh.sha,
      workflow: gh.workflow,
      run_id: gh.run_id,
      run_number: gh.run_number,
      event_name: gh.event_name,
      // Human provenance is deliberately separate from the authorizing
      // workload principal. For production.deploy this value comes from the
      // broker's signature-verified GitHub OIDC `actor` claim when present.
      triggering_actor: triggeringActorId,
      pr_number: approvalEvidence?.pr_number ?? gh.pr_number ?? null,
      run_url: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`,
      // Verified approval evidence from PR reviews. Only present (and only
      // overrides) when approvals-from: pr-reviews actually consulted the
      // API; in approvals-from: none mode, an operator-supplied `approvals`
      // in `context` is intentionally honored (the operator has opted out
      // of automatic verification and is expected to source evidence some
      // other way, e.g. a separate approval-artifact integration).
      ...approvalEvidence && approvalEvidence.source === "pr-reviews" ? {
        approvals: approvalEvidence.approvals,
        approving_reviewers: approvalEvidence.approving_reviewers
      } : {},
      ...soloOperatorContext ? { solo_operator_compensating_control: {} } : {}
    }
  };
  async function reportEnforceFailure(err) {
    {
      if (err.decision) {
        setDecisionOutputs(err.decision);
      } else {
        setOutput("decision", "error");
        setOutput("permit-token", "");
        setOutput("evaluation-id", "");
        setOutput("proof-hash", "");
        setOutput("risk-score", "");
        setOutput("chain-entry", JSON.stringify(null));
        setOutput("snapshot", JSON.stringify(null));
        setOutput("audit-hash", "");
      }
      setOutput("verified", "false");
      setOutput("permit-issued", "false");
      setOutput("verify-outcome", err.outcome ?? "");
      setOutput("verify-error-code", err.verifyErrorCode ?? "");
      setOutput("evidence-receipt", JSON.stringify(null));
      setOutput("evidence-bundle", JSON.stringify(null));
      {
        const decision = err.decision?.decision;
        let statusState = "error";
        let statusDesc = `AtlaSent: gate error \u2014 ${err.message.slice(0, 100)}`;
        if (decision === "deny") {
          statusState = "failure";
          statusDesc = `AtlaSent: denied \u2014 ${err.decision?.denyReason ?? err.decision?.denyCode ?? actionType}`.slice(0, 140);
        } else if (decision === "hold") {
          statusState = "pending";
          statusDesc = `AtlaSent: on hold \u2014 awaiting approval (${actionType})`;
        } else if (decision === "escalate") {
          statusState = "pending";
          statusDesc = `AtlaSent: escalated \u2014 manual review required (${actionType})`;
        }
        await postCommitStatus({
          repository: gh.repository,
          sha: gh.sha,
          state: statusState,
          description: statusDesc,
          targetUrl: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`
        });
      }
      emitFinancialGovernanceAdvisory(actionType, actorId, orgId);
      {
        const slackWebhook = getInput("slack-webhook");
        const teamsWebhook = getInput("teams-webhook");
        const runUrl = `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`;
        const decisionStr = err.decision?.decision ?? "error";
        const isActionable = decisionStr === "deny" || decisionStr === "hold" || decisionStr === "escalate";
        const reason = decisionStr === "deny" ? (0, import_enforce14.denyReasonText)(err.decision) : decisionStr === "hold" ? err.decision?.holdReason ?? "awaiting approval" : decisionStr === "escalate" ? "escalated \u2014 manual review required" : err.message.slice(0, 200);
        if (slackWebhook && isActionable) {
          await notifySlack(slackWebhook, {
            decision: decisionStr,
            action: actionType,
            actor: actorId,
            environment,
            reason,
            runUrl,
            evaluationId: err.decision?.evaluationId,
            auditHash: err.decision?.auditHash
          });
        }
        if (teamsWebhook && isActionable) {
          await notifyTeams(teamsWebhook, {
            decision: decisionStr,
            action: actionType,
            actor: actorId,
            environment,
            reason,
            runUrl,
            evaluationId: err.decision?.evaluationId,
            auditHash: err.decision?.auditHash
          });
        }
        const prCommentEnabled = getInput("pr-comment-on-deny").toLowerCase() !== "false";
        if (prCommentEnabled && gh.pr_number && isActionable) {
          await postPRComment({
            repository: gh.repository,
            prNumber: gh.pr_number,
            body: buildGateDenyComment({
              decision: decisionStr,
              reason,
              action: actionType,
              actor: actorId,
              environment,
              runUrl,
              evaluationId: err.decision?.evaluationId,
              auditHash: err.decision?.auditHash
            })
          });
        }
      }
      {
        const blockedDecision = err.decision?.decision;
        const summaryOutcome = blockedDecision === "deny" || blockedDecision === "hold" || blockedDecision === "escalate" ? blockedDecision : "error";
        const summaryReason = summaryOutcome === "deny" ? err.decision?.denyReason || err.decision?.denyCode ? (0, import_enforce14.denyReasonText)(err.decision) : err.message : summaryOutcome === "hold" ? err.decision?.holdReason ?? "awaiting approval" : summaryOutcome === "escalate" ? "manual review required" : err.message;
        appendToStepSummary(
          buildGateStepSummary({
            outcome: summaryOutcome,
            action: actionType,
            actor: actorId,
            environment,
            targetId,
            runUrl: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`,
            reason: summaryReason,
            denyCode: err.decision?.denyCode,
            remediation: err.decision?.remediation,
            evaluationId: err.decision?.evaluationId,
            auditHash: err.decision?.auditHash,
            riskScore: err.decision?.riskScore,
            riskClass: err.decision?.risk_class
          })
        );
      }
      switch (err.phase) {
        case "evaluate":
          setFailed(
            `AtlaSent Gate: ${err.message}. Deploy blocked \u2014 the gate cannot confirm authorization (fail-closed).`
          );
          break;
        case "verify":
          switch (err.decision?.decision) {
            case "deny":
              setFailed(
                `Authorization DENIED: ${(0, import_enforce14.denyReasonText)(err.decision)}`
              );
              break;
            case "hold":
              setFailed(
                `Authorization on HOLD: ${err.decision.holdReason ?? "awaiting approval"}`
              );
              break;
            case "escalate":
              setFailed("Authorization ESCALATED \u2014 manual review required");
              break;
            default:
              setFailed(`Unexpected decision from AtlaSent: ${err.decision?.decision ?? "unknown"}`);
          }
          break;
        case "verify-permit":
          setFailed(
            `AtlaSent Gate: ${err.message}. Deploy blocked (fail-closed).`
          );
          break;
        default:
          setFailed(`AtlaSent Gate: ${err.message}`);
      }
    }
  }
  let claimActorIdentity;
  const buildMandatoryClaimBody = async (row) => {
    if (!productionChangePlan) {
      throw new Error(`no change plan was derived for "${actionType}"`);
    }
    if (row.claimEnvironment != null && row.claimEnvironment !== environment) {
      throw new Error(
        `the approval must be claimed for environment "${row.claimEnvironment}", but this gate evaluated "${environment}"`
      );
    }
    const claimer = await resolveProtectedActor({
      apiKey,
      apiUrl,
      actionType,
      environment,
      triggeringActor: actor
    });
    if (!claimer.workloadIdentity) {
      throw new Error("no verified workload identity could be minted for the claim");
    }
    claimActorIdentity = claimer.workloadIdentity.assertion;
    if (claimer.actorId !== actorId) {
      throw new Error(
        `the re-minted actor "${claimer.actorId}" is not the actor that was evaluated ("${actorId}")`
      );
    }
    return {
      actor_identity: claimer.workloadIdentity.assertion,
      change_plan: productionChangePlan
    };
  };
  setOutput("waited-for-approval", "false");
  let enforceResult;
  try {
    if (evaluateOnly) {
      const decision = await (0, import_enforce14.evaluate)(config);
      (0, import_enforce14.verify)(decision);
      enforceResult = { result: void 0, decision, verifyOutcome: void 0 };
    } else {
      enforceResult = await (0, import_enforce14.enforce)(config, async () => {
      });
    }
  } catch (err) {
    if (err instanceof import_enforce14.EnforceError) {
      const canWaitForApproval = waitForApprovalInput && err.phase === "verify" && (err.decision?.decision === "hold" || err.decision?.decision === "escalate") && !!err.decision?.approvalRequestId;
      if (!canWaitForApproval) {
        await reportEnforceFailure(err);
        return;
      }
      setOutput("waited-for-approval", "true");
      const originalDecision = err.decision;
      info(
        `AtlaSent Gate: authorization ${originalDecision.decision.toUpperCase()} \u2014 waiting up to ${maxWaitMinutes}m for a human decision (approval_request_id=${originalDecision.approvalRequestId}).`
      );
      let resolution;
      try {
        resolution = await (0, import_enforce14.waitForApprovalResolution)({
          apiKey,
          apiUrl,
          approvalId: originalDecision.approvalRequestId,
          maxWaitMs,
          // Mandatory change-control actions claim with the EXECUTOR's own,
          // freshly minted verified identity and the SAME change plan sent
          // at evaluate, so the runtime's claim-time reevaluation binds the
          // permit to this executor and this plan (a changed plan answers
          // 409 change_plan_mismatch). Approval alone never authorizes
          // execution: nothing is minted until this claim runs. Every other
          // action keeps the legacy `{}` claim, unchanged.
          ...MANDATORY_CHANGE_CONTROL_ACTIONS.has(actionType) ? { buildClaimBody: buildMandatoryClaimBody } : {}
        });
      } catch (waitErr) {
        await reportEnforceFailure(
          waitErr instanceof import_enforce14.EnforceError ? new import_enforce14.EnforceError(waitErr.message, "evaluate", originalDecision) : new import_enforce14.EnforceError(
            `Approval wait failed: ${waitErr instanceof Error ? waitErr.message : String(waitErr)}`,
            "evaluate",
            originalDecision
          )
        );
        return;
      }
      if (resolution.status !== "approved" && resolution.status !== "approved_awaiting_claim" || !resolution.permitToken) {
        const reason = (resolution.claimFailure === "change_plan_mismatch" ? `human approval resolved to '${resolution.status}', but the claim was refused: the change plan presented at claim differs from the plan that was approved (change_plan_mismatch)` : `human approval resolved to '${resolution.status}'` + (resolution.claimFailure ? ` (permit claim failed: ${resolution.claimFailure})` : "")) + (resolution.reEvaluationDecision ? ` (fresh reevaluation: ${resolution.reEvaluationDecision})` : "") + " \u2014 deploy blocked (fail-closed).";
        await reportEnforceFailure(
          new import_enforce14.EnforceError(`Authorization DENIED: ${reason}`, "verify", {
            ...originalDecision,
            decision: "deny",
            denyReason: reason
          })
        );
        return;
      }
      if (MANDATORY_CHANGE_CONTROL_ACTIONS.has(actionType) && !resolution.executionHashExpected) {
        const reason = "human approval was granted and a permit was claimed, but the claim response carried no execution_hash_expected, so the permit cannot be verified against its bound change plan \u2014 deploy blocked (fail-closed).";
        await reportEnforceFailure(
          new import_enforce14.EnforceError(`Authorization DENIED: ${reason}`, "verify", {
            ...originalDecision,
            decision: "deny",
            denyReason: reason
          })
        );
        return;
      }
      const freshDecision = {
        ...originalDecision,
        decision: "allow",
        permitToken: resolution.permitToken,
        executionHashExpected: resolution.executionHashExpected,
        ...resolution.reEvaluationId ? { evaluationId: resolution.reEvaluationId } : {}
      };
      if (evaluateOnly) {
        info(
          "AtlaSent Gate: human approval resolved \u2014 permit CLAIMED (not verified or consumed). Re-verify it at the execution boundary."
        );
        enforceResult = { result: void 0, decision: freshDecision, verifyOutcome: void 0 };
      } else {
        let vr;
        try {
          vr = await (0, import_enforce14.verifyPermit)(
            claimActorIdentity ? { ...config, actorIdentity: claimActorIdentity } : config,
            freshDecision
          );
        } catch (verifyErr) {
          await reportEnforceFailure(
            verifyErr instanceof import_enforce14.EnforceError ? new import_enforce14.EnforceError(
              `Human approval was granted, but the claimed permit failed verification: ${verifyErr.message}`,
              "verify-permit",
              freshDecision,
              {
                outcome: verifyErr.outcome,
                verifyErrorCode: verifyErr.verifyErrorCode,
                mismatchFields: verifyErr.mismatchFields
              }
            ) : new import_enforce14.EnforceError(
              `Human approval was granted, but verifying the claimed permit failed: ${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}`,
              "verify-permit",
              freshDecision
            )
          );
          return;
        }
        if (!vr.verified) {
          await reportEnforceFailure(
            new import_enforce14.EnforceError(
              `Human approval was granted, but the fresh permit failed verification (${vr.outcome ?? "unknown"}) \u2014 deploy blocked (fail-closed).`,
              "verify-permit",
              freshDecision,
              { outcome: vr.outcome, verifyErrorCode: vr.verifyErrorCode, mismatchFields: vr.mismatchFields }
            )
          );
          return;
        }
        info(
          `AtlaSent Gate: human approval resolved ALLOW \u2014 fresh permit verified (${vr.outcome ?? "verified"}). Proceeding.`
        );
        enforceResult = { result: void 0, decision: freshDecision, verifyOutcome: vr.outcome };
      }
    } else {
      setOutput("decision", "error");
      setOutput("permit-token", "");
      setOutput("evaluation-id", "");
      setOutput("proof-hash", "");
      setOutput("risk-score", "");
      setOutput("chain-entry", JSON.stringify(null));
      setOutput("snapshot", JSON.stringify(null));
      setOutput("audit-hash", "");
      setOutput("verified", "false");
      setOutput("permit-issued", "false");
      setOutput("evidence-receipt", JSON.stringify(null));
      setOutput("evidence-bundle", JSON.stringify(null));
      await postCommitStatus({
        repository: gh.repository,
        sha: gh.sha,
        state: "error",
        description: `AtlaSent: unexpected error \u2014 ${(err instanceof Error ? err.message : String(err)).slice(0, 100)}`,
        targetUrl: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`
      });
      emitFinancialGovernanceAdvisory(actionType, actorId, orgId);
      appendToStepSummary(
        buildGateStepSummary({
          outcome: "error",
          action: actionType,
          actor: actorId,
          environment,
          targetId,
          runUrl: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`,
          reason: err instanceof Error ? err.message : String(err)
        })
      );
      setFailed(
        `AtlaSent Gate: Unexpected error: ${err instanceof Error ? err.message : String(err)}`
      );
      return;
    }
  }
  const { decision: d, verifyOutcome } = enforceResult;
  if (evaluateOnly) {
    setDecisionOutputs(d);
    setOutput("verified", "false");
    setOutput("permit-issued", d.permitToken ? "true" : "false");
    setOutput("verify-outcome", "");
    setOutput("verify-error-code", "");
    if (!d.permitToken) {
      await postCommitStatus({
        repository: gh.repository,
        sha: gh.sha,
        state: "error",
        description: `AtlaSent: allow without permit (evaluate-only) \u2014 ${actionType}`.slice(0, 140),
        targetUrl: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`
      });
      setFailed(
        "AtlaSent Gate (evaluate-only): evaluate returned allow but no permit_token was issued \u2014 there is nothing to re-verify at the execution boundary. Deploy blocked (fail-closed)."
      );
      return;
    }
    const boundaryBindingGuidance = MANDATORY_CHANGE_CONTROL_ACTIONS.has(actionType) ? "this step's `execution-hash` output" : "the SAME `artifact-digest` (when one was evaluated)";
    warning(
      "AtlaSent Gate: evaluate-only mode \u2014 a permit was ISSUED but NOT verified or consumed. The single-use permit is consumed at the EXECUTION BOUNDARY. Add a second AtlaSent step with `verify-permit: true`, this step's `permit-token` output, and " + boundaryBindingGuidance + ", then gate the protected step on THAT step's `verified == 'true'`. Do NOT gate the deploy on this step's `decision` or `permit-issued` \u2014 neither proves the artifact/environment were re-bound at the boundary."
    );
    await postCommitStatus({
      repository: gh.repository,
      sha: gh.sha,
      state: "pending",
      description: `AtlaSent: permit issued (evaluate-only) \u2014 re-verify at boundary (${actionType})`.slice(0, 140),
      targetUrl: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`
    });
    appendToStepSummary(
      [
        "",
        "---",
        "## \u{1F7E6} AtlaSent Deploy Gate \u2014 PERMIT ISSUED (evaluate-only)",
        "",
        `A permit was **issued** for \`${actionType}\` by **${actorId}** in **${environment}**, but has **not** been verified or consumed. It must be re-verified at the execution boundary before the protected step runs.`,
        "",
        `| Field | Value |`,
        `|---|---|`,
        `| Decision | \`${d.decision}\` |`,
        "| Verified | `false` \u2014 re-verify at the boundary |",
        "| Permit | issued (single-use, unconsumed) |",
        `| Action | \`${actionType}\` |`,
        `| Actor | \`${actorId}\` |`,
        `| Environment | \`${environment}\` |`,
        ...targetId ? [`| Target | \`${targetId}\` |`] : [],
        ...d.evaluationId ? [`| Evaluation ID | \`${d.evaluationId}\` |`] : [],
        "",
        "> **Next step:** add an AtlaSent step with `verify-permit: true`, `permit-token: ${{ steps.<this-step>.outputs.permit-token }}`, and " + boundaryBindingGuidance + ", then gate the deploy on that step's `verified == 'true'`.",
        `[View workflow run](${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id})`,
        ""
      ].join("\n")
    );
    info(
      `Authorization EVALUATED (permit issued, NOT yet verified). Re-verify at the execution boundary (verify-permit: true). Evaluation: ${d.evaluationId ?? ""}`
    );
    emitFinancialGovernanceAdvisory(actionType, actorId, orgId);
    return;
  }
  setDecisionOutputs(d);
  setOutput("verified", "true");
  setOutput("permit-issued", "true");
  setOutput("verify-outcome", verifyOutcome ?? "verified");
  setOutput("verify-error-code", "");
  await postCommitStatus({
    repository: gh.repository,
    sha: gh.sha,
    state: "success",
    description: `AtlaSent: authorized \u2014 ${actionType}`,
    targetUrl: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`
  });
  info(`Authorization GRANTED (evaluate + verify)`);
  info(`  Permit token: (set as 'permit-token' output, masked in logs)`);
  info(`  Proof hash:   (set as 'proof-hash' output, masked in logs)`);
  info(`  Evaluation:   ${d.evaluationId ?? ""}`);
  if (d.riskScore !== void 0)
    info(`  Risk score:   ${d.riskScore}`);
  info(`  Verify:       ${verifyOutcome ?? "verified"}`);
  let evidenceReceiptId;
  try {
    const receiptSigningSecret = process.env["ATLASENT_RECEIPT_SIGNING_SECRET"];
    const receiptSigningKeyId = getInput("receipt-signing-key-id");
    const runUrl = `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`;
    const bundle = buildEvidenceBundle({
      evaluationId: d.evaluationId ?? "",
      permitToken: d.permitToken ?? "",
      auditHash: d.auditHash,
      action: actionType,
      actor: actorId,
      environment,
      repository: gh.repository,
      sha: gh.sha,
      runId: gh.run_id,
      runUrl,
      signingSecret: receiptSigningSecret || void 0,
      signingKeyId: receiptSigningKeyId || void 0
    });
    setOutput("evidence-receipt", JSON.stringify(bundle.receipt));
    setOutput("evidence-bundle", JSON.stringify(bundle));
    evidenceReceiptId = bundle.receipt.receipt_id;
    info(
      `  Evidence:     receipt=${bundle.receipt.receipt_id} algorithm=${bundle.receipt.algorithm}`
    );
  } catch (bundleErr) {
    warning(
      `AtlaSent: evidence bundle build failed (advisory; gate decision unaffected): ${bundleErr instanceof Error ? bundleErr.message : String(bundleErr)}`
    );
    setOutput("evidence-receipt", JSON.stringify(null));
    setOutput("evidence-bundle", JSON.stringify(null));
  }
  appendToStepSummary(
    buildGateStepSummary({
      outcome: "allow",
      action: actionType,
      actor: actorId,
      environment,
      targetId,
      runUrl: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`,
      verified: true,
      verifyOutcome,
      evaluationId: d.evaluationId,
      auditHash: d.auditHash,
      riskScore: d.riskScore,
      riskClass: d.risk_class,
      permitIssued: !!d.permitToken,
      evidenceReceiptId
    })
  );
  if (d.permitToken && d.evaluationId) {
    await emitEvidenceEvent(
      { apiKey, apiUrl },
      {
        event_type: "execution_started",
        permit_token: d.permitToken,
        evaluation_id: d.evaluationId,
        environment,
        execution_started_at: (/* @__PURE__ */ new Date()).toISOString(),
        metadata: {
          source: "github-action",
          repository: gh.repository,
          ref: gh.ref,
          sha: gh.sha,
          workflow: gh.workflow,
          run_id: gh.run_id,
          run_url: `${gh.server_url}/${gh.repository}/actions/runs/${gh.run_id}`,
          action: actionType,
          actor: actorId
        }
      },
      { info, warning }
    );
  }
  emitFinancialGovernanceAdvisory(actionType, actorId, orgId);
  await runPostDeployEvidenceBundleStep(apiKey, apiUrl, orgId, actorId);
  await runInsightsStep(apiKey, apiUrl, actorId);
}
async function runPostDeployEvidenceBundleStep(apiKey, apiUrl, orgId, actorId) {
  const bundleInput = getInput("evidence-bundle").toLowerCase();
  const setEmptyBundleOutputs = () => {
    setOutput("evidence-bundle-sha256", "");
    setOutput("evidence-bundle-id", "");
  };
  if (!bundleInput || bundleInput === "false") {
    setEmptyBundleOutputs();
    return;
  }
  const regime = bundleInput === "true" ? "soc2_type_ii" : bundleInput;
  if (!VALID_EVIDENCE_REGIMES.has(regime)) {
    warning(
      `AtlaSent evidence-bundle: unrecognized regime "${regime}". Expected one of: ${Array.from(VALID_EVIDENCE_REGIMES).join(", ")}. Skipping.`
    );
    setEmptyBundleOutputs();
    return;
  }
  const rawDays = getInput("evidence-bundle-days") || "90";
  const days = parseInt(rawDays, 10);
  if (Number.isNaN(days) || days < 1) {
    warning(
      `AtlaSent evidence-bundle: evidence-bundle-days must be a positive integer (got "${rawDays}"). Skipping.`
    );
    setEmptyBundleOutputs();
    return;
  }
  info(
    `AtlaSent evidence-bundle: generating ${regime} bundle (${days}-day window) for org ${orgId}`
  );
  const result = await callPostDeployEvidenceBundle(
    { apiUrl, apiKey, orgId, regime, days, actor: actorId },
    { info, warning }
  );
  setOutput("evidence-bundle-sha256", result.sha256);
  setOutput("evidence-bundle-id", result.exportId);
  if (result.sha256) {
    info(`AtlaSent evidence-bundle: bundle_sha256=${result.sha256}`);
  }
}
async function runInsightsStep(apiKey, apiUrl, actorId) {
  const orgId = getInput("insights-org-id");
  const setEmptyInsightsOutputs = () => {
    setOutput("insights-fired", JSON.stringify([]));
    setOutput("insights-skipped", JSON.stringify([]));
  };
  if (!orgId) {
    setEmptyInsightsOutputs();
    return;
  }
  const subjectId = getInput("insights-subject-id") || actorId;
  const rawSessionCount = getInput("insights-session-count");
  let sessionCount;
  if (rawSessionCount) {
    const parsed = parseInt(rawSessionCount, 10);
    sessionCount = Number.isNaN(parsed) ? void 0 : parsed;
  }
  const result = await runInsightsEvaluate(
    { apiKey, apiUrl, orgId, subjectId, sessionCount },
    { info, warning }
  );
  if (!result) {
    setEmptyInsightsOutputs();
    return;
  }
  setOutput("insights-fired", JSON.stringify(result.fired));
  setOutput("insights-skipped", JSON.stringify(result.skipped));
}
if (require.main === module) {
  run().catch((err) => {
    console.log(`::error::Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  run
});
