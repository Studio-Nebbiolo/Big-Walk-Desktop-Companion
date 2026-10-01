// 게임 속 페인트 보드의 7열 x 3행 색상 (하단 금색/흰색/갈색 3색은 제외).
// 스크린샷에서 추출한 뒤 조명으로 어두워진 부분을 보정한 값이다.
(function (root) {
  const PALETTE = [
    // 1행
    { id: 'sky', name: 'Sky Blue', hex: '#3F6EA8' },
    { id: 'rust', name: 'Brick Red', hex: '#C2391A' },
    { id: 'mustard', name: 'Mustard', hex: '#DDB743' },
    { id: 'teal', name: 'Teal', hex: '#4FA29B' },
    { id: 'royal', name: 'Royal Blue', hex: '#2F55A0' },
    { id: 'red', name: 'Red', hex: '#F2423A' },
    { id: 'amber', name: 'Amber', hex: '#EBAA38' },
    // 2행
    { id: 'forest', name: 'Forest Green', hex: '#2A5A2E' },
    { id: 'plum', name: 'Plum', hex: '#5C1E3F' },
    { id: 'charcoal', name: 'Charcoal', hex: '#3A3935' },
    { id: 'orange', name: 'Orange', hex: '#D9560F' },
    { id: 'pink', name: 'Apricot Pink', hex: '#EAB3A1' },
    { id: 'lime', name: 'Lime', hex: '#C7D383' },
    { id: 'gray', name: 'Gray', hex: '#8E8A78' },
    // 3행
    { id: 'berry', name: 'Berry', hex: '#8C1D45' },
    { id: 'green', name: 'Green', hex: '#17814A' },
    { id: 'brown', name: 'Brown', hex: '#6B3B1F' },
    { id: 'crimson', name: 'Crimson', hex: '#8E1522' },
    { id: 'cream', name: 'Cream', hex: '#D9D2B6' },
    { id: 'emerald', name: 'Emerald', hex: '#12A07B' },
    { id: 'tan', name: 'Tan', hex: '#A98D5B' },
  ];

  const BY_ID = Object.fromEntries(PALETTE.map((c) => [c.id, c]));

  // 몸통 = 목 공 + 팔 + 손, 다리 = 아래 큰 공 + 다리 + 발
  const PARTS = [
    { id: 'head', name: 'Head' },
    { id: 'body', name: 'Body' },
    { id: 'legs', name: 'Legs' },
  ];

  function colorHex(id) {
    return (BY_ID[id] || PALETTE[0]).hex;
  }

  function randomColors() {
    const pick = () => PALETTE[Math.floor(Math.random() * PALETTE.length)].id;
    const colors = {};
    for (const p of PARTS) colors[p.id] = pick();
    // 인접한 부위가 같은 색이면 구분이 안 되니 다시 뽑는다.
    while (colors.body === colors.head) colors.body = pick();
    while (colors.legs === colors.body) colors.legs = pick();
    return colors;
  }

  const api = { PALETTE, PARTS, BY_ID, colorHex, randomColors };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Palette = api;
})(typeof window !== 'undefined' ? window : globalThis);
