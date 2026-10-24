# Sudibran Backend — FastAPI Endpoint Plan

How we build the real backend behind `frontend`, in what order, and with which endpoints.
Frontend wiring is out of scope here; the plan only guarantees it will be a one-line switch later.

> **Status (2026-10-24): implemented.** Phases 1–2 and the Phase 3 compose split are built and tested; Phase 4 integrations are wired and switch on with keys in `.env`. See `README.md` for how to run it and what's left to do.

---

## 0. Decisions this plan makes

| Question | Decision | Why |
|---|---|---|
| Framework | **FastAPI** (Python 3.12, Pydantic v2) | Already the decided stack; Pydantic models mirror `lib/types.ts` one to one; OpenAPI docs come free for teammates |
| Source of truth | **`Sudibran_backend_design.md` + the frontend contract (`lib/types.ts`, `lib/api.ts`)** | The frontend already implements R1–R8, A1–A9 and the `/api/*` shapes. `backend_implementation_plan.md` (Mandate Gateway, `/v1/mandates`…) is the older design |
| What we borrow from the Mandate Gateway plan | One-shot capability tokens (Ed25519), OPA bundle digest in every audit record, fail-closed matrix, "no code path sets a label directly", the three numbers (§12) | Strong ideas that fit Sudibran without changing the frontend contract |
| Strategy | **Contract first.** Phase 1 reproduces the Next.js mock *exactly* in Python, then each fake piece is replaced by a real one behind the same response shapes | The frontend never breaks, and every phase ends with a demo that works |
| Shape | Start as **one FastAPI app with one module per container**, split the security-critical modules into their own processes in Phase 3 | Fast to build on day one; module boundaries make the split mechanical |

---

## 1. Stack

| Need | Library |
|---|---|
| API | `fastapi`, `uvicorn[standard]`, `pydantic` v2, `pydantic-settings` |
| Database | Postgres 16 · `sqlalchemy` 2 (async) + `asyncpg` · plain `schema.sql` (skip Alembic at a hackathon) |
| Outbound HTTP (Nessie, CRS, OPA, between services) | `httpx` (async) |
| Models | `anthropic` (parser), Factory Droid SDK (planner) |
| Agent tools | `mcp` (official MCP Python SDK, `FastMCP` over streamable HTTP) for the proxy; also the client for CRS's MCP server |
| Tokens | `pyjwt` + `cryptography` (Ed25519, self-signed) |
| Policy | OPA sidecar container, Rego in `policy/` |
| Live events | FastAPI WebSocket |
| Tests | `pytest`, `pytest-asyncio`, `httpx.AsyncClient` |
| Tooling | `uv` for deps, `ruff` for lint/format, `docker compose` |

---

## 2. Repository layout

```
backend/
  docker-compose.yml          # Phase 3: network isolation lives here
  pyproject.toml
  .env.example                # NESSIE_KEY, CRS_KEY, ANTHROPIC_API_KEY... never committed
  schema.sql
  data/                       # backend-owned seed, scenarios, attacks and checks
  policy/                     # Rego: payment.rego, egress.rego, agents.rego + tests
  app/
    main.py                   # FastAPI app, mounts routers, CORS for localhost:3000
    config.py                 # settings from env
    models.py                 # Pydantic mirrors of lib/types.ts
    db.py                     # engine, session, repositories
    gate/                     # the coordinator: runs, intents, chat, approvals, switches
      routes.py
      runner.py               # the pipeline: invoice → parse → plan → policy → broker → pay
      labels.py               # source tags (trusted / untrusted / assume_breach ...)
      scenarios.py            # loads data/scenarios, classify_injection (port of lib/scenarios.ts)
    audit/
      chain.py                # canonical() + sha256, MUST match lib/chain.ts byte for byte
      store.py                # append-only writer, verify_chain()
    evidence/routes.py        # report builder (read-only)
    policy/client.py          # OPA call, fail-closed, returns {decision, rule, reason, bundle_digest}
    broker/                   # holds secrets, mints one-time tokens
    proxy/                    # MCP proxy: token check, fingerprint check, result labelling
    tools/                    # invoice_reader, supplier_db, payment (Nessie), crs
    registration/             # fingerprints for models, tools, agents
    agents/
      parser.py               # Claude, no tools, typed fields only
      planner.py              # Droid on Claude, sees typed fields only
      seller.py               # the supplier's agent, with attack modes
      raw.py                  # agent-raw: no Sudibran, the control group
  tests/
    contract/                 # golden responses recorded from the Next.js mock
    test_chain.py
    test_policy.py
```

---

## 3. Endpoints

### 3.1 Public API — the frontend contract (gate)

Same paths, methods and bodies as the Next.js mock, so `lib/api.ts` keeps working unchanged.
Every response model is the Pydantic twin of the TypeScript type named.

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| GET | `/api/state` | — | `DemoState` | Aggregates every table |
| GET | `/api/components` | — | `Component[]` | From `registration` |
| GET | `/api/checks` | — | `Check[]` | Switch-off-able checks |
| POST | `/api/intents` | `{ text, threshold_usd }` | `Intent` | Signs the intent (Ed25519). Threshold 150–600 → 400 otherwise |
| GET | `/api/chat` | — | `ChatMessage[]` | |
| POST | `/api/chat` | `{ text, pasted? }` | `ChatMessage[]` | `pasted: true` → tagged `untrusted` (A1) |
| GET | `/api/invoices` | — | `Invoice[]` | |
| GET | `/api/payments` | — | `Payment[]` | Accounts always masked |
| GET | `/api/approvals` | — | `Approval[]` | |
| POST | `/api/approvals/{id}` | `{ action: "approve" \| "reject" }` | `{ approval, payment, events }` | 404 if not pending. Approve → broker → pay, R4 still applies |
| GET | `/api/attacks` | — | `AttackInfo[]` | |
| POST | `/api/attacks/{id}` | — | `RunResult` | `A1`–`A9`, runs both sides |
| POST | `/api/story/{id}` | — | `RunResult` | `normal_90`, `above_threshold`, `side_by_side_140` |
| POST | `/api/inject` | `{ text }` | `RunResult` | ≤ 600 chars. Phase 1 keyword match, Phase 4 real parser |
| GET / POST | `/api/switches` | `Partial<DemoSwitches>` | `DemoSwitches` | `assume_breach`, `layer_off`, `audit_down` |
| POST | `/api/demo/reset` | — | `DemoState` | Truncate + reseed from `data/seed.json` |
| GET | `/api/evidence/{runId}` | `?layer=` (new, optional) | `EvidenceReport` | Includes server-side chain check |

Errors: `{ "error": "…" }` with a 4xx status, exactly as the mock does. Add one exception
handler that turns `HTTPException` and validation errors into that shape.

### 3.2 Public API — new endpoints

| Method | Path | Does | Why |
|---|---|---|---|
| WS | `/api/events` | Streams each `AuditEvent` as it is written | Live flow graph (O1); replaces the timer replay later |
| GET | `/api/audit` | `?run_id=&layer=&after_seq=` → `AuditEvent[]` | Raw chain access for the evidence viewer and judges |
| GET | `/api/audit/verify` | `{ intact, checked_events, broken_at, policy_digest }` | "Defends a decision when questioned" |
| POST | `/api/a2a/messages` | Seller agent → gate: `{ agent_id, text, report?, signature? }` | R3 report check, quarantine counter (A5) |
| GET | `/api/metrics` | Block rate, benign completion, p95 added latency | The three numbers |
| GET | `/api/health` | Status of postgres, opa, broker, nessie, crs | Drives the fail-closed banner |
| GET | `/api/suppliers` | Suppliers with masked account + latest CRS result | CRS enrollment (see `sponsor_integrations.md` §3) |
| POST | `/api/suppliers` | CRS-gated enrollment of a new supplier or changed account | Untrusted text can never create a trusted payee |
| POST | `/api/suppliers/{id}/attest` | Maya confirms an enrolled supplier | Human attestation step |
| GET | `/api/runs/{runId}/plan` | Droid's proposed steps for a run | Factory: "plans, steps, results" |
| POST | `/api/admin/nessie/sync` | Re-read balances from Nessie | Demo convenience |

### 3.3 Internal endpoints — never exposed to the browser

Phase 1–2 these are plain function calls between modules. Phase 3 they become HTTP between
containers with exactly these signatures, so nothing else changes.

| Service | Method · Path | Body → Returns | Rule |
|---|---|---|---|
| **agent / parser** | `POST /parse` | `{ source_ref, schema_id }` → `{ supplier, amount_usd, currency, due, account_ref }` | Claude, no tools. Output is a fixed schema; there is no field for an instruction |
| **agent / planner** | `POST /plan` | `{ intent, typed_fields, assume_breach }` → `{ steps: [{tool, args}] }` | Never receives raw invoice text |
| **opa** | `POST /v1/data/sudibran/decision` | `{ intent, action, labels, supplier_record, switches }` → `{ decision, rule, reason }` | Timeout or error → **deny** (R6) |
| **broker** | `POST /mint` | `{ run_id, tool, args_hash, decision_seq }` → `{ token, expires_at }` | Only after an `allow`. Token bound to exact args, single use |
| **mcp-proxy** | `POST /call` | `{ tool, args, token }` → `{ result, labels }` | Verifies token + tool fingerprint, burns the nonce, labels the result |
| **mcp-proxy** | MCP server at `/mcp` | `get_invoice_fields`, `lookup_supplier`, `verify_payee`, `propose_payment`, `remember`/`recall`, `send_message` | The only tools Droid can see. Full table in `sponsor_integrations.md` §2 |
| **tools / payment** | `POST /pay` | `{ supplier_id, amount_usd }` → `{ nessie_transfer_id, status }` | Payee account looked up from `suppliers`, **never** taken from args |
| **tools / crs** | `POST /check` | `{ account_holder }` → `{ result: clean \| flagged \| mismatch, raw }` | Error → payment on hold. Never fake a CRS result |
| **tools / supplier-db** | `GET /suppliers/{id}` | → masked record | Row-level security; full account only to `payment` |
| **registration** | `POST /components` · `POST /components/{id}/verify` | descriptor → `Component` with fingerprint | Description hash changed → `quarantined` (A6) |
| **gate / droid hook** | `POST /hooks/pre-tool-use` | `{ session_id, tool_name, tool_input }` → `{ decision, reason }` | Droid's `PreToolUse` hook target. Hooks fail open, so the proxy token stays the hard stop |

Sponsor API details (Nessie, CRS, Droid, Claude), key placement and hour-one checks are in
[`sponsor_integrations.md`](sponsor_integrations.md).

---

## 4. The run pipeline (what `POST /api/story|attacks|inject` does)

```
1. intent          load Maya's signed intent (trusted, written before any data is read)
2. seller → gate   R3: report present? signed? matches? → verified / unverified / mismatch
3. invoice_reader  fetch via proxy, label result "untrusted_external"
4. parser          typed fields only; free-text account numbers dropped
5. planner         proposes tool calls (assume_breach forces it to follow the injection)
6. policy (OPA)    R1 threshold · R2 payee from records · PD egress · INTENT coverage
7. crs             R7 when the account is new or changed
8. audit check     R4: if the audit log can't be written → hold
9. broker          mint one-time token
10. proxy → pay    Nessie transfer
Every step writes exactly one AuditEvent (R8). layer_off skips one step and marks it off=true.
```

`raw` side: `agents/raw.py` runs the same input straight to the tools against its own Nessie
account. Phase 1 replays `scenario.raw.steps`; Phase 4 runs it for real.

---

## 5. Database (Postgres)

From the design doc, shaped to the frontend types:

`intents` · `suppliers` (account encrypted + `account_sha256` lookup key + `nessie_account_id`) ·
`agents` (status, missing_report_count) · `agent_messages` · `components` · `invoices` ·
`payments` · `approvals` · `memory` (entry + source label) · `tool_calls` · `runs` (stores the
`RunResult` JSON) · `switches` (single row) · `audit` (append-only).

`audit` columns follow `AuditEvent` exactly, plus `policy_digest`. Revoke `UPDATE`/`DELETE`
on it from the app's DB role, so "append-only" is enforced by Postgres, not by habit.

---

## 6. Hash chain compatibility (do not get this wrong)

The browser re-hashes events with `lib/chain.ts`. The Python side must produce the
**identical string** or every report shows "chain broken".

```python
def canonical(e) -> str:
    return json.dumps(
        [e.seq, e.time, e.run_id, e.step, e.layer, e.mechanism, e.node, e.edge,
         e.decision, e.reason, e.rule, e.off or False, e.actor, e.labels,
         e.payment_id, e.prev_hash],
        separators=(",", ":"), ensure_ascii=False,
    )
```

- `separators=(",", ":")` matches `JSON.stringify` spacing; `ensure_ascii=False` matches its
  handling of `·`, `—`, `$` and other non-ASCII in reasons.
- `time` is an ISO string with milliseconds and `Z` (`2026-10-24T09:00:00.000Z`), as JS writes it.
- Genesis `prev_hash` is 64 zeros.
- First test to write: hash a fixture event in Python and in Node, assert equal.

---

## 7. Build order

Each phase ends with something demoable. Owners follow the design doc's team plan
(A core · B agents · C integrations · D frontend/pitch).

| Phase | Deliverable | Done when | Owner |
|---|---|---|---|
| **0. Hour one** (parallel) | One real Nessie sandbox transfer · CRS clean vs flagged test identity · Droid hook check | Each verified with a script in `scripts/` | C, C, B |
| **1. Contract parity** | FastAPI skeleton, Pydantic models, Postgres schema, seed loader, scenario runner ported from `lib/store.ts`, hash chain, all §3.1 endpoints | Golden tests pass: every `/api/*` response matches the Next.js mock for the same input | A |
| **2. Real checks** | OPA policies (R1, R2, PD, INTENT) replace scripted policy events; R3 report check; broker tokens; proxy + fingerprints; `/api/events` WS | `side_by_side_140` is denied by a real Rego rule and the audit row carries the bundle digest | A, C |
| **3. Isolation** | Split `agent`, `broker`+`payment`, `proxy` into containers; compose networks so the agent has **no route** to Nessie | `docker compose exec agent curl nessie…` fails | A, C |
| **4. Real integrations** | Parser on Claude, planner on Droid, real Nessie payment on allow, real CRS on R7, seller agent, agent-raw | $90 pays for real, $140 is blocked and never reaches Nessie | B, C |
| **5. Proof** | `/api/metrics`, benign 20-invoice run, unseen-task rehearsal, fail-closed tests per component | Three numbers on screen | A, D |

**Critical path:** 0 → 1 → 2 (R2 in OPA) → 4 (Nessie + CRS). Phase 3 can slip by a few hours
but not be cut: the network split is the answer to "what stops a hacked model calling the bank".

---

## 8. Fail-closed matrix (implemented in `policy/client.py`, `audit/store.py`, `tools/crs`)

| Component down | Behaviour | Rule |
|---|---|---|
| OPA | deny | R6 |
| Audit write fails | payment `on_hold`, reads still work | R4 |
| Broker | no token → deny | R6 |
| CRS | payment to new account `on_hold`; known accounts still pay | R7 |
| Nessie | payment `on_hold`, retry by Maya | — |
| WebSocket / UI | allow (visualisation only) | — |

---

## 9. Testing

- **Contract tests:** run the Next.js mock, record each `/api/*` response into
  `tests/contract/*.json` (strip `run_id`, `time`, `hash`), and diff the FastAPI response
  against it. This is what makes "swap the backend later" safe.
- **Chain test:** Python vs `lib/chain.ts` on the same event.
- **Policy tests:** `opa test policy/` with one case per rule and per attack A1–A9.
- **Fail-closed tests:** stop each dependency, assert the matrix above.

---

## 10. How the frontend switches later (not now)

`lib/api.ts` calls relative `/api/...` paths. When ready, add a rewrite in `next.config.ts`
from `/api/:path*` to `http://localhost:8000/api/:path*` and delete `app/api/`. No page changes.

---

## 11. Open questions

1. Persist across restarts, or keep "Reset session" semantics only? (Plan assumes Postgres
   with a reset endpoint that truncates and reseeds.)
2. `/api/inject` free text: keep the keyword classifier as a fallback when the parser is
   unavailable, or fail closed to `custom` (held for review)?
3. One Nessie customer for both sides with two accounts, or two customers? (Plan assumes two
   accounts so `balances.raw` and `balances.protected` are real.)
