// 「손잡이 동아리」 이야기 지도 — 장면 · 선택지 · 효과 · 엔딩 판정 (기획서 5~7절 그대로)
// DOM · Firebase 없음 → 진행판 · 크롬북 · node 시험이 모두 이 파일 하나를 쓴다.
//
// 대사 한 줄 = [말하는 사람, 표정, 글, (조건)]
//   말하는 사람: null(설명) · me(주인공) · A · B · C(슬롯) · T(테누) · bong · miko · hala · bara · kamu · kids(후배들)
//   표정: 0 기본 · 1 활짝(주인공은 놀람) · 2 수줍음(주인공 · 테누는 웃음)
//   글 속 자리표: {me} 주인공 이름 · {A}{B}{C} 슬롯 친구 · {top} 호감 1위 · {dev} 3년 쓴 장치
//   조사: {me:이} → 이/가 · {A:은} → 은/는 · {C:을} → 을/를 · {B:과} → 과/와 · {me:아} → 아/야 · {dev:이}

// ── 사람 ──────────────────────────────────────────────────────────
export const NAMES = { m: ['한결', '준호', '시우', '도윤'], f: ['다온', '지유', '서연', '하은'] };

// 그림 id → 표시 이름 · 색(이름표 테두리). 색은 이름표에만, 늘 이름 글자와 함께 쓴다
export const CHARS = {
  hangyeol: { name: '한결', full: '한결', color: '#7EC8E3' },
  daon:     { name: '다온', full: '다온', color: '#7EC8E3' },
  soyun:    { name: '소윤', full: '한소윤', color: '#F2C94C' },
  eungyeol: { name: '은결', full: '서은결', color: '#9AD0EC' },
  harin:    { name: '하린', full: '도하린', color: '#F2994A' },
  hanbyeol: { name: '한별', full: '주한별', color: '#F2994A' },
  chaewon:  { name: '채원', full: '유채원', color: '#8BC34A' },
  haru:     { name: '하루', full: '민하루', color: '#8BC34A' },
  tenu:     { name: '테누', full: '테누', color: '#E5534B' },
  bong:     { name: '봉 선생님', full: '봉 선생님', color: '#C9A227' },
  miko:     { name: '미코', full: '미코', color: '#F48FB1' },
  hala:     { name: '할라 할머니', full: '할라 할머니', color: '#5C6BC0' },
  bara:     { name: '바라 선생님', full: '바라 선생님', color: '#26A69A' },
  kamu:     { name: '카무 아저씨', full: '카무 아저씨', color: '#A1887F' },
  kids:     { name: '후배들', full: '후배들', color: '#B0AEA5' },
};

export const SLOT_CHARS = {
  m: { A: 'soyun', B: 'harin', C: 'chaewon' },   // 남주인공 → 여자 셋
  f: { A: 'eungyeol', B: 'hanbyeol', C: 'haru' }, // 여주인공 → 남자 셋
};
export const SLOT_ROLE = { A: '듣는 사람', B: '만드는 사람', C: '아끼는 사람' };
const FIXED_ROLE = { T: 'tenu', bong: 'bong', miko: 'miko', hala: 'hala', bara: 'bara', kamu: 'kamu', kids: 'kids' };

/** 말하는 사람(역할) → 그림 id */
export function roleChar(role, run) {
  if (!role) return null;
  if (role === 'me') return run && run.g === 'f' ? 'daon' : 'hangyeol';
  if (role === 'A' || role === 'B' || role === 'C') return SLOT_CHARS[run && run.g === 'f' ? 'f' : 'm'][role];
  return FIXED_ROLE[role] || null;
}
export function roleName(role, run) {
  if (role === 'me') return (run && run.name) || (run && run.g === 'f' ? '다온' : '한결');
  const id = roleChar(role, run);
  return id ? CHARS[id].name : '';
}

// ── 조사 ──────────────────────────────────────────────────────────
const JOSA = { 이: ['이', '가'], 은: ['은', '는'], 을: ['을', '를'], 과: ['과', '와'], 아: ['아', '야'], 이랑: ['이랑', '랑'], 이야: ['이야', '야'], 으로: ['으로', '로'] };
export function batchim(word) {
  const c = String(word).charCodeAt(String(word).length - 1);
  if (c < 0xAC00 || c > 0xD7A3) return 0;
  return (c - 0xAC00) % 28;   // 0 = 받침 없음, 8 = ㄹ
}
export function josa(word, j) {
  const pair = JOSA[j];
  if (!pair) return word + j;
  const b = batchim(word);
  if (j === '으로') return word + (b === 0 || b === 8 ? '로' : '으로');
  return word + (b ? pair[0] : pair[1]);
}

// ── 상태 값 ──────────────────────────────────────────────────────
// h 🤝 함께 · o 🌱 오래 · u 💡 이해 · w ⚠ 헛걸음 · A B C 슬롯 호감 · T 테누 우정 · book 📘 후배 설명서
export const RANGE = { h: 10, o: 10, u: 10, w: 5, A: 9, B: 9, C: 9, T: 5 };
export const SHOWN = [
  { k: 'h', icon: '🤝', label: '함께' },
  { k: 'o', icon: '🌱', label: '오래' },
  { k: 'u', icon: '💡', label: '이해' },
];
export function zeroStats() { return { h: 0, o: 0, u: 0, w: 0, A: 0, B: 0, C: 0, T: 0, book: false }; }

export function applyFx(st, fx) {
  const s = { ...st };
  for (const [k, v] of Object.entries(fx || {})) {
    if (k === 'book') { s.book = s.book || !!v; continue; }
    s[k] = Math.max(0, Math.min(RANGE[k], (s[k] || 0) + v));
  }
  return s;
}

// ── 장면 · 갈림길 ────────────────────────────────────────────────
// 배경 id: field 학교 벚꽃 운동장 · club 동아리실 · call 교실 화상 통화 · fest 축제 부스 · well 루미타 우물 길 ·
//          market 루미타 장터 · forge 테누 대장간 · roof 지붕과 빗물 탱크 · night 밤의 루미타 · snow 눈 오는 하굣길 ·
//          hall 강당 졸업식 · garden 학교 텃밭
const N = {};

N.P = { type: 'scene', when: '3년 뒤', title: '졸업식 아침', bg: 'hall', cast: [], next: 'V0', lines: [
  [null, 0, '3년 뒤, 북적이는 졸업식 날 아침.'],
  [null, 0, '교복 주머니에서 바스락, 편지 한 장이 만져진다.'],
  [null, 0, '내가 누구에게 건네려던 편지였더라?'],
  [null, 0, '나는 누구와 어떤 졸업식을 맞이하게 될까?'],
] };

N.V0 = { type: 'choice', when: '시작', title: '주인공 고르기', bg: 'hall', time: 30, gender: true, next: 'S1',
  q: '이야기 속 주인공을 골라 보자',
  opts: [
    { label: '남학생 — 기본 이름 한결', fx: {} },
    { label: '여학생 — 기본 이름 다온', fx: {} },
    { label: '랜덤 — 주사위로 정하기', fx: {} },
  ] };

N.S1 = { type: 'scene', when: '중1 · 3월', title: '손잡이 동아리 첫날', bg: 'club', cast: ['A', 'B', 'C'], next: 'V1', lines: [
  [null, 0, '중학교 1학년 3월, 시끌벅적한 동아리 홍보 날이다.'],
  ['bong', 1, '어서 오렴! 「손잡이」는 문손잡이, 그리고 함께 손잡기란다.'],
  ['A', 0, '선생님, 질문 있어요. 여기선 누구를 위해 만들어요?'],
  ['B', 1, '오, 망가진 거 고치는 일이면 나 자신 있어!'],
  ['C', 0, '재료비는 많이 들어요? 아껴서 오래 쓰면 좋겠어요.'],
  ['bong', 0, '다들 질문이 날카롭네. 자, 편한 자리에 앉으렴.'],
] };

N.V1 = { type: 'choice', when: '중1 · 3월', title: '첫날 옆자리', bg: 'club', cast: ['A', 'B', 'C'], time: 20, next: 'S2',
  q: '설레는 첫날, 누구 옆자리에 앉아 볼까?',
  opts: [
    { label: '{A} 옆에 앉기 — 질문하던 친구', fx: { A: 2 }, after: [
      ['A', 2, '아, 안녕. 내 이름은 {A}. 수첩 같이 볼래?'],
      [null, 0, '{A} 수첩엔 궁금한 점이 빼곡히 적혀 있다.'],
    ] },
    { label: '{B} 옆에 앉기 — 고치기 좋아하는 친구', fx: { B: 2 }, after: [
      ['B', 1, '반가워! 내 이름은 {B}. 이 고장 난 손전등 좀 봐!'],
      [null, 0, '{B:은} 눈을 반짝이며 벌써 나사를 풀고 있다.'],
    ] },
    { label: '{C} 옆에 앉기 — 아껴 쓰는 친구', fx: { C: 2 }, after: [
      ['C', 1, '안녕! 나는 {C}. 버린 페트병으로 화분 만들어 볼래?'],
      [null, 0, '{C:은} 가방에서 바스락대는 씨앗 봉투를 꺼냈다.'],
    ] },
  ] };

N.S2 = { type: 'scene', when: '중1 · 4월', title: '루미타와 첫 화상 통화', bg: 'call', cast: ['bara', 'T', 'miko'], next: 'V2', lines: [
  [null, 0, '화면이 켜지자 햇살 가득한 루미타 학교 교실이 보인다.'],
  ['bara', 1, '반가워요! 여기는 카렌도의 루미타 마을이에요.'],
  ['T', 1, '안녕! 난 테누. 우리 집은 쇠를 다루는 대장간이야!'],
  [null, 0, '테누 뒤에서 작은 아이가 빼꼼 고개를 내민다. 동생 미코다.'],
  ['bong', 0, '자, 루미타와 만나는 첫 시간이야. 뭐부터 할까?'],
] };

N.V2 = { type: 'choice', when: '중1 · 4월', title: '무엇부터 할까?', bg: 'call', cast: ['bara', 'T', 'miko'], time: 20, next: 'S3',
  q: '첫 화상 통화, 무엇부터 할까?',
  opts: [
    { label: '우리가 준비한 발표부터 보여 주기', fx: { u: 1 }, after: [
      [null, 0, '우리가 준비한 동아리 발표 화면을 먼저 띄웠다.'],
      ['bara', 1, '발표 잘 봤어요! 기술 공부를 열심히 했네요.'],
      ['T', 0, '이제 우리 마을 이야기도 들어 줄래?'],
    ] },
    { label: '마을 사람들 이야기부터 먼저 듣기', fx: { h: 2, T: 1 }, after: [
      ['T', 0, '우리 마을은 우물이 멀어서 하루에도 몇 번씩 오가야 해.'],
      ['miko', 0, '물통이 너무 무거워서 팔이 욱신거려.'],
      ['bara', 1, '우리 얘기부터 물어봐 줘서 고마워요.'],
    ] },
    { label: '필요한 물건 목록부터 달라고 하기', fx: { w: 1 }, rethink: '물건 목록부터 받기 — 진짜 필요한 건 마을과 이야기하며 함께 찾아야 한다', after: [
      ['bara', 0, '목록이요? 음… 이야기 나누며 같이 정하면 좋겠어요.'],
      ['T', 1, '사실… 밖에서 온 기계는 고장 나면 부품이 없어서 창고에 쌓여.'],
      ['bong', 0, '다들 처음엔 그런단다. 다음엔 먼저 물어볼까?'],
    ] },
  ] };

N.S3 = { type: 'scene', when: '중1 · 6월', title: '물 문제', bg: 'well', cast: ['T', 'hala'], next: 'V3', lines: [
  [null, 0, '중1 6월, 더운 날 루미타에서 영상이 왔다.'],
  [null, 0, '아이들이 무거운 물통을 이고 붉은 흙길을 걸어간다.'],
  ['T', 0, '우물까지 걸어서 40분이야. 우기엔 빗물이 그냥 다 흘러가.'],
  ['hala', 1, '비가 언제, 얼마나 오는지는 내가 다 알고 있단다.'],
  ['bong', 0, '누구를 위한 기술일까? 마을의 하루를 떠올려 보자.'],
] };

N.V3 = { type: 'choice', when: '중1 · 6월', title: '물, 어떻게?', bg: 'well', cast: ['T', 'hala'], time: 20, next: 'S4',
  q: '물 문제, 어떻게 함께 풀어 볼까?',
  opts: [
    { label: '마을과 함께 굴리는 물통 시험하기', fx: { h: 1, o: 1, u: 1 }, card: 'roll', after: [
      [null, 0, '도넛 모양 물통에 물을 채워 줄로 데구루루 굴렸다.'],
      ['T', 1, '머리에 이는 것보다 훨씬 가벼워! 손잡이는 우리가 고쳐 쓸게.'],
      ['miko', 1, '우아, 이건 나 혼자서도 굴릴 수 있어!'],
    ] },
    { label: '물 배달 트럭 후원금 모으기', fx: { w: 1 }, rethink: '물 배달 트럭 후원 — 기름값이 끊기면 마을 스스로 이어 갈 수 없다', after: [
      [null, 0, '모은 후원금으로 한 달 동안 트럭이 물을 날랐다.'],
      ['T', 0, '고마워. 그런데 기름값이 다 떨어지니까 트럭이 오질 않아.'],
      ['hala', 1, '사실은… 우리 손으로 오래 이어 갈 방법이 필요하단다.'],
    ] },
    { label: '할라 할머니께 듣고 빗물 모으기', fx: { h: 1, o: 2 }, card: 'rain', after: [
      ['hala', 1, '지붕 먼지가 섞인 첫 비는 흘려보내고, 그다음 비를 모으렴.'],
      [null, 0, '지붕에 홈통을 잇고 뚜껑 달린 탱크까지 마을이 직접 만들었다.'],
      ['T', 1, '우기에 모은 빗물을 건기까지 쓸 수 있겠어!'],
    ] },
  ] };

N.S4 = { type: 'scene', when: '중1 · 10월', title: '축제 거름 부스', bg: 'fest', cast: ['A', 'B', 'C'], next: 'V4', lines: [
  [null, 0, '중1 10월, 시끌벅적한 학교 축제 날이다.'],
  [null, 0, '우리 부스는 「흙탕물 거르기」. 정수 빨대처럼 거르는 원리다.'],
  ['B', 1, '모래랑 숯, 천을 층층이 깔면 흙탕물이 맑게 걸러져!'],
  ['C', 0, '대신 바닷물 속 소금까지는 못 걸러. 그 점도 꼭 알려 주자.'],
  ['A', 0, '손님들이 뭐가 궁금한지부터 먼저 물어보자.'],
  ['bong', 1, '부스는 둘씩 짝지어 지키자. 누구랑 할래?'],
] };

N.V4 = { type: 'choice', when: '중1 · 10월', title: '부스 짝꿍', bg: 'fest', cast: ['A', 'B', 'C'], time: 20, next: 'S5',
  q: '누구와 함께 부스를 지킬까?',
  opts: [
    { label: '{A:과} 함께 부스 지키기', fx: { A: 2, u: 1 }, card: 'straw', after: [
      ['A', 1, '손님들이 궁금해한 걸 다 적어 뒀어. 다음 실험 때 써먹자!'],
      [null, 0, '{A:은} 수첩에 손님들의 질문을 하나하나 받아 적었다.'],
    ] },
    { label: '{B:과} 함께 부스 지키기', fx: { B: 2, u: 1 }, card: 'straw', after: [
      [null, 0, '앗, 거름 장치에서 물이 뚝뚝 샌다!'],
      ['B', 1, '괜찮아, 같이 고치자! 방수 테이프 좀 잡아 줄래?'],
      [null, 0, '둘이 함께 고친 장치는 축제 끝까지 잘 버텼다.'],
    ] },
    { label: '{C:과} 함께 부스 지키기', fx: { C: 2, u: 1 }, card: 'straw', after: [
      ['C', 1, '재료비 계산해 봤어. 하나에 700원이라 부담 없겠어!'],
      [null, 0, '{C:과} 함께 남은 페트병으로 화분 선물도 만들었다.'],
    ] },
    { label: '혼자 거름 실험 더 하기', fx: { u: 2 }, card: 'straw', after: [
      [null, 0, '모래와 숯 순서를 바꿔 가며 혼자 열 번 실험했다.'],
      [null, 0, '숯을 아래에 깔자 물이 훨씬 맑아졌다. 얼른 노트에 적었다.'],
    ] },
  ] };

N.S5 = { type: 'scene', when: '중2 · 3월', title: '미코의 밤 숙제', bg: 'night', cast: ['miko', 'T'], next: 'V5', lines: [
  [null, 0, '중2 3월, 미코에게서 반가운 그림 편지가 왔다.'],
  ['miko', 0, '밤에도 숙제하고 싶은데 해가 지면 너무 깜깜해.'],
  ['T', 0, '밤엔 등유 램프를 켜거든. 매운 연기도 나고 기름값도 비싸.'],
  ['B', 1, '빛이라면 물 넣은 페트병 전구가 있잖아!'],
  ['A', 0, '잠깐만. 미코한테 언제, 어디서 빛이 필요한지부터 물어보자.'],
  ['bong', 0, '그 마을의 밤에 꼭 맞는 빛은 뭘까?'],
] };

N.V5 = { type: 'choice', when: '중2 · 3월', title: '빛, 어떻게?', bg: 'night', cast: ['miko', 'T'], time: 20, next: 'S6',
  q: '빛 문제, 어떻게 풀어 볼까?',
  opts: [
    { label: '바로 페트병 전구 만들어 보내기', fx: { u: 1, w: 1 }, card: 'bottle', rethink: '페트병 전구 바로 보내기 — 낮에만 밝아서 정작 밤 숙제엔 쓸 수 없었다', after: [
      ['miko', 1, '우와, 낮에는 방 안이 진짜 환해!'],
      ['miko', 0, '근데… 해가 지니까 전구도 꺼져서 깜깜해.'],
      ['T', 0, '처음부터 우리랑 같이 이야기하고 정했으면 좋았을 텐데.'],
      [null, 0, '아차, 페트병 전구는 햇빛을 퍼뜨릴 뿐 밤에는 빛이 안 난다.'],
    ] },
    { label: '언제·어디에 필요한지 먼저 묻기', fx: { h: 2, o: 1 }, card: 'bike', after: [
      ['T', 1, '고마워! 밤 공부는 저녁 7시부터 두 시간이야.'],
      ['T', 1, '대장간에 남는 헌 자전거가 있어. 거기에 발전기를 달자!'],
      [null, 0, '페달을 힘껏 돌리자 반짝 LED가 켜졌다. 자전거 발전기다!'],
      ['miko', 1, '신난다! 이제 밤에도 그림 숙제 할 수 있어!'],
    ] },
    { label: '크고 좋은 발전기 후원받기', fx: { w: 1 }, rethink: '크고 좋은 발전기 — 기름값과 수리 부품이 없으면 결국 창고에 갇힌다', after: [
      [null, 0, '크고 번쩍이는 발전기가 배에 실려 도착했다.'],
      ['T', 0, '기름값도 비싸고, 고장 나면 바꿀 부품이 없어.'],
      [null, 0, '고장 난 발전기는 결국 창고에 들어갔다.'],
      ['bara', 1, '사실은… 우리 손으로 고쳐 쓸 수 있는 게 더 좋아요.'],
    ] },
  ] };

N.S6 = { type: 'scene', when: '중2 · 7월', title: '루미타 교류 방문', bg: 'market', cast: ['T', 'hala'], next: 'V6', lines: [
  [null, 0, '중2 7월, 드디어 루미타 마을에 도착했다!'],
  [null, 0, '붉은 흙길과 반짝이는 양철 지붕, 장터의 웃음소리.'],
  ['T', 1, '와, 정말 왔구나! 오늘 오후는 자유 시간이야.'],
  ['hala', 0, '마침 빗물 탱크 청소하는 날인데, 일손이 필요하구나.'],
  ['C', 1, '우린 태양열 조리기로 점심 해 먹을 거야. 같이 할래?'],
] };

N.V6 = { type: 'choice', when: '중2 · 7월', title: '자유 시간', bg: 'market', cast: ['T', 'hala'], time: 20, next: 'S7',
  q: '루미타에서의 첫 오후, 무엇을 할까?',
  opts: [
    { label: '테누와 대장간에서 발전기 만들기', fx: { T: 2, u: 1 }, bg: 'forge', card: 'bike', after: [
      ['T', 1, '자석이랑 구리선 코일은 이렇게 감는 거야. 알려 줄게!'],
      [null, 0, '테누의 손놀림은 빠르고 정확했다.'],
      ['T', 2, '처음인데 진짜 잘하네! 우리 둘이 딱 한 팀이야.'],
    ] },
    { label: '할라 할머니와 빗물 탱크 청소하기', fx: { h: 1, o: 1 }, bg: 'roof', card: 'rain', after: [
      ['hala', 1, '탱크 바닥에 가라앉은 흙을 걷어 내야 물이 맑단다.'],
      [null, 0, '구슬땀을 흘리며 함께 탱크를 박박 닦았다.'],
      ['hala', 1, '고맙구나. 이렇게 돌봐야 오래 쓴단다.'],
    ] },
    { label: '동아리 친구들과 태양열 요리하기', fx: { A: 1, B: 1, C: 1, u: 1 }, card: 'solar', after: [
      [null, 0, '은빛 반사판으로 햇빛을 모으자 냄비가 보글보글 끓었다.'],
      ['B', 1, '우와, 불 없이 햇빛만으로 밥이 되네!'],
      ['C', 1, '땔감도 아끼고 연기도 안 나. 흐린 날엔 어렵지만.'],
      ['A', 1, '다 같이 나눠 먹으니까 더 맛있다.'],
    ] },
  ] };

N.S7 = { type: 'scene', when: '중2 · 10월', title: '모금한 돈', bg: 'club', cast: ['A', 'B', 'C'], next: 'V7', lines: [
  [null, 0, '중2 10월. 바자회로 모은 돈이 제법 생겼다.'],
  ['B', 0, '새 부품을 사서 우리가 직접 멋지게 만들자!'],
  ['C', 0, '마을 장터에서 재료 사자. 고장 나도 바로 고치게.'],
  ['B', 0, '그래도 튼튼한 새 부품이 오래가잖아!'],
  ['A', 0, '둘 다 잠깐만. 먼저 마을에 물어보고 정하면 어때?'],
  [null, 0, '동아리실이 조용해졌다. 셋의 시선이 내게 모인다.'],
] };

N.V7 = { type: 'choice', when: '중2 · 10월', title: '누구 말을 따를까?', bg: 'club', cast: ['A', 'B', 'C'], time: 20, next: 'S7b',
  q: '이번엔 누구 의견을 따를까?',
  opts: [
    { label: '{B} — 부품 사서 우리가 만들자', fx: { B: 2, u: 1 }, after: [
      ['B', 1, '좋았어! 설계도는 내가 그려 올게!'],
      [null, 0, '부품을 맞춰 보며 작동 원리를 제대로 알게 됐다.'],
    ] },
    { label: '{C} — 마을에서 재료 사자', fx: { C: 2, o: 1 }, after: [
      ['C', 1, '장터 재료값을 알아봤어. 무려 반값이야!'],
      [null, 0, '마을에서 구한 재료는 고장 나도 바로 고칠 수 있다.'],
    ] },
    { label: '{A} — 마을에 먼저 묻자', fx: { A: 2, h: 1 }, after: [
      ['A', 1, '여쭤보니까 고치기 쉬운 장터 재료를 원하신대.'],
      [null, 0, '{A:은} 마을에서 들은 답을 수첩에 또박또박 적었다.'],
    ] },
    { label: '일단 떡볶이 먹고 화해부터', fx: { A: 1, B: 1, C: 1 }, after: [
      [null, 0, '매콤한 떡볶이를 나눠 먹으니 웃음이 터졌다.'],
      ['B', 1, '아까는 내가 너무 급했어. 미안!'],
      ['C', 1, '나도 미안해. 우리 다시 같이 정하자.'],
    ] },
  ] };

// S7' 자동 장면(투표 없음): 호감 1위 ≥ 4 → 그 사람과 하굣길 / 아니면 동아리 넷
N.S7b = { type: 'branch', when: '중2 · 겨울', title: '하굣길', pick: run => {
  // 이 시점(중2 겨울)까지 고른 것만 센다 — V8 뒤의 선택은 아직 없다
  const st = statsOf(run, 'V8');
  const top = topSlot(st, { V1: run.ch && run.ch.V1 });
  return st[top] >= 4 ? 'S7' + top : 'S7G';
}, outs: ['S7A', 'S7B', 'S7C', 'S7G'] };

N.S7A = { type: 'scene', when: '중2 · 겨울', title: '눈 오는 하굣길', bg: 'snow', cast: ['A'], next: 'S8', rel: 'A', lines: [
  [null, 0, '중2 겨울. 눈송이가 흩날리는 하굣길, {A:과} 나란히 걷는다.'],
  ['A', 0, '나 사실, 먼저 말하는 게 좀 어려워.'],
  ['A', 2, '그런데 너는 작은 말도 끝까지 들어 줘서 좋아.'],
  [null, 0, '볼이 살짝 따뜻해졌다. 눈 때문은 아니었다.'],
] };
N.S7B = { type: 'scene', when: '중2 · 겨울', title: '고장 난 손전등', bg: 'club', cast: ['B'], next: 'S8', rel: 'B', lines: [
  [null, 0, '중2 겨울. 해 질 녘 동아리실에 {B:과} 단둘이 남았다.'],
  ['B', 0, '어, 이 손전등 또 안 켜지네. 우리 같이 뜯어 볼래?'],
  [null, 0, '나사 하나, 전지 하나. 나란히 앉아 하나씩 살폈다.'],
  ['B', 2, '불 켜졌다! 다음에도 꼭 같이 고치자.'],
] };
N.S7C = { type: 'scene', when: '중2 · 겨울', title: '영수증 계산 대결', bg: 'snow', cast: ['C'], next: 'S8', rel: 'C', lines: [
  [null, 0, '중2 겨울. {C:과} 긴 장보기 영수증을 펼쳤다.'],
  ['C', 1, '어느 쪽이 진짜 싼지 계산 대결해 볼래?'],
  [null, 0, '값싼 걸 자주 사는 것보다 오래 쓰는 게 훨씬 더 쌌다.'],
  ['C', 2, '역시 너랑 하면 계산도 재밌다. 내년에도 같이 하자.'],
] };
N.S7G = { type: 'scene', when: '중2 · 겨울', title: '넷이 걷는 길', bg: 'snow', cast: ['A', 'B', 'C'], next: 'S8', lines: [
  [null, 0, '중2 겨울. 함박눈 내리는 길을 넷이 나란히 걷는다.'],
  ['B', 1, '눈사람한테 자전거 발전기 달아 주면 어떨까?'],
  ['C', 1, '누가 페달을 밟아! 전기 아깝게 왜!'],
  ['A', 1, '내년에도 우리 넷이 꼭 같이 하자.'],
] };

N.S8 = { type: 'scene', when: '중3 · 4월', title: '시드는 채소', bg: 'market', cast: ['kamu', 'T'], next: 'V8', lines: [
  [null, 0, '중3 4월. 루미타 장터에서 소식이 들려왔다.'],
  ['T', 0, '채소가 장터에 가기도 전에 다 시들어. 건기엔 너무 덥거든.'],
  [null, 0, '마을엔 아직 냉장고를 돌릴 전기가 없다.'],
  ['kamu', 1, '내 가마에서는 우리 마을 흙으로 항아리를 굽는단다.'],
  ['bong', 0, '그 덥고 건조한 날씨를, 거꾸로 이용할 수는 없을까?'],
] };

N.V8 = { type: 'choice', when: '중3 · 4월', title: '채소, 어떻게?', bg: 'market', cast: ['kamu', 'T'], time: 20, next: 'S9',
  q: '시드는 채소 문제, 어떻게 할까?',
  opts: [
    { label: '한국에서 냉장고 보내기', fx: { w: 1 }, rethink: '냉장고 보내기 — 마을에는 냉장고를 돌릴 전기가 없었다', after: [
      [null, 0, '우리가 보낸 냉장고가 마을에 도착했다.'],
      ['T', 0, '고맙지만… 이걸 꽂을 전기가 없어.'],
      ['kamu', 1, '사실은 전기 없이도 시원하게 하는 방법이 있단다.'],
    ] },
    { label: '카무 아저씨와 항아리 냉장고 만들기', fx: { h: 1, o: 2, u: 1 }, card: 'pot', after: [
      ['kamu', 1, '큰 항아리와 작은 항아리 사이에 젖은 모래를 채운단다.'],
      [null, 0, '젖은 모래가 마르면서 열을 빼앗아 안이 시원해진다.'],
      ['T', 1, '덥고 건조할수록 더 시원해지네! 우리 마을 날씨에 딱이야.'],
    ] },
    { label: '햇볕에 말리는 건조대 만들기', fx: { o: 1, u: 1 }, after: [
      [null, 0, '망을 씌운 건조대에 채소를 얇게 썰어 볕에 말렸다.'],
      ['C', 1, '바짝 말린 채소는 오래 두고 먹을 수 있어.'],
      ['T', 0, '싱싱한 생채소는 여전히 시들지만, 이것도 좋은 시작이야.'],
    ] },
  ] };

N.S9 = { type: 'scene', when: '중3 · 7월', title: '고장 사건', bg: 'forge', cast: ['T'], next: 'V9', lines: [
  [null, 0, '중3 7월. 루미타에서 다급한 연락이 왔다.'],
  ['T', 0, '{dev:이} 멈췄어. 3년 내내 잘 썼는데.'],
  [null, 0, '화면 너머로 마을 사람들이 걱정스럽게 모였다.'],
  ['B', 0, '닳은 부품만 바꾸면 금방 고치겠는데!'],
  ['bong', 0, '졸업한 뒤에도 마을에서 계속 쓰려면?'],
] };

N.V9 = { type: 'choice', when: '중3 · 7월', title: '고장, 어떻게?', bg: 'forge', cast: ['T'], time: 20, next: 'S10',
  q: '멈춰 버린 장치, 어떻게 할까?',
  opts: [
    { label: '한국에서 새 부품 보내기', fx: { w: 1 }, rethink: '새 부품 보내기 — 다음에 또 고장 나면 또 기다려야 한다', after: [
      [null, 0, '새 부품은 배를 타고 한 달 뒤에야 도착했다.'],
      ['T', 0, '고마워. 하지만 또 고장 나면 한 달을 또 기다려야 해.'],
      ['T', 1, '사실은… 마을 장터에도 쓸 만한 부품이 있었어.'],
    ] },
    { label: '테누와 같이 고치고 설명서 만들기', fx: { T: 2, o: 2, h: 1 }, after: [
      ['T', 1, '장터 부품으로 같이 고쳐 보자! 여기 나사 보여?'],
      [null, 0, '화상으로 함께 고치며 수리 과정을 그림으로 그렸다.'],
      [null, 0, '완성된 그림 설명서가 마을 학교 벽에 붙었다.'],
      ['T', 2, '고마워! 이젠 고장 나도 우리가 고칠 수 있어!'],
    ] },
    { label: '다음 방학에 우리가 가서 고치기', fx: { u: 1 }, after: [
      [null, 0, '방학 때 직접 가서 고쳤다. 덕분에 원리는 확실히 알았다.'],
      ['T', 0, '고마워. 그런데 너희가 졸업하고 없을 땐 어떡하지?'],
    ] },
  ] };

N.S10 = { type: 'scene', when: '중3 · 10월', title: '마지막 발표회 준비', bg: 'club', cast: ['A', 'B', 'C'], next: 'V10', lines: [
  [null, 0, '중3 10월. 우리의 3년을 정리하는 발표회가 코앞이다.'],
  ['A', 0, '그동안 모은 마을 인터뷰를 영상으로 엮고 싶어.'],
  ['B', 1, '직접 움직이는 모형을 만들면 한눈에 딱 보일걸!'],
  ['C', 0, '난 3년 동안 쓴 재료랑 비용을 표로 정리해 볼래.'],
  [null, 0, '옆에서 듣던 1학년 후배 셋이 호기심에 눈을 반짝인다.'],
  ['bong', 0, '자, 누구와 무엇을 준비할지 골라 보렴.'],
] };

N.V10 = { type: 'choice', when: '중3 · 10월', title: '발표회 준비', bg: 'club', cast: ['A', 'B', 'C'], time: 20, next: 'S11',
  q: '마지막 발표회, 누구와 무엇을 준비할까?',
  opts: [
    { label: '{A:과} 마을 인터뷰 영상 만들기', fx: { A: 2, h: 1 }, after: [
      ['A', 1, '할라 할머니가 환하게 웃으시는 장면은 꼭 넣자!'],
      [null, 0, '자막까지 다 넣으니 밤이 깊었다.'],
      ['A', 2, '마지막 영상을 너랑 만들어서 다행이야.'],
    ] },
    { label: '{B:과} 움직이는 모형 만들기', fx: { B: 2, u: 1 }, after: [
      ['B', 1, '자, 페달 돌려 봐! 진짜 불 켜진다!'],
      [null, 0, '바퀴가 돌더니 전구에 반짝 불이 켜졌다.'],
      ['B', 2, '헤헤, 역시 우리 둘이 하면 된다니까.'],
    ] },
    { label: '{C:과} 3년 비용·재료 표 정리', fx: { C: 2, o: 1 }, after: [
      ['C', 1, '봐, 마을 재료로 만든 게 제일 싸고 고쳐 쓰기도 좋았어!'],
      [null, 0, '빼곡한 숫자들에 우리의 3년이 담겼다.'],
      ['C', 2, '복잡한 계산도 너랑 하면 시간 가는 줄 몰라.'],
    ] },
    { label: '후배들과 「동아리 설명서」 쓰기', fx: { book: true, o: 1 }, after: [
      ['kids', 1, '선배, 부품이 헐거워지면 어떻게 고쳐요?'],
      [null, 0, '누구나 쉽게 보고 고치도록 그림 설명서를 만들었다.'],
      [null, 0, '우리가 졸업해도 설명서는 후배들 곁에 남는다.'],
    ] },
  ] };

N.S11 = { type: 'scene', when: '중3 · 2월', title: '졸업식 전날 밤', bg: 'club', tint: 'night', cast: [], next: 'V11', lines: [
  [null, 0, '중3 2월, 드디어 졸업식 전날 밤이다.'],
  [null, 0, '스탠드 불빛 아래 편지지가 딱 한 장 있다.'],
  [null, 0, '3년 동안 함께 웃던 얼굴들이 떠오른다.'],
  [null, 0, '{A}, {B}, {C}, 테누, 그리고 정든 루미타 마을 사람들.'],
  [null, 0, '펜을 꼭 쥐었다. 누구에게 편지를 쓸까?'],
] };

N.V11 = { type: 'choice', when: '중3 · 2월', title: '마지막 편지', bg: 'club', tint: 'night', cast: [], time: 30, next: 'END',
  q: '마지막 편지 한 장, 누구에게 쓸까?',
  opts: [
    { label: '{top}에게 마음 담은 편지', fx: {} },
    { label: '동아리 친구 모두에게 고마움 편지', fx: {} },
    { label: '루미타 마을에 보내는 영상 편지', fx: {} },
    { label: '3년 연구 노트 끝까지 정리하기', fx: {} },
  ] };

N.END = { type: 'branch', when: '졸업식', title: '졸업식', pick: run => endingOf(run), outs: ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10'] };

// ── 엔딩 ─────────────────────────────────────────────────────────
// cg: 슬롯 엔딩은 성별 그림(E1m · E1f), 나머지는 하나
N.E1 = { type: 'ending', no: 1, name: '수첩의 마지막 장', bg: 'field', cg: 'E1', slot: 'A', card: 'rain', cast: ['A'],
  msg: '적정 기술은 먼저 귀 기울여 듣는 데서 시작한다', lines: [
  [null, 0, '졸업식이 끝난 운동장, 바람에 벚꽃이 날린다.'],
  ['A', 0, '{me:아}, 졸업 선물로 이거 줄게.'],
  [null, 0, '손때 묻은 3년짜리 인터뷰 수첩, 마지막 장이 펼쳐져 있다.'],
  ['A', 2, '다음 장에 담을 이야기도 너랑 같이 듣고 싶어.'],
  ['me', 2, '나도.'],
] };
N.E2 = { type: 'ending', no: 2, name: '고쳐 쓰는 약속', bg: 'club', cg: 'E2', slot: 'B', card: 'bike', cast: ['B'],
  msg: '스스로 고쳐 쓸 수 있어야 진짜 오래가는 기술이다', lines: [
  [null, 0, '졸업식 뒤, 햇살 비치는 빈 동아리실.'],
  ['B', 1, '짠! 중1 때 우리가 고장 냈던 그 손전등, 기억나?'],
  [null, 0, '딸깍, 3년 만에 노란 불이 반짝 켜졌다.'],
  ['B', 2, '고장 나면 또 같이 고치자. 앞으로도 같이 있고 싶어.'],
  ['me', 2, '나도.'],
] };
N.E3 = { type: 'ending', no: 3, name: '씨앗 한 봉지', bg: 'garden', cg: 'E3', slot: 'C', card: 'pot', cast: ['C'],
  msg: '작게, 싸게, 오래 — 그래야 마을이 계속 쓸 수 있다', lines: [
  [null, 0, '졸업식 뒤, 흙냄새 나는 학교 텃밭.'],
  ['C', 1, '루미타에서 받은 씨앗을 텃밭에서 키워 또 받았어.'],
  [null, 0, '{C:이} 바스락거리는 작은 씨앗 봉투를 내민다.'],
  ['C', 2, '내년 봄에도 같이 심자. 앞으로도 같이 있고 싶어.'],
  ['me', 2, '나도.'],
] };
N.E4 = { type: 'ending', no: 4, name: '모두가 찍힌 졸업 사진', bg: 'field', cg: 'E4', card: 'solar', cast: ['A', 'B', 'C'],
  msg: '좋은 기술은 혼자가 아니라 마음을 모아 함께 만든다', lines: [
  [null, 0, '졸업식이 끝나고 우리 동아리 넷과 봉 선생님이 모였다.'],
  ['bong', 1, '자, 다 같이 사진 찍자! 루미타도 연결됐니?'],
  [null, 0, '휴대 전화 화면 너머로 테누와 미코가 활짝 손을 흔든다.'],
  ['B', 1, '화면 쪽으로 모여 봐! 하나, 둘, 셋!'],
  [null, 0, '「김치!」 두 나라의 환한 웃음이 한 장에 찍혔다.'],
] };
N.E5 = { type: 'ending', no: 5, name: '루미타의 불빛', sub: '프로젝트 대성공', bg: 'hall', cg: 'E5', card: 'bike', cast: [],
  msg: '적정 기술의 완성은 마을이 스스로 이어 가는 것, 지속가능 발전', lines: [
  [null, 0, '북적이는 졸업식 강당, 루미타에서 보낸 축하 영상이 켜진다.'],
  [null, 0, '자전거 발전기 불빛 아래서 미코가 웃으며 숙제한다.'],
  ['hala', 1, '빗물 탱크는 우리가 날마다 잘 돌보고 있단다.', run => run.ch.V3 === 3 || run.ch.V6 === 2],
  ['T', 1, '굴리는 물통 손잡이는 이제 우리 대장간에서 만들어.', run => !(run.ch.V3 === 3 || run.ch.V6 === 2)],
  ['kamu', 1, '두 겹 항아리는 이제 옆 마을에서도 주문한단다.', run => run.ch.V8 === 2],
  ['C', 1, '햇볕에 말린 채소는 이제 장터 인기 상품이래!', run => run.ch.V8 !== 2],
  ['T', 1, '이제 우리가 옆 마을에 만드는 법을 알려 줄 거야!'],
  [null, 0, '영상이 끝나자 강당 가득 박수가 터졌다.'],
] };
N.E6 = { type: 'ending', no: 6, name: '멈춘 발전기가 가르쳐 준 것', sub: '실패에서 배움', bg: 'hall', cg: 'E6', card: 'bottle', cast: [],
  msg: '비싸고 새로운 것이 늘 답은 아니다. 실패를 돌아보고 고치는 것도 기술이다', lines: [
  [null, 0, '졸업 발표회 무대, 큰 화면에 사진 한 장을 띄웠다.'],
  [null, 0, '기름값도 부품도 없어 창고에 선 비싼 발전기.', run => run.ch.V5 === 3],
  [null, 0, '전기가 없어 불 꺼진 채 멈춰 선 냉장고.', run => run.ch.V5 !== 3 && run.ch.V8 === 1],
  [null, 0, '기름값이 비싸 길가에 멈춘 물 배달 트럭.', run => run.ch.V5 !== 3 && run.ch.V8 !== 1 && run.ch.V3 === 2],
  [null, 0, '배로 오느라 한 달 걸린 새 부품 상자.', run => run.ch.V5 !== 3 && run.ch.V8 !== 1 && run.ch.V3 !== 2],
  ['me', 0, '먼저 물어보지 않고 우리끼리 정했습니다. 그래서 멈췄습니다.'],
  [null, 0, '발표 뒤, 루미타에서 영상 답장이 왔다.'],
  ['bara', 1, '괜찮아요, 다음엔 처음부터 같이 정해요. 기다릴게요!'],
  [null, 0, '조용하던 강당에 따뜻한 박수가 번졌다.'],
] };
N.E7 = { type: 'ending', no: 7, name: '나만의 연구 노트', sub: '혼자 연구', bg: 'club', cg: 'E7', card: 'straw', cast: [],
  msg: '깊이 아는 힘은 소중하다. 그 앎을 사람들과 나눌 때 진짜 기술이 된다', lines: [
  [null, 0, '졸업식 뒤, 혼자 빈 과학실에 남았다.'],
  [null, 0, '3년 동안 홀로 적어 온 연구 노트를 마지막 장까지 채웠다.'],
  [null, 0, '모래 거름 실험, 발전기 원리, 항아리 온도 기록까지.'],
  [null, 0, '창밖 운동장에서 친구들이 손을 흔든다. 「빨리 나와!」'],
  [null, 0, '마지막 줄에 적었다. 「다음엔 누구에게 먼저 물어볼까?」'],
] };
N.E8 = { type: 'ending', no: 8, name: '테누와의 약속', sub: '마을 친구', bg: 'call', cg: 'E8', card: 'roll', cast: ['T'],
  msg: '주는 사람과 받는 사람이 아니라 함께 고민하고 배우는 동료', lines: [
  [null, 0, '같은 날, 루미타의 테누도 마을 학교를 졸업한다.'],
  [null, 0, '화면 너머로 두 학교의 졸업식이 이어졌다.'],
  ['T', 1, '{me:아}! 축하해, 우리 둘 다 나란히 졸업이다!'],
  ['T', 2, '어른이 되면 각자 마을에서 필요한 걸 고치는 사람이 되자.'],
  ['me', 2, '약속! 고치기 힘들 땐 서로 전화하기!'],
  ['miko', 1, '나도 끼워 줘! 그림 잘 그린단 말이야!'],
] };
N.E9 = { type: 'ending', no: 9, name: '후배에게 넘긴 설명서', sub: '바통', bg: 'club', cg: 'E9', card: 'pot', cast: [],
  msg: '사람이 바뀌어도 누구나 보고 이어 갈 수 있어야 지속 가능하다', lines: [
  [null, 0, '졸업식 뒤, 동아리실에 후배들이 모였다.'],
  [null, 0, '직접 만든 그림 설명서를 후배들에게 건넨다.'],
  ['kids', 1, '한눈에 보여요! 선배, 잘 이어 갈게요!'],
  [null, 0, '띠링, 휴대 전화에 사진이 한 장 도착했다.'],
  ['T', 1, '봐 봐, 우리 학교에서도 이 설명서로 공부해!'],
] };
N.E10 = { type: 'ending', no: 10, name: '아직 끝나지 않은 이야기', sub: '보통', bg: 'field', cg: 'E10', card: 'roll', cast: ['A', 'B', 'C'],
  msg: '오늘 고른 길을 돌아보면 다음에 만날 이야기가 달라진다', lines: [
  [null, 0, '서툴렀지만 그래서 더 반짝이는 졸업식.'],
  [null, 0, '건네지 못한 편지는 주머니에 넣었다. 다음엔 꼭 전해야지.', run => run.ch.V11 === 1 || run.ch.V11 === 2],
  [null, 0, '루미타에 보낼 영상 편지는 더 다듬기로 했다.', run => run.ch.V11 === 3],
  [null, 0, '연구 노트 마지막 장엔 아직 빈칸이 남았다.', run => run.ch.V11 === 4],
  ['B', 1, '흩어지기 전에 다 같이 사진 찍자!'],
  ['C', 1, '고등학교 가서도 우리 이런 거 또 하자.'],
  ['A', 1, '좋아. 이번엔 처음부터 같이 하자.'],
] };

// E10 의 「다른 엔딩으로 가는 힌트 한 줄」 (V11 에서 고른 편지에 따라)
export const E10_HINT = {
  1: '마음 편지는 한 친구와 3년 동안 자주 함께해야 도착해요(옆자리 · 부스 · 발표 준비).',
  2: '동아리 친구 셋과 골고루 시간을 보내면 다 같이 찍은 사진이 나와요.',
  3: '마을에 먼저 묻고 마을 재료를 고르면 루미타의 불빛이 켜져요. 테누와 친해져도 좋아요.',
  4: '혼자 실험하거나 후배와 설명서를 만들면 또 다른 졸업식이 열려요.',
};

export const NODES = N;
export const START = 'P';
export const CHOICE_IDS = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11'];
export const ENDING_IDS = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10'];

// ── 기술 카드 (게임 안에서는 상표 이름을 쓰지 않는다) ──────────────
export const CARDS = {
  roll:   { name: '굴리는 물통', icon: '🛞', text: '도넛 모양 통에 물을 담아 줄로 굴려 나른다. 머리에 이지 않아 훨씬 가볍다.' },
  straw:  { name: '정수 빨대', icon: '🥤', text: '빨대 속 거름 장치가 세균과 기생충을 걸러 낸다. 바닷물이나 화학 물질은 못 거른다.' },
  rain:   { name: '빗물 모으기', icon: '🌧️', text: '지붕에서 홈통을 거쳐 뚜껑 있는 탱크에 모은다. 먼지 많은 첫 빗물은 흘려보낸다.' },
  bottle: { name: '페트병 전구', icon: '🍶', text: '물을 넣은 페트병을 지붕에 끼우면 햇빛이 방 안으로 퍼진다. 낮에만 밝다.' },
  bike:   { name: '자전거 발전기', icon: '🚲', text: '페달을 돌리면 발전기가 전기를 만들어 LED를 켜고 휴대 전화를 충전한다.' },
  solar:  { name: '태양열 조리기', icon: '☀️', text: '반사판으로 햇빛을 모아 요리한다. 땔감과 연기가 줄지만 흐린 날엔 쓰기 어렵다.' },
  pot:    { name: '항아리 냉장고', icon: '🏺', text: '크고 작은 두 항아리 사이에 젖은 모래를 채운다. 물이 마르며 열을 빼앗아 시원하다.' },
};

// 「루미타의 불빛」
export const LIGHTS = {
  3: '마을이 스스로 불을 켜고, 고치고, 이어 간다',
  2: '불은 켜졌다. 몇 개는 아직 우리 손이 필요하다',
  1: '다음엔 처음부터 같이 정하자',
};

// ── 판정 ─────────────────────────────────────────────────────────
/** 고른 것(ch = {V1: 1..}) → 상태 값. 선택 번호는 1부터 */
export function statsOf(run, upto = null) {
  let st = zeroStats();
  for (const id of CHOICE_IDS) {
    if (upto && id === upto) break;
    const c = run.ch && run.ch[id];
    if (!c) continue;
    const opt = N[id].opts[c - 1];
    if (opt) st = applyFx(st, opt.fx);
  }
  return st;
}

/** 호감 1위 슬롯. 동률이면 V1에서 고른 사람 → V10에서 고른 사람 → A · B · C 순 */
export function topSlot(st, ch = {}) {
  const max = Math.max(st.A, st.B, st.C);
  const cands = ['A', 'B', 'C'].filter(k => st[k] === max);
  if (cands.length === 1) return cands[0];
  const v1 = ['A', 'B', 'C'][(ch.V1 || 0) - 1];
  if (v1 && cands.includes(v1)) return v1;
  const v10 = ['A', 'B', 'C'][(ch.V10 || 0) - 1];
  if (v10 && cands.includes(v10)) return v10;
  return cands[0];
}

export function lightsOf(st) {
  if (st.h >= 6 && st.o >= 6 && st.w === 0) return 3;
  if (st.w <= 1 && st.h + st.o + st.u >= 10) return 2;
  return 1;
}

/** 엔딩 판정 (V11 선택 → 기획서 7절 순서대로 처음 맞는 것) */
export function endingOf(run) {
  const st = statsOf(run);
  const v = run.ch && run.ch.V11;
  if (v === 1) {
    const x = topSlot(st, run.ch);
    return st[x] >= 6 ? { A: 'E1', B: 'E2', C: 'E3' }[x] : 'E10';
  }
  if (v === 2) return (st.A >= 3 && st.B >= 3 && st.C >= 3 && st.A + st.B + st.C >= 10) ? 'E4' : 'E10';
  if (v === 3) {
    if (st.h >= 6 && st.o >= 6 && st.w === 0) return 'E5';
    if (st.T >= 4) return 'E8';
    if (st.w >= 2) return 'E6';
    return 'E10';
  }
  if (v === 4) {
    if (st.book && st.o >= 5) return 'E9';
    if (st.w >= 2) return 'E6';
    if (st.u >= 5) return 'E7';
    return 'E10';
  }
  return 'E10';
}

/** 3년 동안 쓴 장치 (S9 고장 사건) */
export function deviceOf(run) {
  const ch = run.ch || {};
  if (ch.V5 === 2) return '자전거 발전기';
  if (ch.V3 === 3) return '빗물 탱크 꼭지';
  if (ch.V3 === 1) return '굴리는 물통 손잡이';
  return '마을 우물 도르래';
}

/** 다시 생각할 점 (⚠ 고른 것들) */
export function rethinkOf(run) {
  const out = [];
  for (const id of CHOICE_IDS) {
    const c = run.ch && run.ch[id];
    const opt = c && N[id].opts[c - 1];
    if (opt && opt.rethink) out.push(opt.rethink);
  }
  return out;
}

// ── 글 만들기 ────────────────────────────────────────────────────
function slotName(run, k) { return CHARS[SLOT_CHARS[run && run.g === 'f' ? 'f' : 'm'][k]].name; }

export function say(text, run) {
  return String(text).replace(/\{([a-zA-Z]+)(?::([^}]+))?\}/g, (m, key, j) => {
    let w;
    if (key === 'me') w = roleName('me', run);
    else if (key === 'A' || key === 'B' || key === 'C') w = slotName(run, key);
    else if (key === 'top') w = slotName(run, topSlot(statsOf(run), run.ch || {}));
    else if (key === 'dev') w = deviceOf(run);
    else return m;
    return j ? josa(w, j) : w;
  });
}

/** 장면의 보이는 대사(조건 거름 · 자리표 채움) → [{role, face, text, char, name}] */
export function linesOf(lines, run) {
  return (lines || []).filter(l => !l[3] || l[3](run)).map(([role, face, text]) => ({
    role, face, text: say(text, run), char: roleChar(role, run), name: role ? roleName(role, run) : '',
  }));
}

export function optionLabels(node, run) { return node.opts.map(o => say(o.label, run)); }

/** 마디 다음 id */
export function nextOf(id, run) {
  const n = N[id];
  if (!n) return null;
  if (n.type === 'branch') return n.pick(run);
  if (n.type === 'ending') return null;
  return n.next;
}

/** 선택지를 고른 뒤 효과 차이(보이는 지표 · 호감 ♪) */
export function fxOf(id, c) {
  const opt = N[id] && N[id].opts && N[id].opts[c - 1];
  return (opt && opt.fx) || {};
}

/** 학년 (진행 막대용): 고른 갈림길 수 → 중1 · 중2 · 중3 · 졸업 */
export function gradeOfStep(st, ended) {
  if (ended) return 4;
  if (st <= 4) return 1;      // V1~V4 를 고르는 동안 중1
  if (st <= 7) return 2;      // V5~V7
  return 3;
}

/** 장면 순서대로 걸어가기 (시험 · 시간 계산용): run.ch 를 따라 방문하는 마디 id 목록 */
export function walk(run) {
  const out = [];
  let id = START, guard = 0;
  while (id && guard++ < 100) {
    out.push(id);
    const n = N[id];
    if (n.type === 'ending') break;
    id = nextOf(id, run);
  }
  return out;
}

/** 성별이 드러나지 않는 선택지 글(반 통계용): {A} → 듣는 친구 · {B} → 만드는 친구 · {C} → 아끼는 친구 · {top} → 가장 친한 친구 */
const NEUTRAL = { A: '듣는 친구', B: '만드는 친구', C: '아끼는 친구', top: '가장 친한 친구' };
export function neutralLabel(text) {
  return String(text).replace(/\{([a-zA-Z]+)(?::([^}]+))?\}/g, (m, key, j) => {
    const w = NEUTRAL[key];
    if (!w) return m;
    return j ? josa(w, j) : w;
  });
}
