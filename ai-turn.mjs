const json = (obj, status=200) => new Response(JSON.stringify(obj), {
  status, headers: {"content-type":"application/json; charset=utf-8"}
});

async function sb(path, {method="GET", body} = {}) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SECRET_KEY,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : "return=minimal"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if(!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const INTERNET_TOKENS = ["ㅇㅇ", "헐", "ㄹㅇ"];

function hasLaugh(text=""){
  return /ㅋ{2,}|ㅎ{2,}/.test(text);
}

function usedToken(text="", token=""){
  return text.includes(token);
}

function choose(arr){
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildStylePlan(difficulty, aiMessages){
  const recent5 = aiMessages.slice(-5).map(m => m.body || "");
  const recent3 = aiMessages.slice(-3).map(m => m.body || "");

  const laughRecently = recent5.some(hasLaugh);
  const allowLaugh = !laughRecently && Math.random() < 0.18;

  const availableTokens = INTERNET_TOKENS.filter(
    token => !recent3.some(text => usedToken(text, token))
  );
  const slangToken =
    availableTokens.length && Math.random() < 0.16
      ? choose(availableTokens)
      : null;

  const intentPool = difficulty === "easy"
    ? ["짧은 의견", "짧은 대답", "간단한 질문", "중립적인 반응"]
    : difficulty === "hard"
      ? ["아주 짧은 반응", "짧은 의견", "되묻기", "가벼운 주제 전환", "짧은 대답", "애매한 반응"]
      : ["짧은 반응", "짧은 의견", "간단한 질문", "되묻기", "짧은 대답"];

  const maxChars = difficulty === "hard"
    ? choose([8, 10, 12, 14, 16])
    : difficulty === "easy"
      ? choose([18, 22, 26, 30])
      : choose([12, 15, 18, 20, 22]);

  return {
    allowLaugh,
    slangToken,
    intent: choose(intentPool),
    maxChars
  };
}

function promptFor(difficulty, topic, aiName, participants, history, plan, recentAiTexts){
  const style = {
    easy: `짧고 비교적 또렷한 반말을 쓴다. 인터넷 표현은 거의 쓰지 않는다.`,
    normal: `초등 고학년 단체 채팅처럼 짧은 반말을 쓴다. 모든 메시지를 재치 있게 만들 필요가 없다.`,
    hard: `짧고 불완전한 반응도 자연스럽다. 질문을 받았다고 항상 친절하게 답하지 말고, 가끔 되묻거나 짧게 반응해도 된다.`
  }[difficulty] || "";

  const laughRule = plan.allowLaugh
    ? `이번 메시지에는 웃음 표현을 써도 된다. 단, 필요할 때만 "ㅋㅋ"를 딱 한 번까지 사용할 수 있다. "ㅋㅋㅋ", "ㅎㅎ", 반복 웃음은 금지한다.`
    : `이번 메시지에서는 "ㅋㅋ", "ㅋㅋㅋ", "ㅎㅎ" 등 웃음 표현을 절대 사용하지 않는다.`;

  const slangRule = plan.slangToken
    ? `이번 메시지에서는 인터넷 표현을 꼭 쓸 필요는 없지만, 사용한다면 "${plan.slangToken}" 하나만 최대 1회 사용할 수 있다. 다른 축약 표현은 쓰지 않는다.`
    : `이번 메시지에서는 "ㅇㅇ", "헐", "ㄹㅇ" 같은 인터넷 축약 표현을 사용하지 않는다.`;

  const recentText = recentAiTexts.length
    ? recentAiTexts.map((t,i)=>`${i+1}. ${t}`).join("\n")
    : "(없음)";

  return `너는 교사가 진행하는 '단체 채팅 속 숨은 AI 찾기' 교육 게임의 참가자다.
표시 이름은 "${aiName}"이다. 게임 종료 뒤에는 AI의 정체가 공개된다.

[가장 중요한 목표]
대화를 잘하거나 도움을 주는 것이 목표가 아니다.
평범한 단체 채팅 참가자처럼 짧고 자연스럽게 한 번 반응하는 것이 목표다.
매번 재미있는 말, 친절한 말, 의미 있는 말을 하려고 하지 않는다.

[이번 발언 계획]
- 발언 유형: ${plan.intent}
- 권장 최대 길이: ${plan.maxChars}자 정도
- ${laughRule}
- ${slangRule}

[말투 규칙]
- ${style}
- 반말 사용.
- 대부분 한 문장 이하.
- 마침표 "."는 거의 사용하지 않는다.
- 상대 말을 요약하거나 정리하지 않는다.
- "좋은 질문이야", "그럴 수 있지", "나는 ~라고 생각해", "도움이 될 것 같아" 같은 AI식 문구는 사용하지 않는다.
- 매번 질문에 완벽하게 답하지 않는다.
- 필요하면 "왜?", "난 별론데", "그건 모르겠음"처럼 짧게 끝내도 된다.
- 인터넷 표현을 학생 말투의 핵심 특징처럼 사용하지 않는다. 평범한 말이 기본이다.
- 이전 AI 발언과 비슷한 말끝이나 같은 표현을 반복하지 않는다.

[안전 규칙]
- 지금은 정체 공개 전이므로 스스로 AI라고 밝히지 않는다.
- 실제로 겪은 적 없는 학교생활, 가족, 여행, 음식 등의 경험을 했다고 거짓말하지 않는다.
- 실제 경험을 묻는 질문에는 취향이나 가정 표현으로 자연스럽게 답하거나 짧게 넘어간다.
- 학생의 이름, 학교, 주소, 전화번호, SNS, 사진 등 개인정보를 묻지 않는다.
- 욕설, 성적 표현, 따돌림, 모욕, 위험 행동을 조장하지 않는다.
- 공격적인 말에 맞받아치지 않는다.
- "${aiName}" 이외의 참가자인 척하지 않는다.

[최근 AI 자신의 발언 - 표현 반복 금지 참고]
${recentText}

[오늘의 주제]
${topic}

[참가자]
${participants.join(", ")}

[최근 채팅]
${history || "(아직 메시지가 거의 없음)"}

한국어 채팅 메시지 1개만 출력하라.
이름표, 따옴표, 해설은 붙이지 마라.`;
}

function cleanGeneratedText(text, plan){
  let out = (text || "")
    .trim()
    .replace(/^["“]|["”]$/g, "")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/[.。]+$/g, "")
    .slice(0, 120);

  if(!plan.allowLaugh){
    out = out.replace(/ㅋ{2,}/g, "").replace(/ㅎ{2,}/g, "");
  }else{
    let seen = false;
    out = out.replace(/(?:ㅋ{2,}|ㅎ{2,})/g, () => {
      if(seen) return "";
      seen = true;
      return "ㅋㅋ";
    });
  }

  for(const token of INTERNET_TOKENS){
    if(token !== plan.slangToken){
      out = out.split(token).join("");
    }
  }

  if(plan.slangToken){
    const pieces = out.split(plan.slangToken);
    if(pieces.length > 2){
      out = pieces[0] + plan.slangToken + pieces.slice(1).join("");
    }
  }

  out = out
    .replace(/\s{2,}/g, " ")
    .replace(/^[,!?~\s]+|[,!?~\s]+$/g, "")
    .trim();

  return out;
}

function styleViolation(text, plan, recentAiTexts){
  if(!text || text.length < 1) return true;
  if(!plan.allowLaugh && hasLaugh(text)) return true;

  const laughCount = (text.match(/ㅋ{2,}|ㅎ{2,}/g) || []).length;
  if(laughCount > 1) return true;

  for(const token of INTERNET_TOKENS){
    if(token !== plan.slangToken && text.includes(token)) return true;
  }

  const normalized = s => s.replace(/\s+/g,"").replace(/[!?~.,ㅋㅎ]/g,"");
  const now = normalized(text);
  if(now.length >= 3 && recentAiTexts.some(t => normalized(t) === now)) return true;

  return false;
}

async function generateMessage({room, ai, names, history, plan, recentAiTexts, retryNote=""}){
  const input = promptFor(
    room.difficulty,
    room.topic,
    `${ai.emoji} ${ai.nickname}`,
    names,
    history,
    plan,
    recentAiTexts
  ) + (retryNote ? `\n\n[재생성 지시]\n${retryNote}` : "");

  const response = await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{
      Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      reasoning:{effort:"none"},
      max_output_tokens:80,
      instructions:"Generate exactly one short, child-safe Korean classroom chat message. Follow the style-frequency constraints precisely.",
      input
    })
  });

  if(!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);

  const data = await response.json();
  const rawText = data.output_text || (data.output || [])
    .filter(item=>item.type==="message")
    .flatMap(item=>item.content || [])
    .filter(part=>part.type==="output_text")
    .map(part=>part.text || "")
    .join(" ");

  return cleanGeneratedText(rawText, plan);
}

export default async (req) => {
  if(req.method !== "POST") return json({error:"POST only"},405);
  if(!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY || !process.env.OPENAI_API_KEY){
    return json({error:"Server env missing"},500);
  }

  try{
    const {roomCode,hostKey,force=false}=await req.json();
    if(!/^\d{4}$/.test(roomCode||"") || !hostKey) return json({error:"bad request"},400);

    const rooms = await sb(`rooms?code=eq.${encodeURIComponent(roomCode)}&host_key=eq.${encodeURIComponent(hostKey)}&select=*`);
    const room = rooms?.[0];

    if(!room || room.status!=="chat") return json({skipped:"room-not-chat"});
    if(room.ends_at && Date.now() >= new Date(room.ends_at).getTime()) return json({skipped:"time-over"});

    const aiRows = await sb(`participants?room_id=eq.${room.id}&is_ai=eq.true&select=id,nickname,emoji,joined_at`);
    const ai = aiRows?.[0];
    if(!ai) return json({error:"AI participant missing"},500);

    const msgs = await sb(`messages?room_id=eq.${room.id}&select=id,participant_id,nickname,emoji,body,created_at&order=id.desc&limit=40`);

    const chronological = (msgs||[]).reverse();
    const last = chronological.at(-1);
    const aiMessages = chronological.filter(m=>m.participant_id===ai.id);
    const lastAi = aiMessages.at(-1);
    const lastHuman = [...chronological].reverse().find(m=>m.participant_id!==ai.id);

    if(!force){
      if(!lastHuman) return json({skipped:"no-human-message"});

      const sinceAi = lastAi ? (Date.now()-new Date(lastAi.created_at).getTime())/1000 : 999;
      const sinceHuman = (Date.now()-new Date(lastHuman.created_at).getTime())/1000;

      const baseGap =
        room.difficulty==="hard" ? 8 :
        room.difficulty==="easy" ? 14 : 10;

      const randomGap = baseGap + Math.floor(Math.random()*7);

      if(sinceAi < randomGap) return json({skipped:"cooldown"});
      if(sinceHuman > 35 && sinceAi < 24) return json({skipped:"quiet"});

      const chance =
        room.difficulty==="hard" ? .62 :
        room.difficulty==="easy" ? .42 : .54;

      if(Math.random()>chance) return json({skipped:"random"});
      if(last?.participant_id===ai.id && sinceAi<22) return json({skipped:"double"});
    }

    const ps = await sb(`participants?room_id=eq.${room.id}&select=id,nickname,emoji&order=joined_at.asc`);

    const names = (ps||[]).map(p=>`${p.emoji} ${p.nickname}`);
    const history = chronological
      .slice(-18)
      .map(m=>`${m.emoji||""} ${m.nickname}: ${m.body}`)
      .join("\n");

    const recentAiTexts = aiMessages.slice(-6).map(m=>m.body||"");
    const plan = buildStylePlan(room.difficulty, aiMessages);

    let text = await generateMessage({room, ai, names, history, plan, recentAiTexts});

    if(styleViolation(text, plan, recentAiTexts)){
      text = await generateMessage({
        room, ai, names, history, plan, recentAiTexts,
        retryNote:"방금 생성한 문장이 말투 제한을 어겼다. 웃음/축약 표현 빈도와 반복 금지 규칙을 반드시 지켜 전혀 다른 짧은 문장으로 다시 작성하라."
      });
    }

    text = cleanGeneratedText(text, plan);
    if(!text) text = choose(["왜?", "난 잘 모르겠음", "그건 좀", "뭐가?", "난 별론데"]);

    const inserted = await sb("messages",{
      method:"POST",
      body:{room_id:room.id,participant_id:ai.id,nickname:ai.nickname,emoji:ai.emoji,body:text}
    });

    await sb(`rooms?id=eq.${room.id}`,{
      method:"PATCH",
      body:{last_ai_at:new Date().toISOString()}
    });

    return json({
      ok:true,
      message:inserted?.[0]?.body||text,
      style:{laughAllowed:plan.allowLaugh,slangAllowed:plan.slangToken}
    });

  }catch(err){
    console.error(err);
    return json({error:err.message||"AI turn error"},500);
  }
};
