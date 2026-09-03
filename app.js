const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let supabase = null;
let state = {
  mode: null,
  roomCode: null,
  roomId: null,
  hostKey: null,
  participantKey: null,
  participantId: null,
  nickname: null,
  emoji: null,
  room: null,
  participants: [],
  messages: [],
  selectedVote: null,
  voted: false,
  messageChannel: null,
  pollTimer: null,
  aiTimer: null,
};

const views = [
  "#homeView","#teacherCreateView","#studentJoinView","#teacherRoomView",
  "#studentGameView","#errorView"
];

function showView(id){
  views.forEach(v => $(v).classList.add("hidden"));
  $(id).classList.remove("hidden");
}
function toast(msg){
  const el=$("#toast"); el.textContent=msg; el.classList.add("show");
  clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove("show"),2200);
}
function randomKey(){
  const arr=new Uint8Array(24); crypto.getRandomValues(arr);
  return [...arr].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function cleanCode(v){ return (v||"").replace(/\D/g,"").slice(0,4); }
function fmtTime(sec){
  sec=Math.max(0,Math.floor(sec||0));
  return `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;
}
function secondsLeft(room){
  if(!room?.ends_at) return room?.duration_sec || 300;
  return Math.max(0,(new Date(room.ends_at).getTime()-Date.now())/1000);
}
function setSegment(group, value){
  $$(group+" button").forEach(b=>b.classList.toggle("active",b.dataset.value===String(value)));
}
function selectedSegment(group){ return $(group+" button.active")?.dataset.value; }
function escapeHtml(s=""){
  return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}

async function init(){
  bindUi();
  try{
    const res=await fetch("/.netlify/functions/config");
    if(!res.ok) throw new Error("Netlify 환경변수 설정을 확인하세요.");
    const cfg=await res.json();
    if(!cfg.supabaseUrl || !cfg.supabasePublishableKey) throw new Error("SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY가 없습니다.");
    supabase=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
  }catch(err){
    console.error(err);
    $("#errorText").textContent="배포 후 Netlify 환경변수와 Supabase 설정을 완료하면 사용할 수 있습니다. README.md의 설정 순서를 확인하세요.";
  }
}

function bindUi(){
  $("#homeBtn").onclick=()=>goHome();
  $("#showTeacherBtn").onclick=()=>showView("#teacherCreateView");
  $("#showStudentBtn").onclick=()=>showView("#studentJoinView");
  $$("[data-back='home']").forEach(b=>b.onclick=()=>goHome());

  ["#durationGroup","#difficultyGroup"].forEach(group=>{
    $$(group+" button").forEach(btn=>btn.onclick=()=>setSegment(group,btn.dataset.value));
  });

  $("#roomCodeInput").addEventListener("input",e=>e.target.value=cleanCode(e.target.value));
  $("#createRoomBtn").onclick=createRoom;
  $("#joinRoomBtn").onclick=joinRoom;
  $("#roomCodeInput").addEventListener("keydown",e=>{if(e.key==="Enter") joinRoom();});
  $("#startGameBtn").onclick=startGame;
  $("#beginVoteBtn").onclick=beginVote;
  $("#revealBtn").onclick=revealAi;
  $("#forceAiBtn").onclick=()=>triggerAi(true);
  $("#copyJoinLinkBtn").onclick=copyJoinLink;
  $("#newRoomBtn").onclick=()=>{stopLoops();showView("#teacherCreateView");};
  $("#messageForm").addEventListener("submit",sendMessage);
  $("#submitVoteBtn").onclick=submitVote;
}

function goHome(){
  stopLoops();
  state={...state,mode:null,roomCode:null,roomId:null,hostKey:null,participantId:null,nickname:null,room:null,participants:[],messages:[],selectedVote:null,voted:false};
  history.replaceState({}, "", location.pathname);
  showView("#homeView");
}

async function rpc(name,args={}){
  if(!supabase) throw new Error("DB 연결이 아직 준비되지 않았습니다.");
  const {data,error}=await supabase.rpc(name,args);
  if(error) throw error;
  return data;
}

async function createRoom(){
  try{
    $("#createRoomBtn").disabled=true;
    const hostKey=randomKey();
    const rows=await rpc("create_room",{
      p_topic:"자유대화",
      p_duration_sec:Number(selectedSegment("#durationGroup")||300),
      p_difficulty:selectedSegment("#difficultyGroup")||"normal",
      p_host_key:hostKey
    });
    const room=Array.isArray(rows)?rows[0]:rows;
    state.mode="teacher"; state.roomCode=room.code; state.roomId=room.room_id; state.hostKey=hostKey;
    localStorage.setItem(`ai_detective_host_${room.code}`,hostKey);
    const teacherUrl=new URL(location.href); teacherUrl.search=""; teacherUrl.searchParams.set("host",room.code);
    history.replaceState({}, "", teacherUrl);
    $("#teacherRoomCode").textContent=room.code;
    showView("#teacherRoomView");
    drawQr();
    await teacherTick();
    startTeacherLoops();
  }catch(e){toast(e.message||"방을 만들지 못했습니다.");}
  finally{$("#createRoomBtn").disabled=false;}
}

function drawQr(){
  const box=$("#qrBox"); box.innerHTML="";
  if(!window.QRCode) return;
  const url=new URL(location.href); url.searchParams.set("room",state.roomCode);
  new QRCode(box,{text:url.toString(),width:168,height:168,correctLevel:QRCode.CorrectLevel.M});
}

async function copyJoinLink(){
  const url=new URL(location.href); url.searchParams.set("room",state.roomCode);
  await navigator.clipboard.writeText(url.toString());
  toast("입장 링크를 복사했습니다.");
}

async function joinRoom(){
  const code=cleanCode($("#roomCodeInput").value);
  if(code.length!==4){toast("방 코드 4자리를 입력하세요.");return;}
  try{
    $("#joinRoomBtn").disabled=true;
    let participantKey=localStorage.getItem(`ai_detective_student_${code}`);
    if(!participantKey){participantKey=randomKey();localStorage.setItem(`ai_detective_student_${code}`,participantKey);}
    const rows=await rpc("join_room",{p_code:code,p_participant_key:participantKey});
    const p=Array.isArray(rows)?rows[0]:rows;
    state.mode="student";state.roomCode=code;state.roomId=p.room_id;state.participantKey=participantKey;
    state.participantId=p.participant_id;state.nickname=p.nickname;state.emoji=p.emoji;state.voted=!!p.has_voted;
    const studentUrl=new URL(location.href); studentUrl.search=""; studentUrl.searchParams.set("room",code);
    history.replaceState({}, "", studentUrl);
    $("#myNickname").textContent=`${p.emoji} ${p.nickname}`;
    $("#studentRoomCode").textContent=code;
    showView("#studentGameView");
    await studentTick();
    await loadMessages();
    startStudentLoops();
  }catch(e){toast(prettyError(e));}
  finally{$("#joinRoomBtn").disabled=false;}
}

function prettyError(e){
  const m=e?.message||String(e);
  if(m.includes("ROOM_NOT_FOUND")) return "없는 방 코드입니다.";
  if(m.includes("ROOM_ALREADY_STARTED")) return "이미 시작된 방입니다.";
  if(m.includes("ROOM_CLOSED")) return "종료된 방입니다.";
  if(m.includes("ROOM_FULL")) return "참가 인원이 가득 찼습니다.";
  if(m.includes("INVALID_MESSAGE")) return "메시지를 다시 확인하세요.";
  if(m.includes("PERSONAL_INFO_BLOCKED")) return "개인정보로 보이는 내용은 보낼 수 없습니다.";
  return m;
}

async function getRoom(){
  const rows=await rpc("get_room_public",{p_code:state.roomCode});
  const r=Array.isArray(rows)?rows[0]:rows;
  if(!r) throw new Error("방 정보를 찾지 못했습니다.");
  state.room=r; state.roomId=r.room_id; return r;
}
async function getParticipants(){
  state.participants=await rpc("list_participants",{p_code:state.roomCode}) || [];
  return state.participants;
}
async function loadMessages(){
  if(!state.roomCode) return;
  const rows=await rpc("get_messages",{p_code:state.roomCode});
  state.messages=rows||[];
  renderMessages();
}
function subscribeMessages(){
  // 보안상 DB 테이블을 브라우저에 직접 공개하지 않고,
  // room-scoped RPC를 약 1.2초 간격으로 읽어 동기화합니다.
}
function renderMessages(){
  const targets=state.mode==="teacher"?[$("#teacherMessages")]:[$("#studentMessages")];
  targets.forEach(box=>{
    if(!box) return;
    box.innerHTML=state.messages.map(m=>{
      const mine=state.mode==="student" && m.participant_id===state.participantId;
      return `<div class="message ${mine?"mine":""}">
        <div class="message-meta">${escapeHtml(m.emoji||"")} ${escapeHtml(m.nickname||"참가자")}</div>
        <div class="bubble">${escapeHtml(m.body||"")}</div>
      </div>`;
    }).join("");
    box.scrollTop=box.scrollHeight;
  });
}

async function teacherTick(){
  try{
    const [room,participants]=await Promise.all([getRoom(),getParticipants()]);
    if(room.status==="chat") await loadMessages();
    renderTeacherParticipants(participants);
    renderTeacherState(room);
  }catch(e){console.warn(e);}
}
async function studentTick(){
  try{
    const [room,participants]=await Promise.all([getRoom(),getParticipants()]);
    if(room.status==="chat") await loadMessages();
    renderStudentState(room,participants);
  }catch(e){console.warn(e);}
}

function renderTeacherParticipants(list){
  // 로비에서는 학생들이 교사 화면을 보더라도 닉네임/캐릭터를 미리 알 수 없게 한다.
  // 게임 시작 시 AI가 추가되므로, 로비 명단을 보여주면 새로 등장한 캐릭터가 AI라는 힌트가 된다.
  if(state.room?.status === "lobby"){
    $("#participantCount").textContent=list.length;
    $("#teacherParticipants").innerHTML = list.length
      ? `<div class="participant-item"><strong>학생 ${list.length}명 입장 완료</strong></div><div class="participant-item">🔒 닉네임은 게임 시작 후 공개</div>`
      : `<div class="participant-item">학생 입장을 기다리는 중</div>`;
    return;
  }

  $("#participantCount").textContent=list.length;
  $("#teacherParticipants").innerHTML=list.map(p=>`<div class="participant-item">${escapeHtml(p.emoji)} <strong>${escapeHtml(p.nickname)}</strong></div>`).join("");
}
function hideAllTeacherPanels(){
  ["#teacherLobbyPanel","#teacherChatPanel","#teacherVotePanel","#teacherRevealPanel"].forEach(x=>$(x).classList.add("hidden"));
}
function renderTeacherState(room){
  $("#teacherTimer").textContent=fmtTime(secondsLeft(room));
  hideAllTeacherPanels();
  if(room.status==="lobby"){
    $("#teacherStatusTitle").textContent="학생 입장을 기다리는 중";
    $("#teacherLobbyPanel").classList.remove("hidden");
  }else if(room.status==="chat"){
    $("#teacherStatusTitle").textContent="누가 AI인지 추리하며 대화 중";
    $("#teacherChatPanel").classList.remove("hidden");
  }else if(room.status==="vote"){
    $("#teacherStatusTitle").textContent="AI 정체 투표";
    $("#teacherVotePanel").classList.remove("hidden");
    loadTeacherResults(false);
  }else if(room.status==="reveal"){
    $("#teacherStatusTitle").textContent="정체 공개";
    $("#teacherRevealPanel").classList.remove("hidden");
    $("#teacherAiReveal").textContent=`${room.ai_emoji||"🤖"} ${room.ai_nickname||"AI"}`;
    loadTeacherResults(true);
  }
}
function hideAllStudentPanels(){
  ["#studentLobbyPanel","#studentChatPanel","#studentVotePanel","#studentRevealPanel"].forEach(x=>$(x).classList.add("hidden"));
}
function renderStudentState(room,participants){
  $("#studentTimer").textContent=fmtTime(secondsLeft(room));
  hideAllStudentPanels();
  if(room.status==="lobby"){
    $("#studentLobbyPanel").classList.remove("hidden");
    // 로비에서는 캐릭터/닉네임을 숨긴다. 게임 시작 뒤 사람과 AI가 동시에 처음 보이게 한다.
    $("#studentParticipantsLobby").innerHTML=`<span class="chip">현재 ${participants.length}명 입장</span><span class="chip">🔒 참가자 닉네임 비공개</span>`;
  }else if(room.status==="chat"){
    $("#studentChatPanel").classList.remove("hidden");
  }else if(room.status==="vote"){
    $("#studentVotePanel").classList.remove("hidden");
    renderVoteChoices(participants);
  }else if(room.status==="reveal"){
    $("#studentRevealPanel").classList.remove("hidden");
    $("#studentAiReveal").textContent=`${room.ai_emoji||"🤖"} ${room.ai_nickname||"AI"}`;
    loadPublicResults();
  }
}

async function startGame(){
  try{
    $("#startGameBtn").disabled=true;
    await rpc("host_start_room",{p_code:state.roomCode,p_host_key:state.hostKey});
    await teacherTick(); await loadMessages();
    triggerAi(true);
  }catch(e){toast(prettyError(e));}
  finally{$("#startGameBtn").disabled=false;}
}
async function beginVote(){
  try{
    await rpc("host_begin_vote",{p_code:state.roomCode,p_host_key:state.hostKey});
    await teacherTick();
  }catch(e){toast(prettyError(e));}
}
async function revealAi(){
  try{
    await rpc("host_reveal",{p_code:state.roomCode,p_host_key:state.hostKey});
    await teacherTick();
  }catch(e){toast(prettyError(e));}
}

async function sendMessage(e){
  e.preventDefault();
  const input=$("#messageInput"); const body=input.value.trim();
  if(!body) return;
  try{
    input.disabled=true;
    await rpc("send_message",{p_code:state.roomCode,p_participant_key:state.participantKey,p_body:body});
    input.value="";
  }catch(err){toast(prettyError(err));}
  finally{input.disabled=false;input.focus();}
}
function renderVoteChoices(list){
  const candidates=list.filter(p=>p.participant_id!==state.participantId);
  $("#studentVoteChoices").innerHTML=candidates.map(p=>`<button class="vote-choice ${state.selectedVote===p.participant_id?"selected":""}" data-id="${p.participant_id}" type="button">${escapeHtml(p.emoji)} ${escapeHtml(p.nickname)}</button>`).join("");
  $$("#studentVoteChoices .vote-choice").forEach(b=>b.onclick=()=>{
    if(state.voted) return;
    state.selectedVote=b.dataset.id; renderVoteChoices(list);
  });
  $("#submitVoteBtn").classList.toggle("hidden",state.voted);
  $("#votedMessage").classList.toggle("hidden",!state.voted);
}
async function submitVote(){
  if(!state.selectedVote){toast("한 명을 선택하세요.");return;}
  try{
    await rpc("submit_vote",{p_code:state.roomCode,p_participant_key:state.participantKey,p_target_id:state.selectedVote});
    state.voted=true; renderVoteChoices(state.participants); toast("투표했습니다.");
  }catch(e){toast(prettyError(e));}
}

async function loadTeacherResults(finalMode){
  try{
    const rows=await rpc("host_get_results",{p_code:state.roomCode,p_host_key:state.hostKey})||[];
    const meta=rows[0]||{};
    $("#voteProgress").textContent=`${meta.total_votes||0} / ${meta.total_humans||0}`;
    renderBars(finalMode?$("#teacherFinalBars"):$("#teacherVoteBars"),rows);
  }catch(e){console.warn(e);}
}
async function loadPublicResults(){
  try{
    const rows=await rpc("get_public_results",{p_code:state.roomCode})||[];
    renderBars($("#studentFinalBars"),rows);
  }catch(e){console.warn(e);}
}
function renderBars(box,rows){
  if(!box) return;
  const max=Math.max(1,...rows.map(r=>Number(r.vote_count||0)));
  box.innerHTML=rows.map(r=>`<div class="bar-row">
    <div class="bar-label">${escapeHtml(r.emoji||"")} ${escapeHtml(r.nickname||"")}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${Math.round((Number(r.vote_count||0)/max)*100)}%"></div></div>
    <div class="bar-count">${Number(r.vote_count||0)}</div>
  </div>`).join("");
}

async function triggerAi(force=false){
  if(state.mode!=="teacher" || !state.roomCode || !state.hostKey || state.room?.status!=="chat") return;
  try{
    await fetch("/.netlify/functions/ai-turn",{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({roomCode:state.roomCode,hostKey:state.hostKey,force})
    });
  }catch(e){console.warn("AI turn failed",e);}
}

function startTeacherLoops(){
  if(state.pollTimer) clearInterval(state.pollTimer);
  if(state.aiTimer) clearInterval(state.aiTimer);
  state.pollTimer=setInterval(async()=>{
    await teacherTick();
    if(state.room?.status==="chat"){
      if(secondsLeft(state.room)<=0) await beginVote();
    }
  },1200);
  state.aiTimer=setInterval(()=>triggerAi(false),6000);
}
function startStudentLoops(){
  if(state.pollTimer) clearInterval(state.pollTimer);
  if(state.aiTimer) clearInterval(state.aiTimer);
  state.aiTimer=null;
  state.pollTimer=setInterval(studentTick,1200);
}
function stopLoops(){
  if(state.pollTimer) clearInterval(state.pollTimer);
  if(state.aiTimer) clearInterval(state.aiTimer);
  state.pollTimer=state.aiTimer=null;
  if(state.messageChannel && supabase){supabase.removeChannel(state.messageChannel);state.messageChannel=null;}
}

window.addEventListener("beforeunload",stopLoops);
init().then(async()=>{
  if(!supabase) return;
  const url=new URL(location.href);
  const hostCode=cleanCode(url.searchParams.get("host"));
  if(hostCode.length===4){
    const hostKey=localStorage.getItem(`ai_detective_host_${hostCode}`);
    if(hostKey){
      state.mode="teacher";state.roomCode=hostCode;state.hostKey=hostKey;
      $("#teacherRoomCode").textContent=hostCode;showView("#teacherRoomView");drawQr();
      await teacherTick();await loadMessages();
      startTeacherLoops();return;
    }
  }
  const code=cleanCode(url.searchParams.get("room"));
  if(code.length===4){$("#roomCodeInput").value=code;showView("#studentJoinView");}
});
