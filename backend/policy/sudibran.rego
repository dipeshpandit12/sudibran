# Sudibran payment policy. Source of truth when POLICY_ENGINE=opa.
# app/policy/engine.py (LocalPolicy) mirrors this rule for rule; tests/test_policy.py
# checks the two agree on every case in tests/policy_cases.json.
#
# Input (built by the gate, never by the agent):
#   intent:     { threshold_usd, permissions[] }
#   action:     { type: pay|send_message|remember|<anything else>, amount_usd, payee_account,
#                 payee_source, origin: planner|injection, claims_approval, contains_private,
#                 recipient_internal }
#   supplier:   { id, account_masked, status, crs } or null
#   context:    { report_status: verified|unverified|mismatch, crs: clean|flagged|null }
#   checks_off: [ check keys switched off by the presenter ]
#
# Output: data.sudibran.decision = { decision: allow|ask|deny, rule: string|null }

package sudibran

import rego.v1

default decision := {"decision": "deny", "rule": "R6"}

decision := evaluate

is_off(key) if key in input.checks_off

known_action if input.action.type in {"pay", "send_message", "remember"}

supplier := object.get(input, "supplier", null)

pay if input.action.type == "pay"

payee := object.get(input.action, "payee_account", null)

payee_off_record if {
	pay
	supplier != null
	payee != null
	payee != supplier.account_masked
	not is_off("policy_r2")
}

supplier_missing if {
	pay
	supplier == null
}

supplier_missing if {
	pay
	supplier != null
	object.get(supplier, "status", "") != "active"
}

# Missing fields default explicitly, so Rego and the Python mirror agree on partial input.
contains_private := object.get(input.action, "contains_private", false)

recipient_internal := object.get(input.action, "recipient_internal", false)

crs_flagged if {
	pay
	input.context.crs == "flagged"
	not is_off("crs_r7")
}

private_leak if {
	input.action.type == "send_message"
	contains_private == true
	recipient_internal != true
	not is_off("policy_pd")
}

evaluate := {"decision": "ask", "rule": "INTENT"} if {
	not known_action
} else := {"decision": "allow", "rule": null} if {
	input.action.type == "remember"
} else := {"decision": "deny", "rule": "PD"} if {
	private_leak
} else := {"decision": "ask", "rule": "INTENT"} if {
	input.action.type == "send_message"
	contains_private != true
} else := {"decision": "allow", "rule": null} if {
	# private data with the PD check switched off: the supplier DB's row-level security
	# is the next layer (it only ever returns masked accounts)
	input.action.type == "send_message"
} else := {"decision": "deny", "rule": "R2"} if {
	supplier_missing
} else := {"decision": "deny", "rule": "R2"} if {
	payee_off_record
} else := {"decision": "deny", "rule": "R7"} if {
	crs_flagged
} else := {"decision": "ask", "rule": "INTENT"} if {
	not "pay_suppliers_on_file" in input.intent.permissions
} else := {"decision": "ask", "rule": "R5"} if {
	input.action.origin == "injection"
} else := {"decision": "ask", "rule": "R5"} if {
	input.action.claims_approval == true
} else := {"decision": "ask", "rule": "R1"} if {
	input.action.amount_usd > input.intent.threshold_usd
} else := {"decision": "ask", "rule": "R3"} if {
	input.context.report_status in {"unverified", "mismatch"}
	not is_off("gate_r3")
} else := {"decision": "allow", "rule": null}
