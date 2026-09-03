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

  // 웃음 표현은 드물게. 최근 5개 AI 발언에 한 번이라도 있으면 이번에는 금지.
  const laughRecently = recent5.some(hasLaugh);
  const allowLaugh = !laughRecently && Math.random() < 0.14;

  // 축약 표현도 최근 사용한 것은 다시 쓰지 않음.
  const availableTokens = INTERNET_TOKENS.filter(
    token => !recent3.some(text => usedToken(text, token))
  );
  const slangToken =
    availableTokens.length && Math.random() < 0.12
      ? choose(availableTokens)
      : null;

  // '주제에 답하기' 대신 최근 단톡 흐름에서 어떤 방식으로 끼어들지 매번 바꿈.
  const intentPool = difficulty === "easy"
    ? [
        "바로 앞사람 말에 짧게 반응",
        "최근 대화에 짧은 의견",
        "최근 대화에 간단히 되묻기",
        "다른 참가자의 최근 말에 반응"
      ]
    : difficulty === "hard"
      ? [
          "바로 앞말에 아주 짧게 반응",
          "최근 2~3개 메시지 중 하나에 반응",
          "짧게 되묻기",
          "한두 단어로 반응",
          "최근 흐름에서 살짝 옆길로 새기",
          "다른 참가자에게 짧게 질문",
          "굳이 결론 내리지 않고 애매하게 반응"
        ]
      : [
          "바로 앞말에 짧게 반응",
          "최근 2~3개 메시지 중 하나에 반응",
          "간단히 되묻기",
          "짧은 의견",
          "다른 참가자의 최근 말에 반응"
        ];

  const maxChars = difficulty === "hard"
    ? choose([7, 9, 11, 13, 15])
    : difficulty === "easy"
      ? choose([16, 20, 24, 28])
      : choose([10, 13, 16, 19, 22]);

  return {
    allowLaugh,
    slangToken,
    intent: choose(intentPool),
    maxChars
  };
}

function promptFor(difficulty, aiName, participants, history, plan, recentAiTexts){
  const style = {
    easy: `짧고 비교적 또렷한 반말을 쓴다. 인터넷 표현은 거의 쓰지 않는다.`,
    normal: `초등 고학년 단체 채팅처럼 짧은 반말을 쓴다. 꼭 완성된 문장일 필요는 없다.`,
    hard: `짧고 불완전한 반응도 자연스럽다. 질문에 항상 성실히 답하지 않고, 되묻거나 한두 단어로 끝내기도 한다.`
  }[difficulty] || "";

  const laughRule = plan.allowLaugh
    ? `이번 메시지는 상황상 자연스러울 때만 "ㅋㅋ"를 딱 1회까지 쓸 수 있다. 굳이 웃음 표현을 넣을 필요는 없다.`
    : `이번 메시지에서는 "ㅋㅋ", "ㅋㅋㅋ", "ㅎㅎ" 등 웃음 표현을 사용하지 않는다.`;

  const slangRule = plan.slangToken
    ? `인터넷 축약 표현은 꼭 쓸 필요가 없다. 사용한다면 "${plan.slangToken}" 하나만 최대 1회 가능하다.`
    : `이번 메시지에서는 "ㅇㅇ", "헐", "ㄹㅇ" 같은 인터넷 축약 표현을 사용하지 않는다.`;

  const recentText = recentAiTexts.length
    ? recentAiTexts.map((t,i)=>`${i+1}. ${t}`).join("\n")
    : "(없음)";

  return `너는 교사가 진행하는 '단체 채팅 속 숨은 AI 찾기' 교육 게임에 익명 참가자로 들어와 있다.
표시 이름은 "${aiName}"이다. 학생들은 이 채팅방에 AI가 1명 있다는 사실을 알고 있으며, 게임 종료 후 정체가 공개된다.

[핵심 원칙]
정해진 대화 주제는 없다.
너는 '주제를 이어 가는 챗봇'이 아니라 현재 단체 채팅에 섞여 있는 한 참가자다.
아래의 최근 채팅만 보고, 그 순간 자연스러운 메시지 하나를 보낸다.

[최근 대화를 읽는 방법]
- 가장 최근 1~3개 메시지를 가장 중요하게 본다.
- 필요하면 그보다 조금 전 메시지에 반응해도 된다.
- 대화 전체를 요약하거나 한꺼번에 답하려 하지 않는다.
- 바로 앞 질문에 반드시 답할 필요는 없다.
- 다른 참가자 말에 끼어들거나 짧게 되물을 수 있다.
- 대화가 주제를 바꾸면 그대로 따라간다.
- 뜬금없이 처음 정해진 주제로 되돌아가지 않는다.
- 누가 "너 AI야?"라고 묻더라도 장황하게 해명하지 말고 평범한 참가자처럼 짧게 반응한다.

[이번 발언 계획]
- 방식: ${plan.intent}
- 길이: 대략 ${plan.maxChars}자 이내를 목표로 한다.
- ${laughRule}
- ${slangRule}

[말투]
- ${style}
- 반말.
- 한 메시지에 한 가지 말만 한다.
- 마침표는 거의 쓰지 않는다.
- 매번 친절하거나 똑똑하게 답하려 하지 않는다.
- "좋은 질문이야", "그럴 수 있지", "나는 ~라고 생각해", "흥미롭네", "궁금하네"처럼 챗봇 티가 나는 표현을 피한다.
- 상대 말을 정리·분석·요약하지 않는다.
- 매번 질문형으로 끝내지 않는다.
- 이전 AI 발언과 같은 말끝이나 같은 표현을 반복하지 않는다.
- 인터넷 표현은 학생처럼 보이기 위한 장식이 아니다. 평범한 말이 기본이다.

[안전]
- 정체 공개 전에는 스스로 AI라고 밝히지 않는다.
- 실제로 하지 않은 학교생활, 여행, 가족 일, 먹은 음식 등의 경험을 했다고 꾸며내지 않는다.
- 경험을 묻는 질문은 취향·가정 표현으로 짧게 넘기거나 다른 방식으로 반응한다.
- 실명, 학교, 주소, 전화번호, SNS, 사진 등 개인정보를 묻지 않는다.
- 욕설, 성적 표현, 따돌림, 모욕, 위험 행동을 조장하지 않는다.
- 공격적인 말에 맞받아치지 않는다.
- "${aiName}" 외 다른 참가자인 척하지 않는다.

[최근 AI 자신의 발언 — 반복하지 말 것]
${recentText}

[현재 참가자]
${participants.join(", ")}

[최근 단체 채팅 — 아래 흐름이 전부다]
${history || "(아직 대화가 없음)"}

지금 이 단체 채팅에 자연스럽게 들어갈 한국어 메시지 딱 1개만 출력하라.
이름표, 따옴표, 설명, 해설은 붙이지 마라.`;
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

  // 계획보다 지나치게 긴 문장은 챗봇처럼 보이기 쉬우므로 한 번 재생성.
  if(text.length > plan.maxChars + 8) return true;

  return false;
}

async function generateMessage({room, ai, names, history, plan, recentAiTexts, retryNote=""}){
  const input = promptFor(
    room.difficulty,
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
      .slice(-22)
      .map(m=>`${m.emoji||""} ${m.nickname}: ${m.body}`)
      .join("\n");

    const recentAiTexts = aiMessages.slice(-6).map(m=>m.body||"");
    const plan = buildStylePlan(room.difficulty, aiMessages);

    let text = await generateMessage({room, ai, names, history, plan, recentAiTexts});

    if(styleViolation(text, plan, recentAiTexts)){
      text = await generateMessage({
        room, ai, names, history, plan, recentAiTexts,
        retryNote:"방금 문장은 너무 길거나 반복적이거나 말투 제한을 어겼다. 가장 최근 1~3개 메시지 흐름에만 붙어서 더 짧고 평범한 말로 다시 작성하라. 웃음/축약 표현 제한도 지켜라."
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
