# 우리 반에 AI가 숨어있다

초등 고학년 수업용 **단체 채팅 속 숨은 AI 찾기** 웹앱입니다.

## 들어 있는 기능

- 교사가 4자리 방 코드 생성
- 학생 회원가입 없이 익명 동물 닉네임으로 입장
- 3 / 5 / 7분 채팅
- 게임 시작 시 AI 참가자 1명 자동 추가
- AI 난이도: 쉬움 / 보통 / 어려움
- 여러 기기의 채팅을 약 1.2초 간격으로 안전하게 동기화
- 채팅 종료 후 AI라고 생각하는 참가자 투표
- 교사 화면에서 투표 현황 확인
- 정답 공개 및 전체 투표 결과
- 전화번호 / 이메일 / URL 형태의 메시지 차단
- AI API 키는 브라우저에 노출하지 않고 Netlify Function에서만 사용

> **중요:** 이 버전은 한 학급 규모 수업용입니다. 학교 전체 서비스나 장기 공개 서비스용 인증·감사 시스템은 아닙니다.

---

# 1. Supabase 만들기

1. https://supabase.com 에서 새 프로젝트를 만듭니다.
2. 왼쪽 **SQL Editor**를 엽니다.
3. 이 프로젝트의 `supabase/schema.sql` 내용을 전부 붙여넣고 실행합니다.
4. **Project Settings → API Keys**에서 다음 값을 확인합니다.
   - Project URL
   - Publishable key (`sb_publishable_...`)
   - Secret key (`sb_secret_...`)
5. Secret key는 서버 전용입니다. 학생 화면, GitHub, 채팅 등에 공개하면 안 됩니다.

---

# 2. OpenAI API 키 준비

OpenAI API에서 API key를 준비합니다.

기본 모델은 `gpt-5.6-luna`입니다. 짧은 채팅 메시지를 여러 번 생성하는 비용 민감형 작업에 맞춰 설정해 두었습니다.

---

# 3. Netlify 배포

## 가장 쉬운 방법

1. 이 폴더를 GitHub 저장소에 올립니다.
2. Netlify → **Add new site → Import an existing project**
3. GitHub 저장소를 선택합니다.
4. 별도 build command는 필요 없습니다.
5. 배포 후 **Site configuration → Environment variables**에 아래 값을 추가합니다.

```text
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-luna
```

6. 환경변수를 저장한 뒤 **Deploys → Trigger deploy**로 다시 배포합니다.

---

# 4. 수업 시작

교사:
1. 배포된 사이트 접속
2. `교사용`
3. 주제 / 시간 / 난이도 설정
4. `방 만들기`
5. 학생들에게 4자리 코드 또는 QR 제공
6. 학생이 2명 이상 들어오면 `게임 시작`
7. 시간이 끝나면 자동으로 투표 화면으로 전환
8. 투표가 끝나면 `AI 정체 공개`

학생:
1. 같은 사이트 접속
2. `학생용`
3. 방 코드 입력
4. 자동 생성된 익명 닉네임으로 참여

---

# 수업 운영 권장

- 한 방에 **4~12명** 정도가 가장 추리하기 좋습니다.
- 한 학급이 20명 이상이면 2~3개 모둠으로 방을 나누는 것도 좋습니다.
- 채팅은 **3~5분** 정도가 적당합니다.
- AI 난이도는 첫 수업에 `보통`을 권장합니다.
- AI 공개 후 반드시 “왜 사람/AI라고 판단했는가?”를 말하게 하면 활동의 교육적 의미가 커집니다.

## AI가 거짓 경험을 말하지 않도록 한 이유

AI는 “나 어제 놀이공원 갔어”처럼 실제 경험이 있는 척하지 않도록 프롬프트에 제한을 두었습니다.
대신 “난 놀이공원이 더 재밌을 듯”처럼 취향과 가정 표현으로 참여합니다.

---

# 개인정보와 안전

- 학생 실명은 저장하지 않습니다.
- 익명 닉네임은 자동 생성됩니다.
- 전화번호, 이메일, URL 형식은 DB에서 차단합니다.
- 사진 업로드 기능은 없습니다.
- 게임 종료 후 AI 정체를 공개하도록 설계되어 있습니다.
- 수업이 끝난 뒤 오래된 기록은 Supabase에서 삭제하는 것을 권장합니다.

SQL Editor에서 수동 정리:

```sql
delete from public.rooms
where created_at < now() - interval '7 days';
```

`rooms`를 삭제하면 연결된 참가자·메시지·투표도 함께 삭제됩니다.

---

# 파일 구조

```text
ai-detective-classroom/
├─ index.html
├─ style.css
├─ app.js
├─ netlify.toml
├─ README.md
├─ supabase/
│  └─ schema.sql
└─ netlify/
   └─ functions/
      ├─ config.mjs
      └─ ai-turn.mjs
```

---

# 문제 해결

### 학생 채팅 반영이 느릴 때
기본적으로 약 1.2초 간격으로 방 상태와 메시지를 동기화합니다. 학교 Wi-Fi가 느리면 약간 더 늦게 보일 수 있습니다.

### AI만 말을 안 할 때
Netlify 환경변수의 아래 3개를 확인하세요.

- `SUPABASE_SECRET_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

Netlify Functions 로그에서 `ai-turn` 오류도 확인할 수 있습니다.

### 방 시작 버튼이 안 될 때
학생이 최소 2명 들어와야 시작됩니다.

### 같은 학생이 새로고침했을 때
같은 브라우저에서는 localStorage 키를 이용해 기존 익명 참가자로 다시 들어옵니다.

---

# 교사용 팁

AI가 너무 티 나면 `어려움`, 너무 못 찾으면 `쉬움`으로 바꾸어 새 방을 만드세요.

AI의 자동 발언 간격은 `netlify/functions/ai-turn.mjs`에서 조정할 수 있습니다.
