// 캐릭터 한 명의 행동(상태 머신 · 물리)과 그리기.
// 컴패니언 창과 설정 창의 미리보기가 같이 쓴다.
//
// 모양: 머리 공 / 목 공(몸통 색) / 아래 큰 공(다리 색) + 국수 같은 팔다리.
// 몸은 정면을 보고 머리(눈·코)만 가는 방향을 본다. 모든 친구가 같은 비율, 같은 크기다.
(function (root) {
  const { colorHex } = root.Palette;
  const Items = root.Items;
  const tone = Items.tone;

  const GRAVITY = 1900;
  const WALK_SPEED = 42;
  const BUMP_SPEED = 700; // 이보다 세게 떨어지면 엉덩방아

  // 비율은 녹화 영상에서 잰 값: 손은 목 공의 절반 남짓, 다리는 팔보다 약간 가늘다.
  const DIM = { bodyR: 24, torsoR: 13, headR: 17, legLen: 40, limbW: 6.5, legW: 5.2, handR: 7 };
  const HEIGHT = DIM.legLen + DIM.bodyR * 1.8 + DIM.torsoR * 1.45 + DIM.headR * 1.78;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (k) => k * k * (3 - 2 * k);

  // ---------------------------------------------------------------------------
  // 무광 점토 재질
  // ---------------------------------------------------------------------------

  // 위에서 오는 부드러운 빛 + 아래쪽 반사광. 광택 하이라이트는 넣지 않는다.
  function ball(ctx, x, y, r, hex) {
    const g = ctx.createRadialGradient(x - r * 0.28, y - r * 0.42, r * 0.05, x - r * 0.08, y - r * 0.12, r * 1.12);
    g.addColorStop(0, tone(hex, 0.1));
    g.addColorStop(0.45, hex);
    g.addColorStop(0.85, tone(hex, -0.14));
    g.addColorStop(1, tone(hex, -0.24));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // 바닥에서 튀어 오른 은은한 반사광
    const b = ctx.createRadialGradient(x, y + r * 1.25, r * 0.2, x, y + r * 1.25, r * 0.95);
    b.addColorStop(0, 'rgba(255,236,210,0.16)');
    b.addColorStop(1, 'rgba(255,236,210,0)');
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = b;
    ctx.fillRect(x - r, y, r * 2, r);
    ctx.restore();
  }

  function blob(ctx, x, y, rx, ry, angle, hex) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(1, ry / rx);
    ball(ctx, 0, 0, rx, hex);
    ctx.restore();
  }

  // 위에 얹힌 공이 아래 공에 드리우는 부드러운 접촉 그림자
  function contactShadow(ctx, cx, cy, cr, x, y, r, alpha) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.clip();
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${alpha})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  // 원통처럼 보이도록 어두운 바탕 위에 밝은 심을 한 번 더 그린다.
  // c2 를 주면 3차 곡선(두 조절점), 아니면 2차 곡선.
  function noodle(ctx, a, c, b, w, hex, c2) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const path = (dx, dy) => {
      ctx.beginPath();
      ctx.moveTo(a.x + dx, a.y + dy);
      if (c2) ctx.bezierCurveTo(c.x + dx, c.y + dy, c2.x + dx, c2.y + dy, b.x + dx, b.y + dy);
      else ctx.quadraticCurveTo(c.x + dx, c.y + dy, b.x + dx, b.y + dy);
    };
    path(0, 0);
    ctx.strokeStyle = tone(hex, -0.2);
    ctx.lineWidth = w;
    ctx.stroke();
    path(-w * 0.1, -w * 0.14);
    ctx.strokeStyle = hex;
    ctx.lineWidth = w * 0.62;
    ctx.stroke();
  }

  function foot(ctx, x, y, angle, hex) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const g = ctx.createLinearGradient(0, -4.6, 0, 4.6);
    g.addColorStop(0, tone(hex, 0.08));
    g.addColorStop(1, tone(hex, -0.22));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(4, 0, 8.5, 4.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function star(ctx, x, y, r, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.fillStyle = '#FFD84A';
    ctx.strokeStyle = '#C8901E';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 발밑을 축으로 몸 전체를 기울였을 때, 월드 좌표 (x, y) 에 닿으려면 로컬에서 어디여야 하는지
  function unrotate(x, y, a) {
    const c = Math.cos(-a);
    const s = Math.sin(-a);
    return { x: x * c - y * s, y: x * s + y * c };
  }

  // 앉았을 때의 다리: 공 아래 앞쪽에서 나와 나란히 앞으로 뻗고 무릎을 살짝 굽힌다.
  // side -1(뒤쪽 다리)은 조금 뒤로 물려 두 다리가 겹쳐 보이게 한다.
  // 앉았을 때의 다리: 두 다리가 똑같은 아치 모양으로 나란히 선다.
  // 공 아래쪽에서 나와 앞으로 솟았다가, 둥글게 넘어가 발까지 거의 수직으로 내려온다.
  // (사용자가 그려준 그림: 두 개의 ∩ 가 조금 겹쳐 나란히)
  function sitLeg(side, bodyY) {
    const R = DIM.bodyR;
    const off = side > 0 ? 12 : 0; // 앞쪽 다리를 한 칸 앞으로
    const hip = { x: R * 0.55 + off, y: bodyY + R * 0.5 };
    const ankle = { x: R * 0.55 + off + 21, y: -4.6 };
    const c1 = { x: hip.x + 3, y: hip.y - R * 1.15 };
    const c2 = { x: ankle.x + 1, y: ankle.y - R * 1.75 };
    return { hip, c1, c2, ankle };
  }

  function tidyLeg(side, bodyY) {
    const R = DIM.bodyR;
    const off = side > 0 ? 0 : -5;
    const hip = { x: R * 0.5 + off, y: bodyY + R * 0.5 };
    const knee = { x: R + 13 + off, y: bodyY + R * 0.2 };
    const ankle = { x: R + 17 + off, y: -4.6 };
    // 곡선이 무릎을 지나가도록 조절점을 잡는다
    const ctrl = { x: 2 * knee.x - (hip.x + ankle.x) / 2, y: 2 * knee.y - (hip.y + ankle.y) / 2 };
    return { hip, ctrl, ankle };
  }

  function lerpPose(a, b, k) {
    if (typeof b === 'number') return typeof a === 'number' ? a + (b - a) * k : b;
    if (Array.isArray(b)) return b.map((v, i) => lerpPose(a?.[i], v, k));
    if (b && typeof b === 'object') {
      const o = {};
      for (const key in b) o[key] = lerpPose(a?.[key], b[key], k);
      return o;
    }
    return b;
  }

  const DURATIONS = {
    idle: [1.2, 3.5],
    walk: [3, 9],
    sit: [5, 12],
    wave: [1.4, 2.2],
    cheer: [1.1, 1.1],
    look: [1, 2],
    use: [1.8, 3.2],
    bump: [0.55, 0.55],
    dizzy: [2.4, 3.4],
    seek: [15, 15],
    pickup: [0.9, 0.9],
    drop: [0.8, 0.8],
  };

  class Character {
    constructor(cfg, opts = {}) {
      this.cfg = cfg;
      this.globalSize = 1;
      this.x = opts.x ?? 100;
      this.h = opts.h ?? 0; // 땅(작업표시줄 윗면)으로부터의 높이
      this.vx = 0;
      this.vy = 0;
      this.slide = 0;
      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.phase = Math.random() * Math.PI * 2;
      this.t = Math.random() * 10;
      this.blinkT = rand(2, 5);
      this.blink = 0;
      this.squash = 0;
      this.look = { x: 0, y: 0 };
      this.greetCooldown = rand(3, 8);
      this.item = null;
      this.target = null;
      this.itemCooldown = 0;
      this.lastPose = null;
      this.setState(opts.state || 'idle');
    }

    get scale() {
      return this.globalSize || 1;
    }

    get height() {
      return HEIGHT * this.scale;
    }

    setState(state, duration, blend = 0.22) {
      this.state = state;
      this.stateT = 0;
      const d = DURATIONS[state] || [1, 1];
      this.stateDur = duration ?? rand(d[0], d[1]);
      this.fromPose = this.lastPose;
      this.blendT = 0;
      this.blendDur = blend;
      if (state !== 'seek' && state !== 'pickup') this.target = null;
    }

    // --- 사용자 조작 ------------------------------------------------------------
    poke() {
      if (this.state === 'drag' || this.h > 0.5) return;
      if (this.state === 'bump' || this.state === 'dizzy') return;
      this.vy = rand(430, 520);
      this.vx = 0;
      this.setState('air', 99, 0.12);
      this.afterLand = 'cheer';
    }

    grab() {
      this.dropItem(true);
      this.setState('drag', 999, 0.15);
      this.vx = 0;
      this.vy = 0;
    }

    release(vx, vy) {
      this.setState('air', 99, 0.15);
      this.vx = clamp(vx, -1100, 1100);
      this.vy = clamp(vy, -1100, 1100);
      this.afterLand = Math.hypot(vx, vy) > 500 ? 'bump' : 'idle';
    }

    dropItem(fling) {
      const it = this.item;
      if (!it) return;
      this.item = null;
      it.heldBy = null;
      it.x = this.x + this.dir * DIM.bodyR * this.scale;
      it.h = fling ? this.h + 50 * this.scale : 0;
      it.vy = fling ? 120 : 0;
      it.dir = this.dir;
      it.touched = performance.now();
      this.itemCooldown = this.t + rand(15, 35);
    }

    // --- 행동 -------------------------------------------------------------------
    pickNext(world) {
      if (world.paused) return 'idle';
      const r = Math.random();
      if (this.item) {
        if (this.t > this.carryUntil) return 'drop';
        if (this.state === 'walk') return r < 0.55 ? 'idle' : 'use';
        return r < 0.6 ? 'walk' : r < 0.85 ? 'use' : 'look';
      }
      if (world.items && this.t > this.itemCooldown && r < 0.5) {
        let best = null;
        for (const it of world.items) {
          if (it.heldBy || it.h > 0 || (it.alpha ?? 1) < 1) continue;
          const d = Math.abs(it.x - this.x);
          if (d < 600 && (!best || d < Math.abs(best.x - this.x))) best = it;
        }
        if (best) {
          this.target = best;
          return 'seek';
        }
      }
      const q = Math.random();
      if (this.state === 'walk') return q < 0.75 ? 'idle' : q < 0.9 ? 'wave' : 'sit';
      if (this.state === 'sit') return 'idle';
      if (q < 0.62) return 'walk';
      if (q < 0.78) return 'sit';
      if (q < 0.9) return 'look';
      return 'wave';
    }

    onStateEnd(world) {
      switch (this.state) {
        case 'bump':
          return this.setState('dizzy', undefined, 0.3);
        case 'dizzy':
          return this.setState('idle', undefined, 0.8); // 천천히 일어난다
        default: {
          const next = this.pickNext(world);
          const target = this.target;
          this.setState(next);
          if (next === 'seek') this.target = target;
        }
      }
    }

    update(dt, world) {
      this.t += dt;
      this.stateT += dt;
      this.blendT += dt;
      const speed = world.speed || 1;

      this.blinkT -= dt;
      if (this.blinkT <= 0) {
        this.blink = 0.14;
        this.blinkT = rand(2, 6);
      }
      this.blink = Math.max(0, this.blink - dt);
      this.squash = Math.max(0, this.squash - dt * 3);
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
          this.setState('air', 99, 0.15);
          this.afterLand = 'idle';
        }
        this.vy -= GRAVITY * dt;
        this.h += this.vy * dt;
        this.x += this.vx * dt;
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
          const impact = -this.vy;
          if (this.afterLand === 'bump' || impact > BUMP_SPEED) {
            // 엉덩방아
            this.vy = 0;
            this.slide = this.vx * 0.6;
            this.vx = 0;
            this.squash = 1;
            this.setState('bump', undefined, 0.07);
          } else if (impact > 520) {
            this.vy = impact * 0.3;
            this.vx *= 0.6;
            this.squash = 0.8;
          } else {
            this.vy = 0;
            this.vx = 0;
            this.squash = 0.6;
            this.setState(this.afterLand || 'idle');
          }
        }
        return;
      }

      if (this.state === 'bump') {
        this.x = clamp(this.x + this.slide * dt, minX, maxX);
        this.slide *= Math.exp(-6 * dt);
      }

      if (world.paused && ['walk', 'sit', 'seek'].includes(this.state)) this.setState('idle');

      // 아이템을 주우러 가는 중
      if (this.state === 'seek') {
        const it = this.target;
        if (!it || it.heldBy || it.h > 0 || !world.items?.includes(it)) {
          this.setState('idle');
        } else {
          const reach = DIM.bodyR * 0.95 * s;
          const side = it.x >= this.x ? 1 : -1;
          const standX = clamp(it.x - side * reach, minX, maxX);
          const dx = standX - this.x;
          if (Math.abs(dx) < 2.5) {
            this.x = standX;
            this.dir = side;
            this.setState('pickup');
            this.target = it;
          } else {
            this.dir = Math.sign(dx);
            const step = Math.min(Math.abs(dx), WALK_SPEED * s * speed * 1.15 * dt);
            this.x += this.dir * step;
            this.phase += dt * 7.5 * Math.sqrt(speed);
          }
        }
      }

      if (this.state === 'pickup' && !this.item && this.stateT > 0.45) {
        const it = this.target;
        if (it && !it.heldBy && world.items?.includes(it)) {
          it.heldBy = this;
          this.item = it;
          this.carryUntil = this.t + rand(20, 50);
        }
        this.target = null;
      }
      if (this.state === 'drop' && this.item && this.stateT > 0.45) this.dropItem(false);

      if (this.stateT >= this.stateDur) this.onStateEnd(world);

      if (this.state === 'walk') {
        const v = WALK_SPEED * s * speed;
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
      } else if (this.state !== 'seek') {
        this.x = clamp(this.x, minX, maxX);
        // 멈추면 다리를 모은다
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
        if (o === this || !['idle', 'walk', 'look'].includes(o.state) || o.h > 0) continue;
        const dx = o.x - this.x;
        const reach = (DIM.bodyR * 2 + 26) * this.scale;
        if (Math.sign(dx) === this.dir && Math.abs(dx) < reach && Math.abs(dx) > reach * 0.55) {
          this.greetCooldown = rand(12, 25);
          o.greetCooldown = rand(12, 25);
          if (Math.random() < 0.55) {
            this.setState(this.item ? 'use' : 'wave', rand(1.6, 2.4));
            o.dir = -this.dir;
            o.setState(o.item ? 'use' : 'wave', rand(1.6, 2.4));
          }
          return;
        }
      }
    }

    // --- 히트 테스트 --------------------------------------------------------------
    bounds(groundY) {
      const s = this.scale;
      const w = (DIM.bodyR + 18) * s;
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
      const dx = (px - this.x) * this.dir;
      const dy = py - (b.y0 + DIM.headR * this.scale);
      const len = Math.hypot(dx, dy) || 1;
      this.look.x = dx / len;
      this.look.y = dy / len;
    }

    // --- 포즈 ---------------------------------------------------------------------
    // 로컬 좌표: +x 가 바라보는 쪽, y 는 아래가 +, 원점은 두 발 사이 바닥.
    computePose() {
      const { bodyR: R, torsoR: T, headR: H, legLen: L, handR } = DIM;
      const st = this.state;
      const ph = this.phase;
      const t = this.t;
      const walking = st === 'walk' || st === 'seek';
      const onButt = st === 'bump' || st === 'dizzy';
      const sitting = st === 'sit';
      const crouch = st === 'pickup' || st === 'drop';
      const dangling = st === 'drag';
      const airborne = st === 'air';
      const cheering = st === 'cheer' || (airborne && this.afterLand === 'cheer');

      const P = {
        bodyY: 0,
        torsoX: 0,
        headX: 0,
        headDY: 0,
        tilt: 0,
        headTilt: 0,
        lid: 0,
        eyeSpin: 0,
        frontArmBehind: 0,
        legsOnTop: 0,
        face: 0, // 0 = 옆얼굴, 1 = 정면. 앉을 때는 보는 사람 쪽으로 고개를 돌린다
        legs: [],
        arms: [],
        item: null,
        legsFront: false,
        fx: null,
      };

      // --- 몸 높이 / 흔들림 ---
      let bob = 0;
      if (walking) {
        bob = -Math.abs(Math.cos(ph)) * 3;
        P.tilt = Math.sin(ph) * 0.05 + 0.04;
        // 머리와 목이 한 박자 늦게 따라오는 출렁임
        P.torsoX = -Math.sin(ph - 0.6) * 1.2;
        P.headX = -Math.sin(ph - 1.1) * 2.2;
        P.headTilt = -Math.sin(ph - 0.9) * 0.07;
      } else if (st === 'cheer') {
        bob = -Math.abs(Math.sin(this.stateT * 12)) * 3;
      } else if (!dangling && !airborne && !onButt) {
        bob = Math.sin(t * 2.2) * 0.8; // 숨쉬기
      }

      if (sitting) {
        P.bodyY = -R - 2;
        P.face = 0.65;
        P.legsOnTop = 1; // 다리 아치가 팔보다 앞에 보인다
      }
      else if (onButt) P.bodyY = -R * 0.98;
      else if (crouch) P.bodyY = -L * 0.72 - R * 0.8;
      else P.bodyY = -L - R * 0.8 + bob;

      if (crouch) P.tilt = 0.24;
      if (dangling) P.tilt = Math.sin(t * 3) * 0.08;
      if (airborne) P.tilt = clamp(this.vx / 3000, -0.15, 0.15) * this.dir;

      // 헤롱헤롱: 머리가 늦게 따라오며 빙글빙글
      if (st === 'dizzy') {
        const w = t * 5;
        P.tilt = Math.sin(w) * 0.07;
        P.torsoX = Math.cos(w) * 2.5;
        P.headX = Math.cos(w - 0.7) * 5.5;
        P.headDY = Math.sin(w - 0.7) * 1.8;
        P.headTilt = Math.sin(w - 1) * 0.22;
        P.lid = 0.45;
        P.eyeSpin = 1;
        P.fx = 'stars';
      }
      if (st === 'bump') {
        P.lid = 1; // 쿵! 눈을 질끈
        P.torsoX = -2;
        P.headX = -4;
        P.headDY = 3;
      }

      const bodyY = P.bodyY;
      const torsoY = bodyY - R - T * 0.45;
      const headY = torsoY - T - H * 0.78 + P.headDY;
      const hipY = bodyY + R * (sitting || onButt ? 0.55 : 0.72);

      // --- 다리 ---
      const bumpK = st === 'bump' ? ease(clamp(this.stateT / 0.5, 0, 1)) : 1;
      for (const side of [-1, 1]) {
        const hip = { x: side * R * 0.26, y: hipY };
        let ankle;
        let ctrl;
        let fa = 0;
        let cubic = null;
        if (sitting) {
          // 두 다리가 나란히 같은 아치를 그린다
          const leg = sitLeg(side, bodyY);
          hip.x = leg.hip.x;
          hip.y = leg.hip.y;
          ankle = leg.ankle;
          cubic = [leg.c1, leg.c2];
          fa = 0;
          P.legsFront = true;
        } else if (onButt) {
          // 엉덩방아 / 헤롱헤롱: 두 다리를 가지런히 앞으로: 큰 공을 바닥에 대고 두 다리를 가지런히 앞으로 모은다.
          // 무릎은 살짝만 굽히고 두 발은 나란히 앞바닥에 딛는다 (벌리지 않는다).
          const tidy = tidyLeg(side, bodyY);
          hip.x = tidy.hip.x;
          hip.y = tidy.hip.y;
          ankle = tidy.ankle;
          ctrl = tidy.ctrl;
          fa = 0;
          if (st === 'bump') {
            // 엉덩방아: 쿵 하는 순간 두 다리가 앞으로 번쩍 들렸다가 가지런히 내려온다
            const upA = { x: tidy.ankle.x - 2, y: bodyY - R * 0.4 };
            const upC = { x: tidy.hip.x + 8, y: bodyY + R * 0.2 };
            ankle = { x: upA.x + (ankle.x - upA.x) * bumpK, y: upA.y + (ankle.y - upA.y) * bumpK };
            ctrl = { x: upC.x + (ctrl.x - upC.x) * bumpK, y: upC.y + (ctrl.y - upC.y) * bumpK };
            fa = -1.3 * (1 - bumpK);
          }
          P.legsFront = true;
        } else if (crouch) {
          ankle = { x: hip.x, y: -4.6 };
          ctrl = { x: hip.x + 8, y: (hip.y + ankle.y) / 2 };
        } else if (dangling || airborne) {
          const sw = dangling ? Math.sin(t * 5 + side * 1.3) * 5 : side * 2;
          ankle = { x: hip.x + sw, y: hip.y + L - (airborne ? 6 : 1) };
          ctrl = { x: hip.x + sw * 0.4 + side * 2, y: hip.y + L * 0.5 };
          fa = 0.35;
        } else {
          // 걷기: 두 발이 번갈아 들렸다 앞으로 나간다
          const p = ph + (side > 0 ? 0 : Math.PI);
          const stride = walking ? 8 : 0;
          const lift = walking ? Math.max(0, Math.sin(p)) * 9 : 0;
          ankle = { x: hip.x - Math.cos(p) * stride, y: -4.6 - lift };
          // 드는 다리는 무릎이 앞으로 굽고, 딛는 다리는 곧게 편다
          ctrl = { x: (hip.x + ankle.x) / 2 + 1 + lift * 0.9, y: (hip.y + ankle.y) / 2 + lift * 0.3 };
          fa = lift > 0 ? 0.45 * (lift / 9) : 0;
        }
        // 모든 다리를 3차 곡선으로 통일해 두면 자세 사이를 부드럽게 섞을 수 있다
        if (!cubic) {
          cubic = [
            { x: hip.x + ((ctrl.x - hip.x) * 2) / 3, y: hip.y + ((ctrl.y - hip.y) * 2) / 3 },
            { x: ankle.x + ((ctrl.x - ankle.x) * 2) / 3, y: ankle.y + ((ctrl.y - ankle.y) * 2) / 3 },
          ];
        }
        P.legs.push({
          hx: hip.x, hy: hip.y,
          cx: cubic[0].x, cy: cubic[0].y,
          c2x: cubic[1].x, c2y: cubic[1].y,
          ax: ankle.x, ay: ankle.y, fa,
        });
      }

      // --- 팔: 목 공 양옆에서 나와 바깥으로 휘어진다 ---
      const it = this.item?.type;
      const waveSide = it ? -1 : 1;
      for (const side of [-1, 1]) {
        const sh = { x: side * T * 0.7, y: torsoY + T * 0.25 };
        let hand;
        let ctrl;
        if (dangling) {
          hand = { x: side * (T + 8) + Math.sin(t * 6 + side) * 3, y: headY - H - 10 };
          ctrl = { x: side * (T + 16), y: torsoY - 4 };
        } else if (cheering) {
          hand = { x: side * R * 0.95, y: headY - H - 4 + Math.sin(t * 14 + side) * 3 };
          ctrl = { x: side * R * 1.35, y: torsoY + 2 };
        } else if (st === 'wave' && side === waveSide) {
          const w = Math.sin(this.stateT * 11);
          hand = { x: side * (R * 0.95 + w * 6), y: headY - H - 8 + Math.abs(w) * 2 };
          ctrl = { x: side * R * 1.4, y: torsoY + 2 };
        } else if (st === 'bump') {
          // 놀라서 팔이 번쩍
          hand = { x: side * (R + 10), y: torsoY - 16 * (1 - bumpK * 0.5) };
          ctrl = { x: side * (R + 8), y: torsoY + 2 };
        } else if (sitting) {
          // 두 팔을 공 양옆으로 편안히 늘어뜨려 손을 바닥에 내려놓는다
          const sway = Math.sin(t * 1.6 + side) * 0.6;
          hand = { x: side * R * 1.0 + sway, y: -handR - 1 };
          ctrl = { x: side * R * 1.25, y: torsoY + T * 0.9 };
        } else if (sitting || st === 'dizzy') {
          // 두 팔을 공 옆으로 편안히 늘어뜨려 손을 바닥 가까이에 내려놓는다
          // (헤롱거릴 땐 느슨하게 흔들린다)
          const loose = st === 'dizzy' ? Math.sin(t * 5 + side) * 2.5 : Math.sin(t * 1.6 + side) * 0.6;
          hand = { x: side * R * (side > 0 ? 0.8 : 0.95) + loose, y: -handR - 0.5 };
          ctrl = { x: side * R * 1.1, y: torsoY + T * 1.4 };
        } else if (crouch && side > 0) {
          // 바닥의 물건을 향해 손을 뻗는다
          hand = unrotate(R * 0.95 + 2, -7, P.tilt);
          ctrl = { x: R * 1.25, y: torsoY + T * 1.5 };
        } else if (airborne) {
          hand = { x: side * (R + 12), y: torsoY - 4 };
          ctrl = { x: side * (R + 6), y: torsoY + 10 };
        } else {
          const p = ph + (side > 0 ? Math.PI : 0);
          const swing = walking ? Math.cos(p) * -6 : 0;
          const breathe = Math.sin(t * 1.8 + side) * 0.8;
          hand = { x: side * R * 1.08 + swing, y: bodyY - R * 0.35 + breathe - (walking ? Math.abs(Math.cos(p)) * 2.5 : 0) };
          ctrl = { x: side * R * 1.15 + swing * 0.4, y: torsoY + T * 0.7 };
        }
        P.arms.push({ sx: sh.x, sy: sh.y, cx: ctrl.x, cy: ctrl.y, hx: hand.x, hy: hand.y });
      }

      // --- 들고 있는 물건 ---
      if (it && !dangling) {
        const front = P.arms[1];
        const back = P.arms[0];
        const using = st === 'use';
        if (it === 'radio') {
          // 두 손으로 배 앞에 든다. 쓸 때는 가슴까지 들어 올려 음악을 튼다.
          const y = using ? torsoY + T * 0.9 : bodyY - R * 0.15;
          Object.assign(front, { hx: 21, hy: y + 3, cx: R * 1.25, cy: torsoY + T * 1.2 });
          Object.assign(back, { hx: -21, hy: y + 3, cx: -R * 1.25, cy: torsoY + T * 1.2 });
          P.item = { x: 0, y, a: using ? Math.sin(t * 6) * 0.06 : 0 };
          if (using) P.fx = 'notes';
        } else if (it === 'megaphone' && using) {
          // 두 손으로 확성기를 입에 대고 앞으로 외친다
          const gx = H * 1.55;
          const gy = headY + H * 0.95;
          Object.assign(front, { hx: gx, hy: gy, cx: R * 1.2, cy: torsoY + T * 0.8 });
          Object.assign(back, { hx: gx + 20, hy: gy - 9, cx: R * 0.7, cy: torsoY + T * 1.5 });
          P.item = { x: gx, y: gy, a: -0.08 };
          P.fx = 'shout';
        } else if (it === 'walkie' && using) {
          // 무전기를 얼굴 옆에 대고 말한다
          const gx = H * 1.2;
          const gy = headY + H * 0.75;
          Object.assign(front, { hx: gx, hy: gy, cx: R * 1.25, cy: torsoY + T * 0.9 });
          P.item = { x: gx, y: gy - 3, a: -0.15 };
          P.fx = 'radio';
        } else {
          const a = it === 'megaphone' ? 1.25 : 0.05;
          P.item = { x: front.hx, y: front.hy, a: crouch ? a + 0.2 : a };
        }
      }
      return P;
    }

    // --- 그리기 -------------------------------------------------------------------
    draw(ctx, groundY) {
      const s = this.scale;
      const c = this.cfg.colors;
      const col = { head: colorHex(c.head), body: colorHex(c.body), legs: colorHex(c.legs) };
      const { bodyR: R, torsoR: T, headR: H, limbW, legW, handR } = DIM;

      let P = this.computePose();
      if (this.fromPose && this.blendT < this.blendDur) {
        P = lerpPose(this.fromPose, P, ease(this.blendT / this.blendDur));
      }
      this.lastPose = P;

      // 그림자
      const shadowA = clamp(0.28 - this.h / 900, 0.05, 0.28);
      ctx.fillStyle = `rgba(0,0,0,${shadowA})`;
      ctx.beginPath();
      ctx.ellipse(this.x, groundY - 1, (R + 8) * s * (1 - Math.min(0.5, this.h / 600)), 4.5 * s, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(this.x, groundY - this.h);
      const sq = this.squash * 0.14;
      ctx.scale(this.dir * s * (1 + sq), s * (1 - sq));
      ctx.rotate(P.tilt);

      const bodyY = P.bodyY;
      const torsoY = bodyY - R - T * 0.45;
      const headY = torsoY - T - H * 0.78 + P.headDY;
      const tx = P.torsoX;
      const hx = P.headX;

      const drawLeg = (l, i) => {
        const hex = i === 0 ? tone(col.legs, -0.1) : col.legs;
        // 공 앞을 지나는 다리는 같은 색 공과 구분되도록 윤곽을 두른다
        const c2 = { x: l.c2x, y: l.c2y };
        if (P.legsFront) noodle(ctx, { x: l.hx, y: l.hy }, { x: l.cx, y: l.cy }, { x: l.ax, y: l.ay }, legW + 1.2, tone(col.legs, -0.28), c2);
        noodle(ctx, { x: l.hx, y: l.hy }, { x: l.cx, y: l.cy }, { x: l.ax, y: l.ay }, legW, hex, c2);
        foot(ctx, l.ax, l.ay, l.fa, hex);
      };
      const drawArm = (a, i) => {
        const hex = i === 0 ? tone(col.body, -0.08) : col.body;
        noodle(ctx, { x: a.sx + tx, y: a.sy }, { x: a.cx + tx * 0.5, y: a.cy }, { x: a.hx, y: a.hy }, limbW, hex);
        ball(ctx, a.hx, a.hy, handR, hex);
      };

      // 머리 뒤로 올라간 팔은 먼저 그린다
      const armsBehind = P.arms.map((a, i) => (a.hy < torsoY - T && !P.item) || (i === 1 && P.frontArmBehind > 0.5));
      P.arms.forEach((a, i) => armsBehind[i] && drawArm(a, i));

      if (!P.legsFront) P.legs.forEach(drawLeg);
      ball(ctx, 0, bodyY, R, col.legs);
      contactShadow(ctx, 0, bodyY, R, tx, torsoY + T * 0.7, T * 1.5, 0.28);
      if (P.legsFront && P.legsOnTop < 0.5) P.legs.forEach(drawLeg);

      ball(ctx, tx, torsoY, T, col.body);
      contactShadow(ctx, tx, torsoY, T, hx, headY + H * 0.75, H * 1.1, 0.3);

      // 머리: 코 → 머리 공 → 눈
      ctx.save();
      ctx.translate(hx, headY);
      ctx.rotate(P.headTilt);
      // 영상처럼 굵고 끝이 둥근 코. 고개를 앞으로 돌리면(face) 코가 얼굴 안쪽으로 들어오고
      // 짧아 보이며, 머리 앞에 그려진다.
      const f = P.face || 0;
      const nose = () =>
        blob(ctx, H * (0.98 - 0.5 * f), H * (0.1 + 0.2 * f), H * 0.6 * (1 - 0.3 * f), H * 0.4, -0.08 + 0.2 * f, tone(col.head, -0.05));
      if (f <= 0.3) nose();
      ball(ctx, 0, 0, H, col.head);
      this.drawEye(ctx, P, col.head);
      if (f > 0.3) nose();
      ctx.restore();

      if (P.item && this.item) Items.drawHeld(ctx, this.item.type, P.item.x, P.item.y, P.item.a);
      P.arms.forEach((a, i) => !armsBehind[i] && drawArm(a, i));
      if (P.legsFront && P.legsOnTop >= 0.5) P.legs.forEach(drawLeg);

      this.drawEffects(ctx, P, hx, headY);
      ctx.restore();
    }

    drawEye(ctx, P, headHex) {
      const H = DIM.headR;
      const ex = H * (0.28 - 0.34 * (P.face || 0));
      const ey = -H * 0.14;
      const er = H * 0.42;
      if (this.blink > 0 || P.lid > 0.9) {
        // 감은 눈
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ex - er * 0.75, ey + 1);
        ctx.quadraticCurveTo(ex, ey + er * 0.45, ex + er * 0.75, ey + 1);
        ctx.stroke();
        return;
      }
      ctx.fillStyle = '#fbfbf6';
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, Math.PI * 2);
      ctx.fill();
      let lx = this.look.x * er * 0.35 + er * 0.08;
      let ly = this.look.y * er * 0.3;
      if (P.eyeSpin > 0.5) {
        lx = Math.cos(this.t * 9) * er * 0.4;
        ly = Math.sin(this.t * 9) * er * 0.4;
      }
      ctx.fillStyle = '#141414';
      ctx.beginPath();
      ctx.arc(ex + lx, ey + ly, er * 0.5, 0, Math.PI * 2);
      ctx.fill();
      if (P.lid > 0.05) {
        // 처진 눈꺼풀
        ctx.save();
        ctx.beginPath();
        ctx.arc(ex, ey, er + 0.5, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = tone(headHex, -0.04);
        ctx.fillRect(ex - er - 1, ey - er - 1, er * 2 + 2, (er * 2 + 2) * P.lid);
        ctx.restore();
      }
    }

    drawEffects(ctx, P, hx, headY) {
      const H = DIM.headR;
      if (P.fx === 'stars') {
        // 머리 위를 도는 별
        const cy = headY - H - 7;
        for (let i = 0; i < 3; i++) {
          const a = this.t * 4 + (i * Math.PI * 2) / 3;
          const depth = (Math.sin(a) + 1) / 2;
          star(ctx, hx + Math.cos(a) * 17, cy + Math.sin(a) * 4.5, 3.2 + depth * 1.8, 0.6 + depth * 0.4);
        }
      } else if ((P.fx === 'shout' || P.fx === 'radio') && P.item) {
        const x0 = P.fx === 'shout' ? P.item.x + 46 : P.item.x + 14;
        const y0 = P.fx === 'shout' ? P.item.y - 16 : P.item.y - 30;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          const k = (this.t * 1.6 + i / 3) % 1;
          ctx.globalAlpha = 1 - k;
          ctx.beginPath();
          ctx.arc(x0, y0, 4 + k * 12, -0.7, 0.7);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else if (P.fx === 'notes' && P.item) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        for (let i = 0; i < 2; i++) {
          const k = (this.t * 0.7 + i / 2) % 1;
          ctx.globalAlpha = 1 - k;
          ctx.fillText(i ? '♫' : '♪', 8 + Math.sin(k * 6 + i) * 6, P.item.y - 38 - k * 22);
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  root.Character = Character;
  root.CharacterDims = DIM;
})(window);
