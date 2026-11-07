/**
 * JSPL Labour UI contract — fast, dependency-free source checks.
 * This guards previously regressed invariants; it is NOT a rendered UI or E2E test.
 * Run: node scripts/check-labour-ui.mjs
 */
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
const read = p => readFileSync(p,"utf8");

const header = read("components/jspl/JsplModuleHeader.tsx");
assert.match(header, /flexDirection:\s*["']row["']/,"Shared header must remain a horizontal row");
assert.match(header, /styles\.logo/,"Shared header must include the JSPL logo");
assert.match(header, /styles\.mainButton/,"Shared header must display the return control within its header");
assert.match(header, /backLabel\s*&&\s*\(backHref\s*\|\|\s*onBack\)/,"Shared header must support explicit back navigation");

const globalReturn = read("components/jspl/JsplReturnNavigation.tsx");
assert.match(globalReturn, /path===["']\/labour["']\s*\|\|\s*path\.startsWith\(["']\/labour-["']\)/,"Labour must not receive a duplicate global return control");

const tabs = read("app/(tabs)/_layout.tsx");
assert.match(tabs, /tabBarStyle:\s*\{\s*display:\s*["']none["']\s*\}/,"Bottom tab bar must be hidden");
assert.match(tabs, /name=["']labour["']/,"Labour module route must exist");

const cases = [
  ["app/(tabs)/labour.tsx", "Back to Main", "/(tabs)/main-dashboard", 1],
  ["app/labour-entry.tsx", "Back to Labour", "/(tabs)/labour", 2],
  ["app/labour-reports.tsx", "Back to Labour", "/(tabs)/labour", 1],
  ["app/labour-history.tsx", "Back to Labour", "/(tabs)/labour", 1],
  ["app/labour-correction.tsx", "Back to Labour", "/(tabs)/labour", 1],
];
for(const [path,label,destination,count] of cases){
  const source=read(path);
  assert.match(source, /<JsplModuleHeader\b/,`${path}: missing common JSPL header`);
  assert.equal((source.match(/<JsplModuleHeader\b/g)||[]).length,count,`${path}: unexpected number of header branches`);
  assert.ok(source.includes(`backLabel="${label}"`),`${path}: incorrect return label`);
  assert.ok(source.includes(`backHref="${destination}"`),`${path}: incorrect return destination`);
  assert.ok(!/<View style=\{styles\.header\}>/.test(source),`${path}: duplicate custom header`);
}
const entry=read("app/labour-entry.tsx");
assert.match(entry,/backLabel=["']Back to Labour Form["']/,"Edit Labour Line must have its own return button");
assert.match(entry,/onBack=\{clearEntry\}/,"Edit Labour Line must preserve draft by returning to the entry form");
assert.match(entry,/LABOUR_DEVELOPMENT_PREVIEW_ONLY\s*=\s*true/,"Shared database: development save must remain disabled");
assert.match(entry,/editable=\{!draft\.length\s*&&\s*!busy\s*&&\s*!locked\}/,"Entry date must be held while draft records exist");
const reports=read("app/labour-reports.tsx");
assert.ok(!/<View style=\{styles\.nav\}>/.test(reports),"Reports must not have a second navigation row");

console.log("JSPL Labour UI contract: PASS (5 routes; shared header, return destinations, no duplicate return, hidden bottom bar, safe preview).");
