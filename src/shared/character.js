// 캐릭터 한 명의 행동(상태 머신·물리)과 그리기.
// 컴패니언 창과 설정 창의 미리보기가 같이 쓴다.
(function (root) {
  const { colorHex } = root.Palette;

  const GRAVITY = 1900;
  const BASE_WALK_SPEED = 42;

  // 기본 치수 (size = 1 기준 px)
  const DIM = {
    bodyR: 24,
    torsoR: 13,
    headR: 17,
    limbW: 6,
    handR: 5.5,
    legLen: { long: 40, short: 22 },
  };

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255;
    let g = (n >> 8) & 255;
    let b = n & 255;
    if (amt >= 0) {
      r += (255 - r) * amt;
      g += (255 - g) * amt;
      b += (255 - b) * amt;
    } else {
      r *= 1 + amt;
      g *= 1 + amt;
      b *= 1 + amt;
    }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  function ball(ctx, x, y, r, hex) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.05);
    g.addColorStop(0, shade(hex, 0.22));
    g.addColorStop(0.55, hex);
    g.addColorStop(1, shade(hex, -0.28));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function noodle(ctx, from, ctrl, to, width, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(ctrl.x, ctrl.y, to.x, to.y);
    ctx.stroke();
  }

  function foot(ctx, x, y, angle, hex) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = hex;
    ctx.beginPath();
    ctx.ellipse(4, 0, 8.5, 4.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  class Character {
    constructor(cfg, opts = {}) {
      this.cfg = cfg;
      this.x = opts.x ?? 100;
      this.h = opts.h ?? 0; // 땅(작업표시줄 위)으로부터의 높이
      this.vx = 0;
      this.vy = 0;
      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.phase = Math.random() * Math.PI * 2;
      this.t = Math.random() * 10;
      this.blinkT = rand(2, 5);
      this.blink = 0;
      this.squash = 0;
      this.look = { x: 0, y: 0 };
      this.greetCooldown = rand(3, 8);
      this.setState(opts.state || 'idle');
    }

    get scale() {
      return (this.cfg.size || 1) * (this.globalSize || 1);
    }

    get legLen() {
      return DIM.legLen[this.cfg.legs === 'short' ? 'short' : 'long'];
    }

    get height() {
      return (this.legLen + DIM.bodyR * 1.75 + DIM.torsoR * 1.5 + DIM.headR * 1.9) * this.scale;
    }

    setState(state, duration) {
      this.state = state;
      this.stateT = 0;
      const d = {
        idle: rand(1.2, 3.5),
        walk: rand(3, 9),
        sit: rand(5, 12),
        wave: rand(1.4, 2.2),
        cheer: 1.1,
        look: rand(1, 2),
      };
      this.stateDur = duration ?? d[state] ?? 1;
    }

    // --- 행동 -----------------------------------------------------------
    pickNext() {
      const r = Math.random();
      if (this.state === 'walk') return r < 0.75 ? 'idle' : r < 0.9 ? 'wave' : 'sit';
      if (this.state === 'sit') return 'idle';
      if (r < 0.62) return 'walk';
      if (r < 0.78) return 'sit';
      if (r < 0.9) return 'look';
      return 'wave';
    }

    poke() {
      if (this.state === 'drag') return;
      if (this.h <= 0.5) {
        this.vy = rand(430, 520);
        this.vx = 0;
        this.state = 'air';
        this.stateT = 0;
        this.afterLand = 'cheer';
      }
    }

    grab() {
      this.state = 'drag';
      this.stateT = 0;
      this.vx = 0;
      this.vy = 0;
    }

    release(vx, vy) {
      this.state = 'air';
      this.stateT = 0;
      this.vx = clamp(vx, -900, 900);
      this.vy = clamp(vy, -900, 900);
      this.afterLand = 'idle';
    }

    update(dt, world) {
      this.t += dt;
      this.stateT += dt;
      const speed = world.speed || 1;

      // 눈 깜빡임
      this.blinkT -= dt;
      if (this.blinkT <= 0) {
        this.blink = 0.14;
        this.blinkT = rand(2, 6);
      }
      this.blink = Math.max(0, this.blink - dt);
      this.squash = Math.max(0, this.squash - dt * 4);
      this.greetCooldown = Math.max(0, this.greetCooldown - dt);

      const s = this.scale;
      const margin = (DIM.bodyR + 12) * s;
      const minX = margin;
      const maxX = Math.max(minX, world.width - margin);

      if (this.state === 'drag') {
        this.phase += dt * 6;
        return;
      }

      if (this.state === 'air' || this.h > 0) {
        if (this.state !== 'air') {
          this.state = 'air';
          this.afterLand = 'idle';
        }
        this.vy -= GRAVITY * dt;
        this.h += this.vy * dt;
        this.x += this.vx * dt;
        // 창 위로 날아가 잘리지 않도록 천장에 부딪힌다.
        const ceiling = world.height ? Math.max(0, world.height - this.height - 24 * s) : Infinity;
        if (this.h > ceiling) {
          this.h = ceiling;
          this.vy = Math.min(this.vy, 0);
        }
        if (this.x < minX) {
          this.x = minX;
          this.vx = Math.abs(this.vx) * 0.5;
        } else if (this.x > maxX) {
          this.x = maxX;
          this.vx = -Math.abs(this.vx) * 0.5;
        }
        if (this.h <= 0) {
          this.h = 0;
          if (this.vy < -520) {
            this.vy = -this.vy * 0.32;
            this.vx *= 0.6;
            this.squash = 1;
          } else {
            this.vy = 0;
            this.vx = 0;
            this.squash = 0.7;
            this.setState(this.afterLand || 'idle');
          }
        }
        return;
      }

      if (world.paused && (this.state === 'walk' || this.state === 'sit')) this.setState('idle');
      if (this.stateT >= this.stateDur) this.setState(world.paused ? 'idle' : this.pickNext());

      if (this.state === 'walk') {
        const v = BASE_WALK_SPEED * s * speed;
        this.x += this.dir * v * dt;
        this.phase += dt * 7.5 * Math.sqrt(speed);
        if (this.x <= minX) {
          this.x = minX;
          this.dir = 1;
        } else if (this.x >= maxX) {
          this.x = maxX;
          this.dir = -1;
        }
        if (world.others && this.greetCooldown <= 0) this.tryGreet(world.others);
      } else {
        this.x = clamp(this.x, minX, maxX);
        // 걷다 멈추면 다리를 모은다
        const target = Math.round(this.phase / Math.PI) * Math.PI;
        this.phase += (target - this.phase) * Math.min(1, dt * 8);
      }

      if (this.state === 'look' && this.stateT > this.stateDur * 0.5 && !this.turned) {
        this.dir *= -1;
        this.turned = true;
      }
      if (this.state !== 'look') this.turned = false;
    }

    tryGreet(others) {
      for (const o of others) {
        if (o === this || o.state === 'drag' || o.state === 'air' || o.h > 0) continue;
        const dx = o.x - this.x;
        const reach = (DIM.bodyR * 2 + 26) * Math.max(this.scale, o.scale);
        if (Math.sign(dx) === this.dir && Math.abs(dx) < reach && Math.abs(dx) > reach * 0.55) {
          this.greetCooldown = rand(12, 25);
          o.greetCooldown = rand(12, 25);
          if (Math.random() < 0.55) {
            this.setState('wave', rand(1.6, 2.4));
            o.dir = -this.dir;
            o.setState('wave', rand(1.6, 2.4));
          }
          return;
        }
      }
    }

    // --- 포즈 & 그리기 ----------------------------------------------------
    bounds(groundY) {
      const s = this.scale;
      const w = (DIM.bodyR + 14) * s;
      const bottom = groundY - this.h + 2;
      return { x0: this.x - w, x1: this.x + w, y0: bottom - this.height, y1: bottom };
    }

    hitTest(px, py, groundY) {
      const b = this.bounds(groundY);
      return px >= b.x0 && px <= b.x1 && py >= b.y0 && py <= b.y1;
    }

    lookAt(px, py, groundY) {
      if (px == null) {
        this.look.x = 0;
        this.look.y = 0;
        return;
      }
      const b = this.bounds(groundY);
      const cx = this.x;
      const cy = b.y0 + DIM.headR * this.scale;
      const dx = (px - cx) * this.dir;
      const dy = py - cy;
      const len = Math.hypot(dx, dy) || 1;
      this.look.x = dx / len;
      this.look.y = dy / len;
    }

    draw(ctx, groundY) {
      const s = this.scale;
      const c = this.cfg.colors;
      const col = {
        head: colorHex(c.head),
        torso: colorHex(c.torso),
        body: colorHex(c.body),
        legs: colorHex(c.legs),
      };
      const { bodyR, torsoR, headR, limbW, handR } = DIM;
      const legLen = this.legLen;
      const st = this.state;
      const sitting = st === 'sit' && this.h <= 0;
      const dangling = st === 'drag';
      const airborne = st === 'air';
      const walking = st === 'walk';
      const ph = this.phase;

      // 그림자
      const shadowA = clamp(0.28 - this.h / 900, 0.05, 0.28);
      ctx.fillStyle = `rgba(0,0,0,${shadowA})`;
      ctx.beginPath();
      ctx.ellipse(this.x, groundY - 1, (bodyR + 4) * s * (1 - Math.min(0.5, this.h / 600)), 4 * s, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(this.x, groundY - this.h);
      const sq = this.squash * 0.12;
      ctx.scale(this.dir * s * (1 + sq), s * (1 - sq));

      // --- 몸 위치 계산 (로컬 좌표: +x 가 앞, y 는 아래가 +) ---
      let bob = 0;
      let lean = 0;
      if (walking) {
        bob = -Math.abs(Math.sin(ph)) * 2.5;
        lean = 0.05;
      } else if (st === 'cheer') {
        bob = -Math.abs(Math.sin(this.stateT * 12)) * 3;
      } else if (!dangling && !airborne) {
        bob = Math.sin(this.t * 2.2) * 0.8; // 숨쉬기
      }

      const bodyY = sitting ? -bodyR * 0.95 : -legLen - bodyR * 0.72 + bob;
      const torsoY = bodyY - bodyR - torsoR * 0.45;
      const headY = torsoY - torsoR - headR * 0.78;
      const hipY = bodyY + bodyR * 0.72;

      const tilt = lean + (dangling ? Math.sin(this.t * 3) * 0.08 : 0) + (airborne ? clamp(this.vx / 3000, -0.15, 0.15) * this.dir : 0);

      // --- 다리 ---
      const legs = [];
      for (const side of [-1, 1]) {
        // side -1 = 뒤쪽 다리, 1 = 앞쪽 다리
        const hip = { x: side * 5, y: hipY - 4 };
        let ankle;
        let ctrl;
        let fAngle = 0;
        if (sitting) {
          ankle = { x: bodyR + 10 - (side < 0 ? 4 : 0), y: -5 - (side < 0 ? 3 : 0) };
          hip.y = bodyY + bodyR * 0.6;
          ctrl = { x: bodyR * 0.8, y: -2 };
          fAngle = -1.35;
        } else if (dangling || airborne) {
          const sw = dangling ? Math.sin(this.t * 5 + side) * 5 : side * 3;
          ankle = { x: hip.x + sw, y: hipY + legLen - 2 };
          ctrl = { x: hip.x + sw * 0.3 + 3, y: hipY + legLen * 0.5 };
          fAngle = 0.45;
        } else {
          const p = ph + (side > 0 ? 0 : Math.PI);
          const stride = walking ? 10 : 0;
          const lift = walking ? Math.max(0, Math.cos(p)) * 7 : 0;
          ankle = { x: hip.x + Math.sin(p) * stride, y: -4.6 - lift };
          ctrl = { x: (hip.x + ankle.x) / 2 + 5, y: (hip.y + ankle.y) / 2 };
          fAngle = walking ? Math.sin(p) * -0.25 * (lift > 0 ? 1 : 0) : 0;
        }
        legs.push({ side, hip, ankle, ctrl, fAngle });
      }

      // --- 팔 ---
      const arms = [];
      for (const side of [-1, 1]) {
        const sh = { x: side * 3, y: torsoY + 3 };
        let hand;
        let ctrl;
        if (dangling) {
          hand = { x: side * 9 + Math.sin(this.t * 6 + side) * 3, y: headY - headR - 12 };
          ctrl = { x: side * 16, y: torsoY - 8 };
        } else if (st === 'cheer' || (airborne && this.afterLand === 'cheer')) {
          hand = { x: side * 14 + 4, y: headY - headR - 6 + Math.sin(this.t * 14) * 3 };
          ctrl = { x: side * 22, y: torsoY - 4 };
        } else if (st === 'wave' && side > 0) {
          const w = Math.sin(this.stateT * 11) * 7;
          hand = { x: 14 + w, y: headY - headR - 10 };
          ctrl = { x: torsoR + 18, y: torsoY - 8 };
        } else if (sitting) {
          hand = { x: bodyR + 6 - (side < 0 ? 5 : 0), y: -14 - (side < 0 ? 3 : 0) };
          ctrl = { x: bodyR * 0.9, y: torsoY + 4 };
        } else if (airborne) {
          hand = { x: side * 20, y: torsoY - 2 };
          ctrl = { x: side * 22, y: torsoY + 12 };
        } else {
          const sw = walking ? Math.sin(ph + (side > 0 ? Math.PI : 0)) * 9 : Math.sin(this.t * 1.8 + side) * 1.2;
          hand = { x: side * bodyR * 0.3 + sw, y: bodyY + 6 };
          ctrl = { x: side * (bodyR + 10) + sw * 0.5, y: torsoY + 10 };
        }
        arms.push({ side, sh, hand, ctrl });
      }

      ctx.rotate(tilt);

      const backLimb = (hex) => shade(hex, -0.22);

      // 뒤쪽 팔
      {
        const a = arms[0];
        noodle(ctx, a.sh, a.ctrl, a.hand, limbW, backLimb(col.torso));
        ball(ctx, a.hand.x, a.hand.y, handR, shade(col.torso, -0.22));
      }
      // 다리 (뒤 → 앞)
      for (const l of legs) {
        const hex = l.side < 0 ? backLimb(col.legs) : col.legs;
        noodle(ctx, l.hip, l.ctrl, l.ankle, limbW, hex);
        foot(ctx, l.ankle.x, l.ankle.y, l.fAngle, hex);
      }
      // 몸통, 목
      ball(ctx, 0, bodyY, bodyR, col.body);
      ball(ctx, 0, torsoY, torsoR, col.torso);

      // 코 → 머리 → 눈
      ctx.save();
      ctx.translate(headR * 0.92, headY + headR * 0.12);
      ctx.rotate(-0.12);
      ctx.fillStyle = shade(col.head, -0.08);
      ctx.beginPath();
      ctx.ellipse(0, 0, headR * 0.55, headR * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ball(ctx, 0, headY, headR, col.head);

      const ex = headR * 0.28;
      const ey = headY - headR * 0.14;
      const er = headR * 0.42;
      const open = this.blink > 0 ? 0.12 : 1;
      ctx.fillStyle = '#fbfbf6';
      ctx.beginPath();
      ctx.ellipse(ex, ey, er, er * open, 0, 0, Math.PI * 2);
      ctx.fill();
      if (open > 0.5) {
        const lx = this.look.x * er * 0.35 + er * 0.08;
        const ly = this.look.y * er * 0.3;
        ctx.fillStyle = '#141414';
        ctx.beginPath();
        ctx.arc(ex + lx, ey + ly, er * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // 앞쪽 팔
      {
        const a = arms[1];
        noodle(ctx, a.sh, a.ctrl, a.hand, limbW, col.torso);
        ball(ctx, a.hand.x, a.hand.y, handR, col.torso);
      }

      ctx.restore();
    }
  }

  root.Character = Character;
  root.CharacterDims = DIM;
})(window);
