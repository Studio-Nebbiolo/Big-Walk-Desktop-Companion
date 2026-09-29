// 게임 속 페인트 보드의 7열 x 3행 색상 (하단 금색/흰색/갈색 3색은 제외).
// 스크린샷에서 추출한 뒤 조명으로 어두워진 부분을 보정한 값이다.
(function (root) {
  const PALETTE = [
    // 1행
    { id: 'sky', name: '하늘 파랑', hex: '#3F6EA8' },
    { id: 'rust', name: '벽돌 빨강', hex: '#C2391A' },
    { id: 'mustard', name: '머스터드', hex: '#DDB743' },
    { id: 'teal', name: '청록', hex: '#4FA29B' },
    { id: 'royal', name: '로열 블루', hex: '#2F55A0' },
    { id: 'red', name: '빨강', hex: '#F2423A' },
    { id: 'amber', name: '호박색', hex: '#EBAA38' },
    // 2행
    { id: 'forest', name: '숲 초록', hex: '#2A5A2E' },
    { id: 'plum', name: '자두', hex: '#5C1E3F' },
    { id: 'charcoal', name: '숯 회색', hex: '#3A3935' },
    { id: 'orange', name: '주황', hex: '#D9560F' },
    { id: 'pink', name: '살구 분홍', hex: '#EAB3A1' },
    { id: 'lime', name: '연두', hex: '#C7D383' },
    { id: 'gray', name: '회색', hex: '#8E8A78' },
    // 3행
    { id: 'berry', name: '베리', hex: '#8C1D45' },
    { id: 'green', name: '초록', hex: '#17814A' },
    { id: 'brown', name: '갈색', hex: '#6B3B1F' },
    { id: 'crimson', name: '진홍', hex: '#8E1522' },
    { id: 'cream', name: '크림', hex: '#D9D2B6' },
    { id: 'emerald', name: '에메랄드', hex: '#12A07B' },
    { id: 'tan', name: '황갈색', hex: '#A98D5B' },
  ];

  const BY_ID = Object.fromEntries(PALETTE.map((c) => [c.id, c]));

  const PARTS = [
    { id: 'head', name: '머리' },
    { id: 'torso', name: '목 · 팔' },
    { id: 'body', name: '몸통' },
    { id: 'legs', name: '다리' },
  ];

  function colorHex(id) {
    return (BY_ID[id] || PALETTE[0]).hex;
  }

  function randomColors() {
    const pick = () => PALETTE[Math.floor(Math.random() * PALETTE.length)].id;
    const colors = {};
    for (const p of PARTS) colors[p.id] = pick();
    // 인접한 부위가 같은 색이면 구분이 안 되니 다시 뽑는다.
    while (colors.torso === colors.head) colors.torso = pick();
    while (colors.body === colors.torso) colors.body = pick();
    return colors;
  }

  const api = { PALETTE, PARTS, BY_ID, colorHex, randomColors };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Palette = api;
})(typeof window !== 'undefined' ? window : globalThis);
