# 이음 서버 (ieum-server)

이음WORK(워커앱)와 이음BIZ(사장님웹)가 함께 쓰는 백엔드 서버입니다.
1단계 범위: **로그인(휴대폰 인증) · 공고 등록/조회 · 매칭 점수 · 지원/선택**

---

## 1. GitHub에 올리기 (터미널 필요 없음)

1. https://github.com 접속 → 로그인 → 우측 상단 **+** → **New repository**
2. 저장소 이름: `ieum-server` (아무 이름이나 가능), Public 선택 → **Create repository**
3. 만들어진 빈 저장소 화면에서 **uploading an existing file** 클릭
4. 이 폴더 안의 파일들을 전부 드래그해서 업로드 (단, `node_modules` 폴더는 올리지 마세요 — 자동으로 설치됩니다)
5. 하단 **Commit changes** 클릭

## 2. Render에 배포하기 (무료)

1. https://render.com 접속 → GitHub 계정으로 가입/로그인
2. **New +** → **Web Service** 선택
3. 방금 만든 `ieum-server` 저장소 선택
4. 설정값:
   - **Name**: ieum-server (원하는 이름)
   - **Region**: Singapore (한국과 가장 가까움)
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. **Create Web Service** 클릭 → 2~3분 후 배포 완료
6. 화면 상단에 `https://ieum-server-xxxx.onrender.com` 같은 주소가 생깁니다. 이 주소가 앞으로 워커앱/사장님웹이 연결할 서버 주소예요.

> 무료 플랜은 15분간 요청이 없으면 서버가 잠들어요. 다음 요청 시 30~50초 정도 깨어나는 시간이 걸리지만, 테스트 단계에서는 문제없습니다.

## 3. 정상 작동 확인

브라우저에서 `https://받은주소/api/health` 로 접속했을 때 아래처럼 나오면 성공입니다.
```json
{"ok":true,"service":"ieum-server","time":"..."}
```

## 4. 이후 업데이트하는 법

파일이 수정되면, GitHub 저장소 화면에서 해당 파일을 다시 드래그해서 덮어쓰기(**Add file → Upload files**)만 하면 Render가 자동으로 다시 배포합니다. 별도 작업 필요 없어요.

---

## 로컬(내 컴퓨터)에서 먼저 테스트하고 싶다면

```bash
npm install
npm start
```
`http://localhost:3000/api/health` 로 확인. (단, 이 경우 폰에서는 접속할 수 없고 컴�퓨터 브라우저에서만 확인 가능합니다. 폰까지 테스트하려면 위 Render 배포가 필요해요.)

---

## API 요약 (1단계)

| 구분 | Method | 경로 | 설명 |
|---|---|---|---|
| 공통 | POST | /api/auth/request-otp | 인증번호 요청 |
| 공통 | POST | /api/auth/verify-otp | 인증번호 확인 → 로그인/가입, 토큰 발급 |
| 공통 | GET | /api/me | 내 정보 조회 |
| 워커 | PUT | /api/me/worker-profile | 직종/가능시간 등 저장 |
| 기업 | PUT | /api/me/employer-profile | 기업정보 저장 |
| 기업 | POST | /api/jobs | 공고 등록 |
| 기업 | GET | /api/jobs/mine | 내 공고 목록 |
| 기업 | PATCH | /api/jobs/:id/status | 공고 마감/재오픈 |
| 워커 | GET | /api/jobs/open | 열린 공고 목록 (매칭점수순 정렬) |
| 워커 | POST | /api/jobs/:id/apply | 공고 지원 |
| 워커 | GET | /api/applications/mine | 내 지원 현황 |
| 기업 | GET | /api/jobs/:id/applicants | 공고별 지원자 목록 |
| 기업 | PATCH | /api/applications/:id/status | 지원자 선택/거절 |

모든 요청(로그인 제외)은 헤더에 `Authorization: Bearer <토큰>` 필요.

## 다음 단계 (2단계 예정)
- QR 출퇴근 체크인/체크아웃
- 자동 정산 계산
- 계좌 등록, 평가/뱃지 시스템
