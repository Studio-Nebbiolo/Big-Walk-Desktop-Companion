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
    // 노란 무전기 (녹화 영상 기준): 겨자색 몸체, 빨간 캡의 검은 안테나(왼쪽 위),
    // 주황 톱니 다이얼(오른쪽 위), 회색 스피커, 빨강·주황·초록·파랑 버튼,
    // 왼쪽 아래 모서리가 둥글게 파인 검은 타공 그릴, 옆면 주황 버튼.
    walkie: {
      grip: { x: 0, y: 4 },
      rest: { x: 0, y: 12, angle: 0 },
      draw(ctx, t = 0) {
        // 안테나
        ctx.fillStyle = matteFill(ctx, '#3c3d42', -24, -11);
        rrect(ctx, -6.2, -23, 3.6, 13, 1.4);
        ctx.fill();
        ctx.fillStyle = '#2a2b2f';
        rrect(ctx, -7, -11.6, 5.2, 1.6, 0.6);
        ctx.fill();
        ctx.fillStyle = matteFill(ctx, '#D2381F', -25, -21);
        rrect(ctx, -6.4, -25, 4, 3.4, 1.2);
        ctx.fill();
        // 주황 톱니 다이얼
        ctx.fillStyle = matteFill(ctx, '#EE8420', -14.5, -10.5);
        rrect(ctx, 2.6, -14.5, 5, 4.5, 0.8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,50,0,.45)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(3.6 + i * 1.1, -14.3);
          ctx.lineTo(3.6 + i * 1.1, -10.3);
          ctx.stroke();
        }
        // 옆면 주황 버튼
        ctx.fillStyle = '#D9701C';
        rrect(ctx, -9, -5, 2.4, 6, 1);
        ctx.fill();
        // 몸체 (오른쪽 옆면을 어둡게 해서 두께감)
        ctx.fillStyle = '#A8860F';
        rrect(ctx, -8.4, -10.5, 17.6, 22.5, 3.6);
        ctx.fill();
        ctx.fillStyle = matteFill(ctx, '#E2BD22', -10.5, 12);
        rrect(ctx, -8.4, -10.5, 16, 22.5, 3.6);
        ctx.fill();
        // 버튼이 박힌 살짝 도드라진 패널
        ctx.fillStyle = '#EBCB45';
        rrect(ctx, 0.6, -9, 6.4, 4, 1.2);
        ctx.fill();
        rrect(ctx, 0.9, -4.6, 5.8, 3, 1.2);
        ctx.fill();
        // 스피커 패널 + 스피커
        ctx.fillStyle = '#E3C654';
        rrect(ctx, -7.2, -9, 7.4, 7.2, 1.4);
        ctx.fill();
        ctx.fillStyle = '#6E6F72';
        ctx.beginPath();
        ctx.arc(-3.5, -5.4, 2.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(40,40,44,.55)';
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          ctx.beginPath();
          ctx.arc(-3.5 + i * 1.2, -5.4 + j * 1.2, 0.35, 0, Math.PI * 2);
          ctx.fill();
        }
        // 버튼들
        const dot = (x, y, r, c) => {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        };
        dot(2, -7.2, 0.8, '#D9412A');
        dot(4.6, -6.6, 1.5, '#EE7A1E');
        const blink = Math.sin(t * 6) > 0.3;
        dot(2.3, -3.2, 0.95, blink ? '#8CF7C8' : '#2FA863');
        dot(4.8, -3.2, 0.95, '#4A7BC8');
        // 검은 타공 그릴 (왼쪽 아래가 둥글게 파였다)
        ctx.fillStyle = '#34383C';
        ctx.beginPath();
        ctx.moveTo(-6.8, -0.8);
        ctx.lineTo(5.8, -0.8);
        ctx.lineTo(5.8, 9.2);
        ctx.quadraticCurveTo(5.8, 10.6, 4.4, 10.6);
        ctx.lineTo(0.6, 10.6);
        ctx.quadraticCurveTo(-1.8, 4.2, -6.8, 3.6);
        ctx.closePath();
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = '#1f2226';
        for (let y = 0.6; y < 10; y += 1.5) {
          for (let x = -5.6; x < 5.4; x += 1.5) ctx.fillRect(x, y, 0.55, 0.55);
        }
        ctx.restore();
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
    t.draw(ctx, performance.now() / 1000);
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
    t.draw(ctx, performance.now() / 1000);
    ctx.restore();
  }

  root.Items = { TYPES, TYPE_IDS, drawHeld, drawResting, tone };
})(window);
