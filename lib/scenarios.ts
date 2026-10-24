// Every scenario file, keyed by id. Shared by the mock backend and the dashboard presets.
import A1 from "@/data/scenarios/A1.json";
import A2 from "@/data/scenarios/A2.json";
import A3 from "@/data/scenarios/A3.json";
import A4 from "@/data/scenarios/A4.json";
import A5 from "@/data/scenarios/A5.json";
import A6 from "@/data/scenarios/A6.json";
import A7 from "@/data/scenarios/A7.json";
import A8 from "@/data/scenarios/A8.json";
import A9 from "@/data/scenarios/A9.json";
import normal_90 from "@/data/scenarios/normal_90.json";
import above_threshold from "@/data/scenarios/above_threshold.json";
import side_by_side_140 from "@/data/scenarios/side_by_side_140.json";
import custom from "@/data/scenarios/custom.json";
import type { Scenario } from "./types";

export const SCENARIOS = Object.fromEntries(
  [A1, A2, A3, A4, A5, A6, A7, A8, A9, normal_90, above_threshold, side_by_side_140, custom].map((s) => [s.id, s as Scenario]),
) as Record<string, Scenario>;

/**
 * Matches free-text injection to the closest known attack. Anything that
 * matches nothing goes to "custom": Sudibran holds it for review.
 */
export function classifyInjection(text: string): string {
  const t = text.toLowerCase();
  const rules: [RegExp, string][] = [
    [/admin note|without (any )?approval|skip (the )?approval/, "A1"],
    [/maintenance mode|ignore (all |any |previous |the )*(payment )?(rules|instructions)|^system:|jailbreak|developer mode/, "A2"],
    [/remember|for next time|save (this|that) to memory/, "A4"],
    [/account (has )?changed|new (bank )?account|changed (our|my|the) bank|updated (bank )?details/, "side_by_side_140"],
    [/already approved|approved (this|it) by phone|maya (said|approved)|pre-?approved/, "A5"],
    [/tool description|before paying, also|tool (says|instructions)/, "A6"],
    [/hidden|white text|invisible|white-on-white/, "A7"],
    [/supplier list|bank details|send .*(list|accounts|records)|email .*@|export (all|the)/, "A8"],
    [/also pay|pay (account|to)|\*{4}\d{4}|transfer|wire|send \$\d/, "A3"],
  ];
  for (const [re, id] of rules) if (re.test(t)) return id;
  return "custom";
}
