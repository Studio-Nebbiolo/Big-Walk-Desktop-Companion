// 친구 공유 코드: 이름 + 세 부위 색을 짧은 글자 코드로 바꾸고 되돌린다.
//
// 형식: "BW1-" + base64url( [색 머리, 색 몸통, 색 다리, 이름 UTF-8 바이트..., 검사값] )
//   - 예전 이름 시절의 "MS1-" 코드도 내용이 같으므로 그대로 읽는다.
//   - 색은 팔레트 순번(0~20). 순번이 코드에 박히므로 palette.js 의 색 순서는 바꾸면 안 된다.
//   - 검사값은 앞 바이트들로 계산한 1바이트. 오타가 난 코드는 거절한다.
(function (root) {
  const Palette = root.Palette || (typeof require === 'function' ? require('./palette') : null);
  const PREFIX = 'BW1-';
  const LEGACY_PREFIXES = ['MS1-'];
  const MAX_NAME = 20;

  function checksum(bytes) {
    let c = 0x5a;
    for (const b of bytes) c = (c * 31 + b + 7) & 0xff;
    return c;
  }

  function toBase64Url(bytes) {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(text) {
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  }

  function encode(cfg) {
    const idx = Palette.PARTS.map((p) => Palette.PALETTE.findIndex((c) => c.id === cfg.colors[p.id]));
    if (idx.some((i) => i < 0)) throw new Error('A color is not in the palette');
    const name = Array.from(String(cfg.name || '').trim()).slice(0, MAX_NAME).join('');
    const body = [...idx, ...new TextEncoder().encode(name)];
    return PREFIX + toBase64Url(Uint8Array.from([...body, checksum(body)]));
  }

  // 성공하면 { name, colors }, 실패하면 { error } 를 돌려준다.
  function decode(text) {
    const raw = String(text || '').replace(/\s+/g, '');
    if (!raw) return { error: 'Please enter a code.' };
    const head = [PREFIX, ...LEGACY_PREFIXES].find((p) => raw.slice(0, p.length).toUpperCase() === p);
    if (!head) return { error: `That isn\'t a friend code. It should start with "${PREFIX}".` };
    const payload = raw.slice(head.length);
    if (!payload) return { error: 'The code is too short. Make sure you copied all of it.' };
    if (!/^[A-Za-z0-9_-]+$/.test(payload)) return { error: 'The code contains characters that aren\'t allowed.' };
    let bytes;
    try {
      bytes = fromBase64Url(payload);
    } catch {
      return { error: 'The code is damaged. Please copy it again.' };
    }
    const n = Palette.PARTS.length;
    if (bytes.length < n + 1) return { error: 'The code is too short. Make sure you copied all of it.' };
    const body = bytes.slice(0, -1);
    if (checksum(body) !== bytes[bytes.length - 1]) return { error: 'The code doesn\'t check out. Please look for typos.' };
    const colors = {};
    for (let i = 0; i < n; i++) {
      const c = Palette.PALETTE[body[i]];
      if (!c) return { error: 'The code contains an unknown color.' };
      colors[Palette.PARTS[i].id] = c.id;
    }
    let name;
    try {
      name = new TextDecoder('utf-8', { fatal: true }).decode(body.slice(n));
    } catch {
      return { error: 'The name part is damaged.' };
    }
    name = Array.from(name.trim()).slice(0, MAX_NAME).join('') || 'New friend';
    return { name, colors };
  }

  const api = { encode, decode, PREFIX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShareCode = api;
})(typeof window !== 'undefined' ? window : globalThis);
