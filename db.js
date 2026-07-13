// db.js - 이음 서버 데이터베이스 (SQLite)
// 워커앱(이음WORK)과 사장님웹(이음BIZ)이 공유하는 단일 DB입니다.

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Render에 영구 디스크(/var/data)를 연결해두면 그 경로에 저장해서
// 재배포/재시작을 해도 데이터가 사라지지 않습니다.
// 영구 디스크가 없으면(로컬 개발 등) 기존처럼 프로젝트 폴더에 저장합니다.
const DATA_DIR = fs.existsSync('/var/data') ? '/var/data' : __dirname;
const db = new Database(path.join(DATA_DIR, 'ieum.db'));
console.log('DB 저장 위치:', path.join(DATA_DIR, 'ieum.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS worker_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  name TEXT,
  age INTEGER,
  tasks TEXT DEFAULT '[]',        -- JSON array, 예: ["사무보조","청소보조"]
  avail_time TEXT DEFAULT '',     -- 예: "오전, 오후"
  bank_name TEXT,
  bank_number TEXT,
  bank_holder TEXT,
  rating_avg REAL DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  no_show_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS employer_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  company_name TEXT,
  manager_name TEXT,
  business_no TEXT,
  industry TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employer_id INTEGER NOT NULL REFERENCES users(id),
  tasks TEXT NOT NULL,             -- JSON array, 예: ["사무보조","전화응대"]
  location TEXT,
  work_date TEXT,                 -- YYYY-MM-DD
  start_time TEXT,                -- HH:MM
  end_time TEXT,                  -- HH:MM
  wage INTEGER,
  status TEXT DEFAULT 'open' CHECK(status IN ('open','closed')),
  qr_token TEXT,                  -- 이 공고(=매장)의 상시 QR 토큰
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  worker_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','cancelled')),
  match_score INTEGER DEFAULT 0,
  checkin_at TEXT,
  checkout_at TEXT,
  settle_amount INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(job_id, worker_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS otp_codes (
  phone TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

module.exports = db;
