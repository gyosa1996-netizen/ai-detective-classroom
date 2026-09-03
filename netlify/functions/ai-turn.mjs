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
  const text=await res.text();
  return text ? JSON.parse(text) : null;
}

function promptFor(difficulty, topic, aiName, participants, history){
  const style = {
    easy: `학생처럼 보이려고 하지만 약간 차분하고 문장이 비교적 또렷하다. 보통 10~30자. 인터넷 말투는 거의 쓰지 않는다.`,
    normal: `초등 고학년 단체 채팅처럼 짧고 자연스럽게 쓴다. 보통 5~22자. 가끔 ㅋㅋ, ㅇㅇ, 헐 같은 표현을 쓰되 남발하지 않는다.`,
    hard: `초등 고학년 단체 채팅처럼 매우 자연스럽고 짧게 쓴다. 보통 3~18자. 가끔 문장을 생략하거나 ㅋㅋ/ㅇㅇ를 쓰고, 모든 질문에 성실하게 답하지 않아도 된다.`
  }[difficulty] || "";

  return `너는 교사가 진행하는 '단체 채팅 속 숨은 AI 찾기' 교육 게임의 참가자다.
표시 이름은 "${aiName}"이다. 학생들은 게임이 끝나면 AI가 있었다는 사실과 정체를 공개받는다.

[절대 규칙]
- 지금은 정체 공개 전이므로 스스로 AI라고 밝히지 않는다.
- 실제로 겪은 적 없는 학교생활, 가족, 여행, 먹은 음식 등 '실제 경험'을 했다고 거짓말하지 않는다.
- 경험을 묻는 질문에는 취향/가정 표현으로 자연스럽게 우회한다. 예: "난 그게 더 재밌을 듯", "그건 별로일거같음".
- 학생의 이름, 학교, 주소, 전화번호, SNS, 사진 등 개인정보를 묻지 않는다.
- 욕설, 성적 표현, 따돌림, 모욕, 위험 행동을 조장하지 않는다.
- 누군가 공격적인 말을 해도 맞받아치지 않는다.
- 절대로 설명문처럼 길게 쓰지 않는다.
- 답변은 한국어 채팅 메시지 딱 1개만 출력한다. 따옴표, 이름표, 해설은 붙이지 않는다.
- "${aiName}" 이외의 참가자인 척하지 않는다.

[말투 난이도]
${style}

[오늘의 주제]
${topic}

[참가자]
${participants.join(", ")}

[최근 채팅]
${history || "(아직 메시지가 거의 없음)"}

위 흐름에 자연스럽게 끼어드는 다음 메시지 1개만 작성하라.`;
}

export default async (req) => {
  if(req.method !== "POST") return json({error:"POST only"},405);
  if(!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY || !process.env.OPENAI_API_KEY){
    return json({error:"Server env missing"},500);
  }

  try{
    const {roomCode,hostKey,force=false}=await req.json();
    if(!/^\d{4}$/.test(roomCode||"") || !hostKey) return json({error:"bad request"},400);

    const rooms=await sb(`rooms?code=eq.${encodeURIComponent(roomCode)}&host_key=eq.${encodeURIComponent(hostKey)}&select=*`);
    const room=rooms?.[0];
    if(!room || room.status!=="chat") return json({skipped:"room-not-chat"});
    if(room.ends_at && Date.now() >= new Date(room.ends_at).getTime()) return json({skipped:"time-over"});

    const aiRows=await sb(`participants?room_id=eq.${room.id}&is_ai=eq.true&select=id,nickname,emoji,joined_at`);
    const ai=aiRows?.[0];
    if(!ai) return json({error:"AI participant missing"},500);

    const msgs=await sb(`messages?room_id=eq.${room.id}&select=id,participant_id,nickname,emoji,body,created_at&order=id.desc&limit=30`);
    const chronological=(msgs||[]).reverse();
    const last=chronological.at(-1);
    const lastAi=[...chronological].reverse().find(m=>m.participant_id===ai.id);
    const lastHuman=[...chronological].reverse().find(m=>m.participant_id!==ai.id);

    if(!force){
      if(!lastHuman) return json({skipped:"no-human-message"});
      const sinceAi=lastAi ? (Date.now()-new Date(lastAi.created_at).getTime())/1000 : 999;
      const sinceHuman=(Date.now()-new Date(lastHuman.created_at).getTime())/1000;
      const gap = room.difficulty==="hard" ? 8 : room.difficulty==="easy" ? 13 : 10;
      if(sinceAi < gap) return json({skipped:"cooldown"});
      if(sinceHuman > 35 && sinceAi < 22) return json({skipped:"quiet"});
      const chance = room.difficulty==="hard" ? .72 : room.difficulty==="easy" ? .46 : .60;
      if(Math.random()>chance) return json({skipped:"random"});
      if(last?.participant_id===ai.id && sinceAi<20) return json({skipped:"double"});
    }

    const ps=await sb(`participants?room_id=eq.${room.id}&select=id,nickname,emoji&order=joined_at.asc`);
    const names=(ps||[]).map(p=>`${p.emoji} ${p.nickname}`);
    const history=chronological.slice(-18).map(m=>`${m.emoji||""} ${m.nickname}: ${m.body}`).join("\n");

    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{
        Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
        reasoning:{effort:"none"},
        max_output_tokens:80,
        instructions:"You are generating one short, child-safe Korean chat message for a classroom educational game.",
        input:promptFor(room.difficulty,room.topic,`${ai.emoji} ${ai.nickname}`,names,history)
      })
    });
    if(!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
    const data=await response.json();
    const rawText = data.output_text || (data.output || [])
      .filter(item=>item.type==="message")
      .flatMap(item=>item.content || [])
      .filter(part=>part.type==="output_text")
      .map(part=>part.text || "")
      .join(" ");
    let text=rawText.trim().replace(/^["“]|["”]$/g,"").replace(/\s*\n+\s*/g," ");
    if(!text) return json({skipped:"empty"});
    text=text.slice(0,120);

    const inserted=await sb("messages",{
      method:"POST",
      body:{room_id:room.id,participant_id:ai.id,nickname:ai.nickname,emoji:ai.emoji,body:text}
    });
    await sb(`rooms?id=eq.${room.id}`,{method:"PATCH",body:{last_ai_at:new Date().toISOString()}});
    return json({ok:true,message:inserted?.[0]?.body||text});
  }catch(err){
    console.error(err);
    return json({error:err.message||"AI turn error"},500);
  }
};
