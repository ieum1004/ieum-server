// matching.js - 워커 조건과 공고 조건의 매칭 점수 계산
// 이음WORK 프로토타입의 computeMatchInfo() 로직을 서버 공용 로직으로 이식했습니다.

function computeMatchScore(workerTasks, workerAvailTime, job) {
  let score = 0;
  const reasons = [];

  // 1) 직종 일치
  const tasks = Array.isArray(workerTasks) ? workerTasks : [];
  if (tasks.includes(job.task)) {
    score += 60;
    reasons.push('직종 일치');
  }

  // 2) 시간대 적합 (오전/오후/저녁 등 문자열 포함 여부로 단순 판정)
  const startHour = parseInt((job.start_time || '00:00').split(':')[0], 10);
  let jobSlot = '오전';
  if (startHour >= 12 && startHour < 17) jobSlot = '오후';
  else if (startHour >= 17) jobSlot = '저녁';

  if (workerAvailTime && workerAvailTime.includes(jobSlot)) {
    score += 40;
    reasons.push('시간 적합');
  } else if (!workerAvailTime) {
    // 조건 미입력이면 중립 처리
  }

  return { score, reasons };
}

module.exports = { computeMatchScore };
