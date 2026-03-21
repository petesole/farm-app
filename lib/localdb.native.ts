// lib/localdb.native.ts
import * as SQLite from "expo-sqlite";

export const db = SQLite.openDatabaseSync("farm_local.db");

export function initLocalDb() {
  db.execSync(`
    -- =========================
    -- Scouting local tables
    -- =========================
    create table if not exists scouting_report_local (
      scouting_report_id text primary key,
      tracecode_id integer,
      scout_date text,
      scouting_moisture_id text,
      scouting_weed_pressure_id text,
      notes text,
      synced integer default 0
    );

    create table if not exists scouting_position_local (
      scouting_position_id text primary key,
      scouting_report_id text,
      position_no integer,
      notes text,
      synced integer default 0
    );

    create table if not exists scouting_observation_local (
      scouting_observation_id text primary key,
      scouting_report_id text,
      scouting_position_id text,
      scouting_issue text,
      observation_name text,
      severity integer,
      count_value real,
      notes text,
      synced integer default 0
    );

    -- =========================
    -- Sync queue
    -- =========================
    create table if not exists sync_queue (
      id integer primary key autoincrement,
      table_name text not null,
      record_id text not null,
      payload text not null,
      tries integer default 0,
      last_error text
    );

    -- =========================
    -- Tracecode cache (for offline selection + cascading)
    -- =========================
    create table if not exists tracecode_local (
      tracecode_id integer primary key,
      tracecode_name text,
      crop_id integer,
      crop_name text,
      field_id integer,
      field_name text,
      updated_at text
    );

    -- Key/value store (last refresh etc.)
    create table if not exists app_kv (
      k text primary key,
      v text
    );
  `);

  // Safe schema upgrades if your tracecode_local existed earlier with fewer columns
  try { db.execSync(`alter table tracecode_local add column crop_id integer;`); } catch {}
  try { db.execSync(`alter table tracecode_local add column crop_name text;`); } catch {}
  try { db.execSync(`alter table tracecode_local add column field_id integer;`); } catch {}
  try { db.execSync(`alter table tracecode_local add column field_name text;`); } catch {}
  try { db.execSync(`alter table tracecode_local add column updated_at text;`); } catch {}
}

export function hasLocalDb() {
  return true;
}

