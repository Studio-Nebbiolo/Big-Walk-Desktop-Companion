// 바닥에 생겨나고 친구들이 들고 다니는 소품들.
// 모양은 참고 스크린샷(노란 무전기, 흰 확성기, 파란 라디오 상자)을 따라 그렸다.
(function (root) {
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function tone(hex, amt) {
    let [r, g, b] = hexToRgb(hex);
    if (amt >= 0) {
      r += (255 - r) * amt;
      g += (255 - g) * amt;
      b += (255 - b) * amt;
    } else {
      r *= 1 + amt;
      g *= 1 + amt;
      b *= 1 + amt;
    }
    const h = (v) => Math.round(v).toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
  }

  // 위에서 빛이 오는 무광 재질: 위쪽이 살짝 밝고 아래로 갈수록 어두워진다.
  function matteFill(ctx, hex, y0, y1) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, tone(hex, 0.12));
    g.addColorStop(0.55, hex);
    g.addColorStop(1, tone(hex, -0.2));
    return g;
  }

  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  const TYPES = {
    // 노란 무전기: 주황 패널, 둥근 스피커, 검은 안테나
    walkie: {
      grip: { x: 0, y: 4 },
      rest: { x: 0, y: 11, angle: 0 },
      draw(ctx) {
        ctx.fillStyle = '#2b2b2b';
        rrect(ctx, -5.5, -21, 3.2, 12, 1.5);
        ctx.fill();
        ctx.fillStyle = matteFill(ctx, '#E1622B', -15, -10);
        rrect(ctx, 1.5, -14.5, 4, 4, 1);
        ctx.fill();
        ctx.fillStyle = matteFill(ctx, '#EBB43A', -11, 11);
        rrect(ctx, -7, -11, 14, 22, 3.2);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.12)';
        rrect(ctx, 4.5, -10, 2.5, 20, 1.5);
        ctx.fill();
        ctx.fillStyle = matteFill(ctx, '#E8672B', -8, 0);
        rrect(ctx, -4.6, -8, 9.2, 7.2, 1.6);
        ctx.fill();
        ctx.fillStyle = '#5b5345';
        ctx.beginPath();
        ctx.arc(0, 5.2, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8d8270';
        ctx.lineWidth = 0.7;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(-2.2, 5.2 + i * 1.3);
          ctx.lineTo(2.2, 5.2 + i * 1.3);
          ctx.stroke();
        }
      },
    },
    // 확성기: 회색 손잡이, 흰 나팔, 빨간 띠, 검은 입구
    megaphone: {
      grip: { x: -3.5, y: 9 },
      rest: { x: 0, y: 13, angle: 0 },
      draw(ctx) {
        ctx.fillStyle = matteFill(ctx, '#6d6b66', 2, 14);
        rrect(ctx, -6, 2, 5.5, 12, 2);
        ctx.fill();
        ctx.fillStyle = '#2d2c2a';
        ctx.beginPath();
        ctx.ellipse(-13.5, -2, 3, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = matteFill(ctx, '#EEE8D6', -14, 10);
        ctx.beginPath();
        ctx.moveTo(-13, -6.5);
        ctx.lineTo(15, -14);
        ctx.lineTo(15, 10);
        ctx.lineTo(-13, 2.5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#D8473A';
        ctx.beginPath();
        ctx.moveTo(-7, -8);
        ctx.lineTo(-3, -9);
        ctx.lineTo(-3, 5);
        ctx.lineTo(-7, 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = matteFill(ctx, '#d9d2bd', -14, 10);
        ctx.beginPath();
        ctx.ellipse(15.5, -2, 3.6, 12.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3b3a37';
        ctx.beginPath();
        ctx.ellipse(16.3, -2, 2.2, 9.8, 0, 0, Math.PI * 2);
        ctx.fill();
      },
    },
    // 파란 라디오 상자: 스피커 줄무늬, 다이얼, 안테나
    radio: {
      grip: { x: 0, y: 0 },
      rest: { x: 0, y: 10, angle: 0 },
      draw(ctx) {
        ctx.strokeStyle = '#8a8d90';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(10, -9);
        ctx.lineTo(13.5, -27);
        ctx.stroke();
        ctx.fillStyle = '#3a3a3a';
        ctx.beginPath();
        ctx.arc(13.5, -27.5, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = matteFill(ctx, '#4E7F98', -10, 10);
        rrect(ctx, -15, -10, 30, 20, 3.5);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.15)';
        rrect(ctx, -15, 6.5, 30, 3.5, 2);
        ctx.fill();
        ctx.strokeStyle = '#2f5467';
        ctx.lineWidth = 1.1;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(-11.5, -5.5 + i * 2.6);
          ctx.lineTo(0.5, -5.5 + i * 2.6);
          ctx.stroke();
        }
        ctx.fillStyle = '#2c2c2c';
        ctx.beginPath();
        ctx.arc(7.5, -1, 4.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#E1622B';
        ctx.beginPath();
        ctx.arc(7.5, -1, 1.6, 0, Math.PI * 2);
        ctx.fill();
      },
    },
  };

  const TYPE_IDS = Object.keys(TYPES);
  const SIZE = 1.5; // 캐릭터 머리만 한 크기

  // 손에 들린 상태: (x, y) 에 손잡이가 오도록 그린다.
  function drawHeld(ctx, type, x, y, angle) {
    const t = TYPES[type];
    if (!t) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(SIZE, SIZE);
    ctx.translate(-t.grip.x, -t.grip.y);
    t.draw(ctx);
    ctx.restore();
  }

  // 바닥에 놓인 상태
  function drawResting(ctx, item, groundY, scale) {
    const t = TYPES[item.type];
    if (!t) return;
    ctx.save();
    ctx.globalAlpha = item.alpha ?? 1;
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath();
    ctx.ellipse(item.x, groundY - 1, 13 * SIZE * scale * (1 - Math.min(0.6, item.h / 400)), 3 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(item.x, groundY - item.h);
    ctx.scale(scale * SIZE * (item.dir || 1), scale * SIZE);
    ctx.rotate(t.rest.angle + (item.spin || 0));
    ctx.translate(-t.rest.x, -t.rest.y);
    t.draw(ctx);
    ctx.restore();
  }

  root.Items = { TYPES, TYPE_IDS, drawHeld, drawResting, tone };
})(window);
