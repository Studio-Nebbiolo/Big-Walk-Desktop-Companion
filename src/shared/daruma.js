// 빨간 오뚜기: 작은 머리 공과 큰 몸통 공이 매끈하게 이어진 오뚝이.
// 바닥에 떨어지면 오뚝이처럼 흔들리고, 클릭하면 휘청인다. 20번 클릭하면 수집된다.
(function (root) {
  const tone = root.Items.tone;
  const RED = '#C9271F';
  const GRAVITY = 1900;
  const CLICKS_TO_COLLECT = 20;

  // 로컬 치수 (size = 1 기준)
  const BODY_R = 28;
  const HEAD_R = 17.5;
  const BODY_Y = -BODY_R;
  const HEAD_Y = -BODY_R * 2 - HEAD_R * 0.55;
  const HEIGHT = -HEAD_Y + HEAD_R;

  class Daruma {
    constructor(x, h = 0) {
      this.x = x;
      this.h = h;
      this.vy = 0;
      this.wobble = 0; // 바닥을 축으로 기운 각도
      this.wobbleV = 0;
      this.squash = 0;
      this.clicks = 0;
      this.t = 0;
      this.collected = false;
      this.done = false; // 터지는 효과까지 끝났다
      this.particles = [];
      this.born = performance.now();
      this.lastInteract = this.born;
    }

    get active() {
      return !this.collected;
    }

    update(dt) {
      this.t += dt;
      if (!this.collected) {
        if (this.h > 0 || this.vy > 0) {
          this.vy -= GRAVITY * dt;
          this.h += this.vy * dt;
          if (this.h <= 0) {
            this.h = 0;
            const impact = -this.vy;
            this.vy = impact > 300 ? impact * 0.25 : 0;
            this.squash = Math.min(1, impact / 900);
            this.wobbleV += (Math.random() < 0.5 ? -1 : 1) * Math.min(4, impact / 250);
          }
        }
        // 오뚝이 복원력: 기울면 다시 똑바로 서려고 흔들린다
        this.wobbleV += (-28 * this.wobble - 2.6 * this.wobbleV) * dt;
        this.wobble += this.wobbleV * dt;
        this.squash = Math.max(0, this.squash - dt * 3);
      }
      for (const p of this.particles) {
        p.t += dt;
        p.vy -= 600 * dt;
        p.x += p.vx * dt;
        p.h += p.vy * dt;
        p.rot += p.vr * dt;
      }
      this.particles = this.particles.filter((p) => p.t < p.life);
      if (this.collected && !this.particles.length) this.done = true;
    }

    // 클릭: 휘청이고 숫자를 센다. 20번째면 수집되어 펑 터진다.
    hit(fromX) {
      if (this.collected) return false;
      this.clicks++;
      this.lastInteract = performance.now();
      const dir = fromX < this.x ? 1 : -1;
      this.wobbleV += dir * (3 + Math.random() * 1.5);
      this.squash = 0.6;
      if (this.clicks >= CLICKS_TO_COLLECT) {
        this.collected = true;
        this.burst();
        return true;
      }
      return false;
    }

    burst() {
      const colors = ['#C9271F', '#F2423A', '#ffffff', '#EBAA38', '#ffe9a8'];
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 120 + Math.random() * 220;
        this.particles.push({
          kind: 'confetti',
          x: this.x,
          h: this.h + HEIGHT * 0.5,
          vx: Math.cos(a) * v,
          vy: Math.abs(Math.sin(a)) * v + 120,
          rot: Math.random() * 6,
          vr: (Math.random() - 0.5) * 14,
          color: colors[i % colors.length],
          t: 0,
          life: 1.1 + Math.random() * 0.6,
        });
      }
      this.particles.push({ kind: 'plus', x: this.x, h: this.h + HEIGHT, vx: 0, vy: 160, rot: 0, vr: 0, t: 0, life: 1.4 });
    }

    hitTest(px, py, groundY, s) {
      if (this.collected) return false;
      const cx = this.x;
      const bodyCy = groundY - this.h + BODY_Y * s;
      const headCy = groundY - this.h + HEAD_Y * s;
      const r1 = (BODY_R + 4) * s;
      const r2 = (HEAD_R + 4) * s;
      return Math.hypot(px - cx, py - bodyCy) < r1 || Math.hypot(px - cx, py - headCy) < r2;
    }

    draw(ctx, groundY, s, shadows = true) {
      if (!this.collected) {
        if (shadows) {
          const fade = Math.max(0, 1 - this.h / (70 * s));
          root.Items.softShadow(ctx, this.x, groundY - 1, (BODY_R + 6) * s, 0.26 * fade);
        }
        ctx.save();
        ctx.translate(this.x, groundY - this.h);
        ctx.rotate(this.wobble);
        const sq = this.squash * 0.18;
        ctx.scale(s * (1 + sq), s * (1 - sq));
        drawShape(ctx);
        ctx.restore();
        if (this.clicks > 0) this.drawProgress(ctx, groundY, s);
      }
      this.drawParticles(ctx, groundY, s);
    }

    // 머리 위의 작은 진행 표시: 20칸 중 몇 칸을 채웠는지
    drawProgress(ctx, groundY, s) {
      const cx = this.x;
      const cy = groundY - this.h - (HEIGHT + 12) * s;
      const r = 9 * s;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineWidth = 3 * s;
      ctx.strokeStyle = 'rgba(255,255,255,.45)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * this.clicks) / CLICKS_TO_COLLECT);
      ctx.stroke();
      ctx.restore();
    }

    drawParticles(ctx, groundY, s) {
      for (const p of this.particles) {
        const a = Math.max(0, 1 - p.t / p.life);
        const y = groundY - p.h;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(p.x, y);
        if (p.kind === 'confetti') {
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-3 * s, -1.6 * s, 6 * s, 3.2 * s);
        } else {
          ctx.font = `800 ${Math.round(20 * s)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.lineWidth = 4;
          ctx.strokeStyle = '#7a1410';
          ctx.strokeText('+1', 0, 0);
          ctx.fillStyle = '#ffffff';
          ctx.fillText('+1', 0, 0);
        }
        ctx.restore();
      }
    }
  }

  // 머리·몸통 두 공을 매끈한 허리로 이은 오뚝이 실루엣 (무광 점토 재질)
  function drawShape(ctx) {
    const path = new Path2D();
    path.arc(0, BODY_Y, BODY_R, 0, Math.PI * 2);
    path.moveTo(HEAD_R, HEAD_Y);
    path.arc(0, HEAD_Y, HEAD_R, 0, Math.PI * 2);
    // 허리: 머리 아래와 몸통 위를 부드럽게 잇는다
    const waistY = (HEAD_Y + BODY_Y - BODY_R * 0.6) / 2;
    // (원과 같은 방향(시계 방향)으로 돌아야 겹친 부분이 구멍 나지 않는다)
    path.moveTo(HEAD_R * 0.98, HEAD_Y + HEAD_R * 0.2);
    path.quadraticCurveTo(HEAD_R * 0.62, waistY, BODY_R * 0.82, BODY_Y - BODY_R * 0.55);
    path.lineTo(-BODY_R * 0.82, BODY_Y - BODY_R * 0.55);
    path.quadraticCurveTo(-HEAD_R * 0.62, waistY, -HEAD_R * 0.98, HEAD_Y + HEAD_R * 0.2);
    path.closePath();

    const g = ctx.createRadialGradient(-BODY_R * 0.35, HEAD_Y, 2, -2, BODY_Y - 6, BODY_R * 1.9);
    g.addColorStop(0, tone(RED, 0.14));
    g.addColorStop(0.45, RED);
    g.addColorStop(0.85, tone(RED, -0.18));
    g.addColorStop(1, tone(RED, -0.3));
    ctx.fillStyle = g;
    ctx.fill(path);

    // 은은한 바닥 반사광과 머리 하이라이트
    ctx.save();
    ctx.clip(path);
    const b = ctx.createRadialGradient(0, 6, 2, 0, 6, BODY_R * 1.1);
    b.addColorStop(0, 'rgba(255,230,210,.18)');
    b.addColorStop(1, 'rgba(255,230,210,0)');
    ctx.fillStyle = b;
    ctx.fillRect(-BODY_R, -BODY_R, BODY_R * 2, BODY_R + 6);
    const hl = ctx.createRadialGradient(-HEAD_R * 0.35, HEAD_Y - HEAD_R * 0.45, 0, -HEAD_R * 0.35, HEAD_Y - HEAD_R * 0.45, HEAD_R * 0.7);
    hl.addColorStop(0, 'rgba(255,255,255,.22)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(-HEAD_R, HEAD_Y - HEAD_R, HEAD_R * 2, HEAD_R * 2);
    ctx.restore();
  }

  root.Daruma = Daruma;
  root.DarumaShape = { draw: drawShape, HEIGHT, BODY_R, CLICKS_TO_COLLECT };
})(window);
