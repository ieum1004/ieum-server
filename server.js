// server.js - 이음 통합 백엔드 (이음WORK + 이음BIZ 공용)
// 1단계 범위: 로그인(휴대폰 인증) · 공고 등록/조회 · 매칭 점수 · 지원/선택

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const db = require('./db');
const { computeMatchScore } = require('./matching');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ---------- 유틸 ----------
function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
function randomToken() {
  return crypto.randomBytes(24).toString('hex');
}
function getUserByToken(token) {
  if (!token) return null;
  const row = db.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`
  ).get(token);
  return row || null;
}
// 인증 미들웨어: Authorization: Bearer <token>
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = getUserByToken(token);
  if (!user) return res.status(401).json({ error: '로그인이 필요해요.' });
  req.user = user;
  next();
}
function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) return res.status(403).json({ error: '권한이 없어요.' });
    next();
  };
}

// ---------- 헬스체크 ----------
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'ieum-server', time: new Date().toISOString() }));

// ---------- 인증: OTP 요청 ----------
// 실제 SMS 연동 전까지는 발급된 코드를 응답에 함께 내려줍니다 (개발/파일럿 단계 전용).
app.post('/api/auth/request-otp', (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: '휴대폰 번호를 입력해주세요.' });
  const code = randomCode();
  db.prepare(`INSERT INTO otp_codes (phone, code) VALUES (?, ?)
              ON CONFLICT(phone) DO UPDATE SET code = excluded.code, created_at = datetime('now')`)
    .run(phone, code);
  // TODO: 실제 서비스 전환 시 SMS 발송 API 연동, 아래 devCode 필드는 제거
  res.json({ ok: true, devCode: code });
});

// ---------- 인증: OTP 검증 + 가입/로그인 ----------
app.post('/api/auth/verify-otp', (req, res) => {
  const { phone, code, role } = req.body || {};
  if (!phone || !code || !role) return res.status(400).json({ error: '휴대폰 번호, 인증코드, 역할이 모두 필요해요.' });
  if (!['worker', 'employer'].includes(role)) return res.status(400).json({ error: 'role은 worker 또는 employer 여야 해요.' });

  const otp = db.prepare(`SELECT * FROM otp_codes WHERE phone = ?`).get(phone);
  if (!otp || otp.code !== code) return res.status(400).json({ error: '인증코드가 올바르지 않아요.' });

  let user = db.prepare(`SELECT * FROM users WHERE phone = ?`).get(phone);
  if (!user) {
    const info = db.prepare(`INSERT INTO users (phone, role) VALUES (?, ?)`).run(phone, role);
    user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(info.lastInsertRowid);
    if (role === 'worker') {
      db.prepare(`INSERT INTO worker_profiles (user_id) VALUES (?)`).run(user.id);
    } else {
      db.prepare(`INSERT INTO employer_profiles (user_id) VALUES (?)`).run(user.id);
    }
  }

  const token = randomToken();
  db.prepare(`INSERT INTO sessions (token, user_id) VALUES (?, ?)`).run(token, user.id);
  db.prepare(`DELETE FROM otp_codes WHERE phone = ?`).run(phone);

  res.json({ ok: true, token, user: { id: user.id, phone: user.phone, role: user.role } });
});

// ---------- 내 정보 ----------
app.get('/api/me', requireAuth, (req, res) => {
  const user = req.user;
  if (user.role === 'worker') {
    const profile = db.prepare(`SELECT * FROM worker_profiles WHERE user_id = ?`).get(user.id);
    return res.json({ ...user, profile: { ...profile, tasks: JSON.parse(profile.tasks || '[]') } });
  } else {
    const profile = db.prepare(`SELECT * FROM employer_profiles WHERE user_id = ?`).get(user.id);
    return res.json({ ...user, profile });
  }
});

// 워커 프로필 저장 (직종, 가능시간 등)
app.put('/api/me/worker-profile', requireAuth, requireRole('worker'), (req, res) => {
  const { name, age, tasks, avail_time } = req.body || {};
  db.prepare(`UPDATE worker_profiles SET
      name = COALESCE(?, name),
      age = COALESCE(?, age),
      tasks = COALESCE(?, tasks),
      avail_time = COALESCE(?, avail_time)
      WHERE user_id = ?`)
    .run(name ?? null, age ?? null, tasks ? JSON.stringify(tasks) : null, avail_time ?? null, req.user.id);
  res.json({ ok: true });
});

// 기업 프로필 저장
app.put('/api/me/employer-profile', requireAuth, requireRole('employer'), (req, res) => {
  const { company_name, manager_name, business_no, industry } = req.body || {};
  db.prepare(`UPDATE employer_profiles SET
      company_name = COALESCE(?, company_name),
      manager_name = COALESCE(?, manager_name),
      business_no = COALESCE(?, business_no),
      industry = COALESCE(?, industry)
      WHERE user_id = ?`)
    .run(company_name ?? null, manager_name ?? null, business_no ?? null, industry ?? null, req.user.id);
  res.json({ ok: true });
});

// ---------- 공고 (BIZ 전용 등록/조회) ----------
app.post('/api/jobs', requireAuth, requireRole('employer'), (req, res) => {
  const { task, location, work_date, start_time, end_time, wage } = req.body || {};
  if (!task || !work_date || !start_time || !end_time || !wage) {
    return res.status(400).json({ error: '직종, 근무일, 시작/종료시간, 시급은 필수예요.' });
  }
  const qrToken = crypto.randomBytes(12).toString('hex');
  const info = db.prepare(`INSERT INTO jobs (employer_id, task, location, work_date, start_time, end_time, wage, qr_token)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.user.id, task, location || '', work_date, start_time, end_time, wage, qrToken);
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(info.lastInsertRowid);
  res.json({ ok: true, job });
});

// 내(기업) 공고 목록
app.get('/api/jobs/mine', requireAuth, requireRole('employer'), (req, res) => {
  const jobs = db.prepare(`SELECT * FROM jobs WHERE employer_id = ? ORDER BY created_at DESC`).all(req.user.id);
  const withCounts = jobs.map(j => ({
    ...j,
    applicant_count: db.prepare(`SELECT COUNT(*) c FROM applications WHERE job_id = ? AND status != 'cancelled'`).get(j.id).c
  }));
  res.json({ jobs: withCounts });
});

// 공고 마감/재오픈
app.patch('/api/jobs/:id/status', requireAuth, requireRole('employer'), (req, res) => {
  const { status } = req.body || {};
  if (!['open', 'closed'].includes(status)) return res.status(400).json({ error: 'status는 open 또는 closed' });
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id);
  if (!job || job.employer_id !== req.user.id) return res.status(404).json({ error: '공고를 찾을 수 없어요.' });
  db.prepare(`UPDATE jobs SET status = ? WHERE id = ?`).run(status, job.id);
  res.json({ ok: true });
});

// 열려있는 공고 목록 (워커 전용, 내 조건 기준 매칭 점수 포함)
app.get('/api/jobs/open', requireAuth, requireRole('worker'), (req, res) => {
  const profile = db.prepare(`SELECT * FROM worker_profiles WHERE user_id = ?`).get(req.user.id);
  const workerTasks = JSON.parse(profile.tasks || '[]');
  const jobs = db.prepare(`
    SELECT j.*, e.company_name FROM jobs j
    JOIN employer_profiles e ON e.user_id = j.employer_id
    WHERE j.status = 'open' ORDER BY j.created_at DESC`).all();

  const scored = jobs.map(j => {
    const { score, reasons } = computeMatchScore(workerTasks, profile.avail_time, j);
    return { ...j, match_score: score, match_reasons: reasons };
  }).sort((a, b) => b.match_score - a.match_score);

  res.json({ jobs: scored });
});

// ---------- 지원 (워커 -> 공고) ----------
app.post('/api/jobs/:id/apply', requireAuth, requireRole('worker'), (req, res) => {
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id);
  if (!job || job.status !== 'open') return res.status(404).json({ error: '지원할 수 없는 공고예요.' });

  const profile = db.prepare(`SELECT * FROM worker_profiles WHERE user_id = ?`).get(req.user.id);
  const workerTasks = JSON.parse(profile.tasks || '[]');
  const { score } = computeMatchScore(workerTasks, profile.avail_time, job);

  try {
    const info = db.prepare(`INSERT INTO applications (job_id, worker_id, match_score) VALUES (?, ?, ?)`)
      .run(job.id, req.user.id, score);
    res.json({ ok: true, applicationId: info.lastInsertRowid, match_score: score });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(400).json({ error: '이미 지원한 공고예요.' });
    throw e;
  }
});

// 내(워커) 지원 목록
app.get('/api/applications/mine', requireAuth, requireRole('worker'), (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, j.task, j.location, j.work_date, j.start_time, j.end_time, j.wage, e.company_name
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN employer_profiles e ON e.user_id = j.employer_id
    WHERE a.worker_id = ? ORDER BY a.created_at DESC`).all(req.user.id);
  res.json({ applications: rows });
});

// 특정 공고의 지원자 목록 (기업, 본인 공고만 조회 가능)
app.get('/api/jobs/:id/applicants', requireAuth, requireRole('employer'), (req, res) => {
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id);
  if (!job || job.employer_id !== req.user.id) return res.status(404).json({ error: '공고를 찾을 수 없어요.' });

  const rows = db.prepare(`
    SELECT a.*, w.name, w.age, w.tasks, w.avail_time, w.rating_avg, w.rating_count
    FROM applications a
    JOIN worker_profiles w ON w.user_id = a.worker_id
    WHERE a.job_id = ? AND a.status != 'cancelled'
    ORDER BY a.match_score DESC`).all(job.id);

  res.json({ applicants: rows.map(r => ({ ...r, tasks: JSON.parse(r.tasks || '[]') })) });
});

// 지원자 선택/거절 (기업)
app.patch('/api/applications/:id/status', requireAuth, requireRole('employer'), (req, res) => {
  const { status } = req.body || {};
  if (!['accepted', 'rejected'].includes(status)) return res.status(400).json({ error: 'status는 accepted 또는 rejected' });

  const app_ = db.prepare(`SELECT a.*, j.employer_id FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = ?`).get(req.params.id);
  if (!app_ || app_.employer_id !== req.user.id) return res.status(404).json({ error: '지원 내역을 찾을 수 없어요.' });

  db.prepare(`UPDATE applications SET status = ? WHERE id = ?`).run(status, app_.id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`이음 서버 실행 중: http://localhost:${PORT}`);
});
