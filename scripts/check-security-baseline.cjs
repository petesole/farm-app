#!/usr/bin/env node
/* JSPL baseline guard: fails builds if insecure legacy authentication is reintroduced. */
const fs = require("node:fs");
const path = require("node:path");
const targets = ["app/login.tsx", "app/(tabs)/_layout.tsx", "supabase.ts"];
const read = (p) => fs.readFileSync(path.join(process.cwd(),p), "utf8");
const errors = [];
for (const p of targets) if (!fs.existsSync(p)) errors.push("Missing: "+p);
if (!errors.length) {
  const login = read(targets[0]), layout = read(targets[1]), client = read(targets[2]);
  if (/\.from\s*\(\s*['"`]login['"`]\s*\)/.test(login)) errors.push("Legacy public.login query in login screen");
  if (!login.includes("auth.signInWithPassword")) errors.push("Expected Supabase Auth sign-in missing");
  if (!login.includes('rpc("my_farm_app_roles")')) errors.push("Server-side role lookup missing after login");
  if (layout.includes('setLoggedIn(!!raw && !!role)')) errors.push("Cached role accepted as authentication");
  if (!layout.includes("auth.getUser()")) errors.push("Supabase user verification missing in navigation");
  if (!layout.includes('rpc("my_farm_app_roles")')) errors.push("Role lookup missing in navigation");
  if (!client.includes('Refusing to connect development build to JSPL production Supabase')) errors.push("DEV production project guard missing");
  if (/service_role|sb_secret_/.test(client)) errors.push("Possible privileged key reference in public Supabase client");
}
if (errors.length) {
  for (const e of errors) process.stderr.write("SECURITY: "+e+"\n");
  process.exit(1);
}
process.stdout.write("JSPL authentication baseline source checks passed. This is NOT a runtime or RLS audit.\n");
