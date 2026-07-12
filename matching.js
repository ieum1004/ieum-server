// matching.js - 워커 조건과 공고 조건의 매칭 점수 계산
// 이음WORK 프로토타입의 computeMatchInfo() 로직과 동일한 기준으로 서버에 이식했습니다.
// - 직종: 워커가 선택한 직종(복수) vs 공고의 직종(복수) 겹치는 개수
// - 시간: 워커의 "오늘 가능/내일 가능/아무때나 가능" 선택 vs 공고의 근무일(오늘/내일 여부)

function formatRelativeDate(dateStr) {
  if (!dateStr) return '';
  const today = new Date();
  const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayStr = toISO(today);
  const tmr = new Date(today); tmr.setDate(tmr.getDate() + 1);
  const tmrStr = toISO(tmr);
  if (dateStr === todayStr) return '오늘';
  if (dateStr === tmrStr) return '내일';
  return '';
}

function computeMatchScore(workerTasks, workerAvailTimeStr, job) {
  const myTasks = Array.isArray(workerTasks) ? workerTasks : [];
  const jobTasks = Array.isArray(job.tasks) ? job.tasks : [];
  const taskOverlap = myTasks.filter(t => jobTasks.includes(t));

  const rel = formatRelativeDate(job.work_date);
  const avail = workerAvailTimeStr || '';
  let timeMatch = false;
  if (avail.includes('아무때나')) timeMatch = true;
  else if (rel === '오늘' && avail.includes('오늘')) timeMatch = true;
  else if (rel === '내일' && avail.includes('내일')) timeMatch = true;

  const score = taskOverlap.length * 100 + (timeMatch ? 10 : 0);
  const reasons = [];
  if (taskOverlap.length > 0) reasons.push('직종 일치');
  if (timeMatch) reasons.push('시간 적합');

  return { score, taskMatch: taskOverlap.length > 0, timeMatch, matchedTasks: taskOverlap, reasons };
}

module.exports = { computeMatchScore };
