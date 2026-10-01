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

  // 팔다리는 원기둥: 공(ball)과 같은 왼쪽 위 빛을 받아, 단면을 가로질러 어두운 가장자리 →
  // 밝은 쪽으로 부드럽게 바뀐다. 같은 곡선을 점점 가늘고 밝게, 빛 쪽으로 조금씩 옮겨 겹쳐 그린다.
  // (전체 경로를 한 방향으로 옮기면 곡선 어디서든 법선 방향 성분만큼 밝은 부분이 빛 쪽으로 간다.)
  // 끝은 둥근 마개라서 반구처럼 보인다. c2 를 주면 3차 곡선(두 조절점), 아니면 2차 곡선.
  const TUBE = [
    // [굵기 비율, 밝기] — ball() 의 반지름별 밝기와 같은 단계
    [1, -0.24],
    [0.84, -0.14],
    [0.66, -0.05],
    [0.48, 0],
    [0.3, 0.07],
  ];
  const LIGHT = { x: -0.55, y: -0.83 };
  function noodle(ctx, a, c, b, w, hex, c2) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [f, k] of TUBE) {
      const o = (1 - f) * w * 0.24; // 가늘수록 빛 쪽으로 (항상 바깥 층 안에 머문다)
      const dx = LIGHT.x * o;
      const dy = LIGHT.y * o;
      ctx.beginPath();
      ctx.moveTo(a.x + dx, a.y + dy);
      if (c2) ctx.bezierCurveTo(c.x + dx, c.y + dy, c2.x + dx, c2.y + dy, b.x + dx, b.y + dy);
      else ctx.quadraticCurveTo(c.x + dx, c.y + dy, b.x + dx, b.y + dy);
      ctx.strokeStyle = k ? tone(hex, k) : hex;
      ctx.lineWidth = w * f;
      ctx.stroke();
    }
  }

  // 발은 납작한 타원체: 공과 같은 방식으로 칠한다
  function foot(ctx, x, y, angle, hex) {
    blob(ctx, x + Math.cos(angle) * 4, y + Math.sin(angle) * 4, 8.5, 4.6, angle, hex);
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

  // 앉았을 때의 다리 (사용자 그림 기준, 오른쪽을 볼 때. 왼쪽을 볼 땐 좌우 대칭):
  // 큰 공은 바닥에 앉아 있고 두 다리가 공 아래쪽 앞을 가로질러 엇갈린다.
  //  - 앞쪽 다리(side 1): 공 오른쪽 아래에서 나와 무릎이 오른쪽으로 툭 튀어나왔다가,
  //    정강이가 접혀 공 앞을 가로질러 왼쪽 아래 바닥에 발을 댄다.
  //  - 뒤쪽 다리(side -1): 공 왼쪽 아래에서 나와 공 앞을 가로질러 오른쪽 바닥에 발을 댄다.
  function crossLeg(side, bodyY) {
    const R = DIM.bodyR;
    if (side > 0) {
      return {
        hip: { x: R * 0.5, y: bodyY + R * 0.35 },
        c1: { x: R * 2.6, y: bodyY - R * 0.1 }, // 무릎이 공 오른쪽 바깥으로 툭 튀어나온다
        c2: { x: R * 2.0, y: bodyY + R * 0.85 }, // 정강이가 접혀 공 앞을 가로지른다
        ankle: { x: -R * 0.75, y: -4.6 },
      };
    }
    return {
      hip: { x: -R * 0.75, y: bodyY + R * 0.3 },
      c1: { x: -R * 0.4, y: bodyY + R * 0.8 },
      c2: { x: R * 0.5, y: bodyY + R * 0.75 },
      ankle: { x: R * 1.3, y: -4.6 },
    };
  }

  // 엉덩방아 / 헤롱헤롱 때의 다리 (사용자 그림 기준): 두 다리 모두 공의 앞쪽(바라보는 쪽)에서
  // 나와 위로 아치를 그렸다가 바닥으로 거의 수직으로 떨어진다.
  // 실제로 공에 같은 길이의 줄 두 개를 붙여 구부린 것처럼, 두 다리는 **똑같은 곡선**을
  // 옆으로만 옮겨 놓은 것이다(그래서 길이가 같다). 바깥 다리는 공 앞 표면에서,
  // 안쪽 다리는 그보다 공 안쪽에서 나와 공 앞쪽 아래로 떨어진다.
  function tidyLeg(side, bodyY) {
    const R = DIM.bodyR;
    const dropY = -4.6; // 발은 바닥
    if (side > 0) {
      // 바깥(앞) 다리: 안쪽 다리와 길이가 같도록 아치를 낮추고 발을 몸 쪽으로 당긴다
      return {
        hip: { x: R * 0.75, y: bodyY - R * 0.4 },
        c1: { x: R * 0.98, y: bodyY - R * 0.88 },
        c2: { x: R * 1.46, y: bodyY - R * 0.73 },
        ankle: { x: R * 1.46, y: dropY },
      };
    }
    return {
      hip: { x: -R * 0.3, y: bodyY - R * 0.25 },
      c1: { x: -R * 0.1, y: bodyY - R * 0.85 },
      c2: { x: R * 0.35, y: bodyY - R * 0.75 },
      ankle: { x: R * 0.35, y: dropY },
    };
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
    cheer: [0.8, 0.8],
    look: [1, 2],
    use: [1.8, 3.2],
    bump: [0.55, 0.55],
    dizzy: [2.4, 3.4],
    sleep: [7, 14], // 선 채로 꾸벅꾸벅
    sitsleep: [8, 18], // 앉은 채로 꾸벅꾸벅
    seek: [15, 15],
    goto: [30, 30], // 지시받은 자리로 걸어가기 (도착하면 끝난다)
    marvel: [1.6, 3], // 오뚜기를 보며 신기해하는 몸짓 하나
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
      this.squash = 0;
      this.look = { x: 0, y: 0 };
      this.greetCooldown = rand(3, 8);
      this.item = null;
      this.target = null;
      this.itemCooldown = 0;
      this.lastPose = null;
      this.flares = []; // 쏘아 올린 신호탄과 불꽃 (화면 좌표)
      this.setState(opts.state || 'idle');
    }

    get scale() {
      return this.globalSize || 1;
    }

    get height() {
      return HEIGHT * this.scale;
    }

    setState(state, duration, blend = 0.22) {
      const isSit = (s) => s === 'sit' || s === 'sitsleep';
      // 서 있다가 앉을 때는 철푸덕: 떨어지듯 빨라지며 주저앉고, 닿는 순간 찌그러진다
      this.plop = isSit(state) && !isSit(this.state) && this.state !== undefined;
      if (this.plop) blend = 0.26;
      this.state = state;
      this.stateT = 0;
      if (state === 'marvel') {
        const g = ['point', 'handsup', 'scratch', 'clap', 'wave', 'point', 'clap'];
        let next = g[Math.floor(Math.random() * g.length)];
        if (next === this.gesture) next = g[(g.indexOf(next) + 1) % g.length];
        this.gesture = next;
      }
      const d = DURATIONS[state] || [1, 1];
      this.stateDur = duration ?? rand(d[0], d[1]);
      this.fromPose = this.lastPose;
      this.blendT = 0;
      this.blendDur = blend;
      if (state !== 'seek' && state !== 'pickup') this.target = null;
    }

    // --- 사용자 조작 ------------------------------------------------------------
    // 바깥(오뚜기 이벤트)에서 주는 지시: { x, face } 자리로 가서 신기해하기,
    // { fire: true, item } 신호탄 쏘기(필요하면 신호탄 주워 오기). null 이면 해제.
    setDirective(d) {
      this.directive = d;
      const interruptible = ['idle', 'walk', 'sit', 'sitsleep', 'sleep', 'look', 'wave', 'marvel', 'goto', 'seek', 'cheer'];
      if (interruptible.includes(this.state) && this.h <= 0) this.stateT = this.stateDur;
    }

    // 오뚜기를 클릭하면 다 같이 폴짝 뛰며 손을 들었다 내렸다 한다
    // 연타해도 정신없지 않게: 한 번 "야호!" 하고 나면 잠깐은 다시 뛰지 않고, 매번 다 같이 뛰지도 않는다.
    celebrate() {
      if (['drag', 'air', 'bump', 'dizzy', 'pickup', 'drop'].includes(this.state) || this.h > 0.5) return;
      if (this.t < (this.cheerReadyAt || 0) || Math.random() < 0.35) return;
      this.cheerReadyAt = this.t + rand(1.8, 2.6);
      this.vy = rand(210, 260); // 낮고 가볍게 폴짝
      this.vx = 0;
      this.setState('air', 99, 0.1);
      this.afterLand = 'cheer';
    }

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
      const d = this.directive;
      if (d) {
        if (d.fire && !d.fired) {
          if (this.item?.type === 'flare') return 'use';
          if (this.item) return 'drop'; // 다른 걸 들고 있으면 내려놓고 신호탄을 가지러 간다
          const it = d.item;
          if (it && !it.heldBy && it.h <= 0 && world.items?.includes(it)) {
            this.target = it;
            return 'seek';
          }
        }
        if (d.x != null) {
          if (Math.abs(this.x - d.x) > 4) return 'goto';
          this.dir = d.face;
          return 'marvel';
        }
      }
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
      if (this.state === 'sit') return q < 0.4 ? 'sitsleep' : 'idle';
      if (q < 0.6) return 'walk';
      if (q < 0.74) return 'sit';
      if (q < 0.8) return 'sleep';
      if (q < 0.9) return 'look';
      return 'wave';
    }

    onStateEnd(world) {
      switch (this.state) {
        case 'bump':
          return this.setState('dizzy', undefined, 0.3);
        case 'dizzy':
          return this.setState('idle', undefined, 0.8); // 천천히 일어난다
        case 'sleep':
          return this.setState('idle', undefined, 0.7); // 부스스 깬다
        case 'sitsleep':
          return this.setState('sit', undefined, 0.7); // 앉은 채로 깬다
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
      this.updateFlares(dt);
      this.stateT += dt;
      this.blendT += dt;
      const speed = world.speed || 1;

      if (this.plop && this.blendT >= this.blendDur) {
        this.plop = false;
        this.squash = 0.85; // 철푸덕!
      }
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

      if (world.paused && ['walk', 'sit', 'seek', 'goto'].includes(this.state)) this.setState('idle');

      // 지시받은 자리로 걸어가는 중
      if (this.state === 'goto') {
        const d = this.directive;
        if (!d || d.x == null) {
          this.setState('idle');
        } else {
          const tx = clamp(d.x, minX, maxX);
          const dx = tx - this.x;
          if (Math.abs(dx) < 3) {
            this.x = tx;
            this.dir = d.face;
            this.setState('marvel');
          } else {
            this.dir = Math.sign(dx);
            this.x += this.dir * Math.min(Math.abs(dx), WALK_SPEED * s * speed * 1.3 * dt);
            this.phase += dt * 9.4 * Math.sqrt(speed);
          }
        }
      }

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
            this.phase += dt * 9.4 * Math.sqrt(speed); // 약 3걸음/초
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

      // 신호탄: 총을 머리 위로 치켜든 뒤 한 번 쏜다
      if (this.state === 'use' && this.item?.type === 'flare' && !this.fired && this.stateT > 0.7) {
        this.fired = true;
        this.fireFlare(world);
        if (this.directive?.fire) this.directive.fired = true;
      }
      if (this.state !== 'use') this.fired = false;

      if (this.stateT >= this.stateDur) this.onStateEnd(world);

      if (this.state === 'walk') {
        const v = WALK_SPEED * s * speed;
        this.x += this.dir * v * dt;
        this.phase += dt * 9.4 * Math.sqrt(speed); // 약 3걸음/초
        if (this.x <= minX) {
          this.x = minX;
          this.dir = 1;
        } else if (this.x >= maxX) {
          this.x = maxX;
          this.dir = -1;
        }
        if (world.others && this.greetCooldown <= 0) this.tryGreet(world.others);
      } else if (this.state !== 'seek' && this.state !== 'goto') {
        this.x = clamp(this.x, minX, maxX);
        // 멈추면 다리를 모은다 (걸어가는 중인 seek/goto 는 제외: 안 그러면 다리가 멈춘 채 미끄러진다)
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
      const walking = st === 'walk' || st === 'seek' || st === 'goto';
      const onButt = st === 'bump' || st === 'dizzy';
      const sleeping = st === 'sleep' || st === 'sitsleep';
      const sitting = st === 'sit' || st === 'sitsleep';
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
        spiral: 0, // 헤롱헤롱: 소용돌이 눈
        sleep: 0, // 잠든 눈
        frontArmBehind: 0,
        backArmBehind: 0,
        holding: 0, // 두 손으로 물건을 앞에 들고 있다
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
        // 영상 분석: 한 발 디딜 때마다 몸 전체가 통 하고 떠오르는, 가볍게 종종 뛰는 걸음
        bob = -Math.abs(Math.sin(ph)) * 4.5;
        P.tilt = Math.sin(ph) * 0.045 + 0.03;
        // 머리와 목이 반 박자 늦게 따라오는 출렁임
        P.torsoX = -Math.sin(ph - 0.6) * 1.2;
        P.headX = -Math.sin(ph - 1.1) * 2;
        P.headDY = Math.abs(Math.sin(ph - 0.6)) * 1.5;
        P.headTilt = -Math.sin(ph - 0.9) * 0.06;
      } else if (st === 'cheer') {
        bob = -Math.max(0, Math.sin((this.stateT / this.stateDur) * Math.PI)) * 2;
      } else if (st === 'marvel') {
        bob = -Math.abs(Math.sin(t * 3)) * 0.8; // 살짝 들썩
        P.headTilt = this.gesture === 'scratch' ? 0.18 : Math.sin(t * 1.3) * 0.12;
      } else if (sleeping) {
        bob = Math.sin(t * 1.4) * 1.2; // 느리고 깊은 숨
      } else if (!dangling && !airborne && !onButt) {
        bob = Math.sin(t * 2.2) * 0.8; // 숨쉬기
      }

      if (sitting) {
        P.bodyY = -R * 0.98; // 큰 공이 바닥에 철푸덕
        P.face = 0.55;
        P.legsOnTop = 1; // 엇갈린 다리가 팔보다 앞에 보인다
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
        P.spiral = 1;
        P.fx = 'stars';
      }
      // 잠: 참고 사진처럼 고개가 앞으로 푹 숙여져 코가 아래를 향하고, 숨 쉴 때마다 꾸벅인다
      if (sleeping) {
        const nod = Math.sin(t * 1.4);
        P.sleep = 1;
        P.headX = 7;
        P.headDY = 7 + nod * 1.2;
        P.headTilt = 0.6 + nod * 0.05;
        P.torsoX = 1.5;
        if (st === 'sleep') {
          P.tilt = 0.05;
          P.bodyY += 5; // 무릎이 풀려 살짝 굽는다
        } else {
          P.face = 0.3;
        }
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
          // 아빠다리: 무릎은 양옆, 정강이는 공 앞에서 엇갈린다
          const leg = crossLeg(side, bodyY);
          hip.x = leg.hip.x;
          hip.y = leg.hip.y;
          ankle = leg.ankle;
          cubic = [leg.c1, leg.c2];
          fa = side > 0 ? Math.PI : 0; // 발끝은 발이 놓인 바깥쪽을 향한다
          P.legsFront = true;
        } else if (onButt) {
          // 엉덩방아 / 헤롱헤롱: 두 다리를 가지런히 앞으로: 큰 공을 바닥에 대고 두 다리를 가지런히 앞으로 모은다.
          // 무릎은 살짝만 굽히고 두 발은 나란히 앞바닥에 딛는다 (벌리지 않는다).
          const tidy = tidyLeg(side, bodyY);
          hip.x = tidy.hip.x;
          hip.y = tidy.hip.y;
          ankle = { ...tidy.ankle };
          let c2 = { ...tidy.c2 };
          fa = 0; // 발끝은 바라보는 쪽
          if (st === 'bump') {
            // 엉덩방아: 쿵 하는 순간 발이 앞으로 번쩍 들렸다가 아치 모양으로 내려온다
            const lift = (1 - bumpK) * R * 1.2;
            ankle = { x: ankle.x + (1 - bumpK) * R * 0.4, y: ankle.y - lift };
            c2 = { x: c2.x + (1 - bumpK) * R * 0.5, y: c2.y - lift * 0.4 };
            fa = -1.3 * (1 - bumpK);
          }
          cubic = [tidy.c1, c2];
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
          // 걷기 (영상 분석): 보폭은 짧고, 딛는 다리는 곧게 펴고,
          // 드는 다리는 무릎이 굽으면서 발이 뒤쪽으로 차올라간다.
          const p = ph + (side > 0 ? 0 : Math.PI);
          const stride = walking ? 3.5 : 0;
          const lift = walking ? Math.max(0, Math.sin(p)) * 10 : 0;
          ankle = { x: hip.x - Math.cos(p) * stride - lift * 0.65, y: -4.6 - lift };
          ctrl = { x: (hip.x + ankle.x) / 2 + 1 + lift * 0.75, y: (hip.y + ankle.y) / 2 + lift * 0.15 };
          fa = lift > 0 ? 0.65 * (lift / 10) : 0; // 차올린 발은 발끝이 아래로
          if (st === 'sleep') ctrl.x += side > 0 ? 7 : 5; // 선 채로 졸 때 무릎이 앞으로 굽는다
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
        // 팔은 목 공의 정반대 두 점(좌우 끝, 가운데 높이)에 붙어 있다
        const sh = { x: side * T * 0.92, y: torsoY };
        let hand;
        let ctrl;
        let cub = null; // 팔꿈치가 또렷하게 꺾이는 팔은 조절점 두 개로
        if (dangling) {
          hand = { x: side * (T + 8) + Math.sin(t * 6 + side) * 3, y: headY - H - 10 };
          ctrl = { x: side * (T + 16), y: torsoY - 4 };
        } else if (st === 'cheer') {
          // 착지한 뒤 번쩍 든 두 손을 천천히 내린다 ("야호!" 한 번)
          const up = 1 - ease(clamp(this.stateT / this.stateDur, 0, 1));
          hand = { x: side * R * (0.95 + 0.15 * (1 - up)), y: torsoY + 2 - up * (torsoY + 2 - (headY - H - 6)) };
          ctrl = { x: side * R * 1.35, y: torsoY + 2 };
        } else if (cheering) {
          hand = { x: side * R * 0.95, y: headY - H - 4 };
          ctrl = { x: side * R * 1.35, y: torsoY + 2 };
        } else if (st === 'marvel') {
          // 오뚜기를 보며 이것저것 손짓한다
          const g = this.gesture;
          const w = Math.sin(this.stateT * 9);
          if (g === 'point' && side > 0) {
            hand = { x: R * 1.55, y: torsoY - 6 + w * 1.5 }; // 손가락질하듯 앞으로 쭉
            ctrl = { x: R * 1.15, y: torsoY + 2 };
          } else if (g === 'handsup') {
            hand = { x: side * R * 0.9, y: headY - H - 2 + Math.sin(this.stateT * 7 + side) * 4 };
            ctrl = { x: side * R * 1.35, y: torsoY + 2 };
          } else if (g === 'scratch' && side > 0) {
            hand = { x: -H * 0.1 + w * 2, y: headY - H * 0.95 }; // 갸웃하며 머리를 긁적
            ctrl = { x: R * 0.9, y: headY - 2 };
          } else if (g === 'clap') {
            const open = Math.abs(Math.sin(this.stateT * 9));
            hand = { x: R * 1.05 + side * (1 + open * 6), y: torsoY + T * 0.6 };
            ctrl = { x: side * R * 0.9 + R * 0.4, y: torsoY + T * 1.4 };
          } else if (g === 'wave' && side > 0) {
            hand = { x: R * 0.95 + w * 6, y: headY - H - 8 + Math.abs(w) * 2 };
            ctrl = { x: R * 1.4, y: torsoY + 2 };
          } else {
            hand = { x: side * R * 1.28, y: bodyY - R * 0.38 + Math.sin(t * 4 + side) };
            ctrl = { x: side * R * 1.2, y: torsoY + 2 };
          }
        } else if (st === 'wave' && side === waveSide) {
          const w = Math.sin(this.stateT * 11);
          hand = { x: side * (R * 0.95 + w * 6), y: headY - H - 8 + Math.abs(w) * 2 };
          ctrl = { x: side * R * 1.4, y: torsoY + 2 };
        } else if (st === 'bump') {
          // 놀라서 팔이 번쩍
          hand = { x: side * (R + 10), y: torsoY - 16 * (1 - bumpK * 0.5) };
          ctrl = { x: side * (R + 8), y: torsoY + 2 };
        } else if (st === 'sleep') {
          // 선 채로 잘 때는 팔이 힘없이 축 늘어진다
          const sway = Math.sin(t * 1.4 + side) * 0.8;
          hand = { x: side * R * 0.95 + sway, y: bodyY + R * 0.2 };
          ctrl = { x: side * R * 1.2, y: torsoY + T * 1.2 };
        } else if (sitting) {
          // 두 팔을 몸 양옆으로 축 늘어뜨려 무릎 바깥 바닥에 손을 내려놓는다
          const sway = Math.sin(t * 1.6 + side) * 0.6;
          hand = { x: side * (R + 4) + sway, y: -handR - 1 };
          ctrl = { x: side * R * 1.35, y: torsoY + T * 0.8 };
        } else if (st === 'dizzy') {
          // 헤롱헤롱: 다리 쪽(앞쪽) 팔은 몸 뒤로 넘어가 공 바로 옆 바닥을 짚고,
          // 반대쪽 팔은 공 옆으로 느슨하게 늘어뜨린다.
          const loose = Math.sin(t * 5 + side) * 2;
          if (side > 0) {
            // 넘어진 사람이 몸 바로 옆을 짚듯, 공 가장자리 가까이에 손을 댄다
            hand = { x: R * 0.8 + loose * 0.3, y: -handR - 0.5 };
            ctrl = { x: R * 1.2, y: torsoY + T * 1.0 };
            P.frontArmBehind = 1; // 몸(공) 뒤에 그린다
          } else {
            hand = { x: -R * 0.95 + loose, y: -handR - 0.5 };
            ctrl = { x: -R * 1.1, y: torsoY + T * 1.4 };
          }
          P.legsOnTop = 1;
        } else if (crouch && side > 0) {
          // 바닥의 물건을 향해 손을 뻗는다
          hand = unrotate(R * 0.95 + 2, -7, P.tilt);
          ctrl = { x: R * 1.25, y: torsoY + T * 1.5 };
        } else if (airborne) {
          hand = { x: side * (R + 12), y: torsoY - 4 };
          ctrl = { x: side * (R + 6), y: torsoY + 10 };
        } else if (walking) {
          // 걸을 때 팔 (영상 분석): 목 공 옆에서 거의 수평으로 바깥으로 뻗었다가
          // 팔꿈치에서 아래로 꺾여, 손이 큰 공 윗부분(허리) 바깥 옆에 떠 있다.
          // 앞뒤로 흔들지 않고, 같은 쪽 발을 들 때 그 팔이 살짝 들썩인다.
          const lift = Math.max(0, Math.sin(ph + (side > 0 ? 0 : Math.PI)));
          hand = { x: side * R * 1.28, y: bodyY - R * 0.38 - lift * 2.5 };
          cub = [
            { x: side * R * 1.2, y: sh.y + 2 - lift * 1.5 },
            { x: side * R * 1.45, y: hand.y - 11 },
          ];
        } else {
          const p = ph + (side > 0 ? Math.PI : 0);
          const swing = walking ? Math.cos(p) * -6 : 0;
          const breathe = Math.sin(t * 1.8 + side) * 0.8;
          hand = { x: side * R * 1.08 + swing, y: bodyY - R * 0.35 + breathe - (walking ? Math.abs(Math.cos(p)) * 2.5 : 0) };
          ctrl = { x: side * R * 1.15 + swing * 0.4, y: torsoY + T * 0.7 };
        }
        if (cub) ctrl = cub[0];
        P.arms.push({ sx: sh.x, sy: sh.y, cx: ctrl.x, cy: ctrl.y, hx: hand.x, hy: hand.y, cub });
      }

      // --- 들고 있는 물건: 레퍼런스처럼 모든 물건을 두 손으로 든다 ---
      if (it && !dangling) {
        const front = P.arms[1];
        const back = P.arms[0];
        const using = st === 'use';
        if (crouch) {
          // 줍거나 내려놓는 순간에는 뻗은 손끝에 물건이 붙어 있다
          const a = it === 'megaphone' || it === 'flare' ? 0.3 : 0.05;
          P.item = { x: front.hx, y: front.hy, a };
        } else {
          // 기본: 레퍼런스처럼 팔을 앞으로 뻗어 가슴 높이에서 두 손으로 양옆을 잡는다.
          // 물건 폭에 맞춰 앞으로 내밀어 몸에 파묻히지 않게 한다.
          const halfW = Items.halfWidth(it);
          let cx = R * 0.8 + halfW * 0.8 + 4;
          let cy = torsoY + T * 1.35;
          let a = 0;
          let overhead = false;
          if (using) {
            if (it === 'walkie') {
              // 입 앞에 대고 말한다
              cx = H * 1.4;
              cy = headY + H * 1.05;
              a = -0.12;
              P.fx = 'radio';
            } else if (it === 'radio') {
              // 귀 옆까지 들어 올려 음악을 틀고 박자에 맞춰 흔든다
              cx = H * 1.55;
              cy = headY + H * 0.45;
              a = -0.1 + Math.sin(t * 6) * 0.06;
              P.fx = 'notes';
            } else if (it === 'megaphone') {
              // 입에 대고 앞으로 외친다
              cx = H * 1.75 + 10;
              cy = headY + H * 0.7;
              a = -0.08;
              P.fx = 'shout';
            } else if (it === 'flare') {
              // 두 손으로 머리 위로 곧게 치켜들고 쏜다 (쏘는 순간 반동으로 튄다)
              const kick = this.fired ? Math.max(0, 1 - (this.stateT - 0.7) * 5) * 4 : 0;
              const raise = Math.min(1, this.stateT / 0.35);
              cx = R * 0.55;
              cy = headY - H - 14 - raise * 6 + kick;
              a = -Math.PI / 2 + 0.12 - kick * 0.03;
              overhead = true;
            }
          }
          const h = Items.hold(it, cx, cy, a);
          if (!overhead) {
            // 어깨가 목 공 밖으로 삐져나오지 않도록 팔을 목 공 안쪽에서 시작시키고,
            // 그릴 때 목 공과 겹치는 부분은 가린다 (P.holding)
            back.sx = -T * 0.35;
            back.sy = torsoY + T * 0.25;
            front.sx = T * 0.35;
            front.sy = torsoY + T * 0.25;
            P.holding = 1;
          }
          Object.assign(back, {
            cub: null,
            hx: h.hands[0].x,
            hy: h.hands[0].y,
            cx: overhead ? R * 0.1 : R * 0.35,
            cy: overhead ? torsoY - 6 : torsoY + T * 1.9,
          });
          Object.assign(front, {
            cub: null,
            hx: h.hands[1].x,
            hy: h.hands[1].y,
            cx: overhead ? R * 1.2 : R * 1.15,
            cy: overhead ? torsoY - 4 : torsoY + T * 1.1,
          });
          P.item = h.item;
          if (overhead) P.backArmBehind = 1; // 머리 위로 든 팔이 얼굴을 가리지 않게
        }
      }
      // 모든 팔을 3차 곡선으로 통일한다 (자세 사이를 부드럽게 섞기 위해)
      P.arms = P.arms.map((a) => {
        const q = { x: a.cx, y: a.cy };
        const c1 = a.cub ? a.cub[0] : { x: a.sx + ((q.x - a.sx) * 2) / 3, y: a.sy + ((q.y - a.sy) * 2) / 3 };
        const c2 = a.cub ? a.cub[1] : { x: a.hx + ((q.x - a.hx) * 2) / 3, y: a.hy + ((q.y - a.hy) * 2) / 3 };
        return { sx: a.sx, sy: a.sy, cx: c1.x, cy: c1.y, c2x: c2.x, c2y: c2.y, hx: a.hx, hy: a.hy };
      });
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
        const k = this.blendT / this.blendDur;
        P = lerpPose(this.fromPose, P, this.plop ? k * k : ease(k));
      }
      this.lastPose = P;

      // 발밑 그림자: 실제로 바닥에 닿은 부분(두 발, 앉았을 때는 큰 공)만 감싸는
      // 얇고 흐린 그림자. 뜨면 빠르게 옅어져 공중에 그림자가 떠 보이지 않는다.
      if (this.showShadow !== false) {
        let lo = Infinity;
        let hi = -Infinity;
        for (const l of P.legs) {
          lo = Math.min(lo, l.ax - 2);
          hi = Math.max(hi, l.ax + 11);
        }
        if (P.bodyY > -R * 1.2) {
          // 큰 공이 바닥에 닿아 있다
          lo = Math.min(lo, -R * 0.75);
          hi = Math.max(hi, R * 0.75);
        }
        const fade = Math.max(0, 1 - this.h / (70 * s));
        const cx = this.x + ((lo + hi) / 2) * this.dir * s;
        const halfW = ((hi - lo) / 2 + 5) * s * (1 - 0.3 * (1 - fade));
        Items.softShadow(ctx, cx, groundY - 1, halfW, 0.24 * fade);
      }

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
        // 공 앞을 지나는 다리의 그림자 (빛은 왼쪽 위, 그림자는 공 안에만 진다).
        // 다리 뿌리는 공 표면에 딱 붙은 원기둥이라, 그림자는 붙은 자리에서 틈 없이 시작해
        // 끝 둘레를 초승달처럼 감싸고, 다리가 공에서 떠오를수록 점점 벌어지며 옅고 흐려진다.
        const c2 = { x: l.c2x, y: l.c2y };
        if (P.legsFront) {
          const pt = (k) => {
            const u = 1 - k;
            return {
              x: u * u * u * l.hx + 3 * u * u * k * l.cx + 3 * u * k * k * c2.x + k * k * k * l.ax,
              y: u * u * u * l.hy + 3 * u * u * k * l.cy + 3 * u * k * k * c2.y + k * k * k * l.ay,
            };
          };
          ctx.save();
          ctx.beginPath();
          ctx.arc(0, bodyY, R, 0, Math.PI * 2);
          ctx.clip();
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          // 1) 붙은 자리: 원기둥 끝 테두리에 바짝 붙어 바깥으로 금방 사라지는 부드러운 그늘
          //    (모양을 옮긴 복사본이 아니라 접촉면 둘레가 오목하게 어두워지는 것. 빛 반대쪽이 조금 더 넓다)
          const capR = legW * 0.5;
          const ax0 = l.hx + 0.35;
          const ay0 = l.hy + 0.5;
          const ao = ctx.createRadialGradient(ax0, ay0, capR * 0.85, ax0, ay0, capR + 2.6);
          ao.addColorStop(0, 'rgba(0,0,0,0.26)');
          ao.addColorStop(0.35, 'rgba(0,0,0,0.12)');
          ao.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.filter = 'none';
          ctx.fillStyle = ao;
          ctx.beginPath();
          ctx.arc(ax0, ay0, capR + 2.6, 0, Math.PI * 2);
          ctx.fill();
          // 2) 뿌리에서 무릎 전까지만: 붙은 자리에서 틈 없이 시작해 조금씩 벌어지며 사라진다
          const kEnd = 0.38;
          const end = pt(kEnd);
          const fade = ctx.createRadialGradient(l.hx, l.hy, 0, l.hx, l.hy, Math.hypot(end.x - l.hx, end.y - l.hy));
          fade.addColorStop(0, 'rgba(0,0,0,0.3)');
          fade.addColorStop(0.6, 'rgba(0,0,0,0.16)');
          fade.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.filter = 'blur(1.1px)';
          ctx.strokeStyle = fade;
          ctx.lineWidth = legW;
          ctx.beginPath();
          for (let i = 0; i <= 12; i++) {
            const k = (i / 12) * kEnd;
            const lift = k / kEnd;
            const q = pt(k);
            const x = q.x + 1.2 * lift;
            const y = q.y + 1.6 * lift;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          // 3) 무릎을 지나 공 앞으로 내려오는 정강이: 공에서 떠 있으니 조금 떨어진 옅은 그림자
          //    (무릎 쪽에서는 서서히 나타난다)
          const s0 = pt(0.6);
          const s1 = pt(0.78);
          const appear = ctx.createLinearGradient(s0.x, s0.y, s1.x, s1.y);
          appear.addColorStop(0, 'rgba(0,0,0,0)');
          appear.addColorStop(1, 'rgba(0,0,0,0.2)');
          ctx.filter = 'blur(1.5px)';
          ctx.strokeStyle = appear;
          ctx.lineWidth = legW * 1.1;
          ctx.beginPath();
          for (let i = 0; i <= 12; i++) {
            const q = pt(0.6 + (i / 12) * 0.4);
            if (i === 0) ctx.moveTo(q.x + 1.8, q.y + 2.4);
            else ctx.lineTo(q.x + 1.8, q.y + 2.4);
          }
          ctx.stroke();
          ctx.restore();
        }
        noodle(ctx, { x: l.hx, y: l.hy }, { x: l.cx, y: l.cy }, { x: l.ax, y: l.ay }, legW, hex, c2);
        foot(ctx, l.ax, l.ay, l.fa, hex);
      };
      const drawArm = (a, i) => {
        const hex = i === 0 ? tone(col.body, -0.08) : col.body;
        noodle(ctx, { x: a.sx + tx, y: a.sy }, { x: a.cx + tx * 0.5, y: a.cy }, { x: a.hx, y: a.hy }, limbW, hex, { x: a.c2x, y: a.c2y });
        ball(ctx, a.hx, a.hy, handR, hex);
      };

      // 머리 뒤로 올라간 팔은 먼저 그린다
      const armsBehind = P.arms.map(
        (a, i) =>
          (a.hy < torsoY - T && !P.item) || (i === 1 && P.frontArmBehind > 0.5) || (i === 0 && P.backArmBehind > 0.5),
      );
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
      // 얼굴 구조: 코는 머리 옆면에서 가는 방향으로 길게 튀어나오고, 코 뿌리는
      // 머리 윤곽 앞에 겹쳐 보인다. 눈은 코의 반대쪽 볼에 붙어 있다.
      // 앉아서 보는 사람 쪽으로 고개를 돌리면(face) 코와 눈이 가운데로 조금 모인다.
      const f = P.face || 0;
      ball(ctx, 0, 0, H, col.head);
      this.drawEye(ctx, P, col.head);
      blob(ctx, H * (1.02 - 0.4 * f), -H * 0.06, H * 0.62 * (1 - 0.3 * f), H * 0.4, -0.05, tone(col.head, -0.04));
      ctx.restore();

      if (P.holding > 0.5 && P.item && this.item) {
        // 두 손으로 들 때: 물건의 먼 쪽을 잡는 팔(앞쪽 팔)은 물건 뒤로, 가까운 쪽 팔은 물건 앞으로.
        // 두 팔 모두 목 공과 겹치는 부분은 가려서 목 공 가장자리에서 자연스럽게 나오게 한다.
        const outsideTorso = (fn) => {
          ctx.save();
          ctx.beginPath();
          ctx.rect(-1000, -1000, 2000, 2000);
          ctx.arc(tx, torsoY, T - 0.5, 0, Math.PI * 2);
          ctx.clip('evenodd');
          fn();
          ctx.restore();
        };
        outsideTorso(() => drawArm(P.arms[1], 1));
        Items.drawHeld(ctx, this.item.type, P.item.x, P.item.y, P.item.a);
        outsideTorso(() => drawArm(P.arms[0], 0));
      } else {
        if (P.item && this.item) Items.drawHeld(ctx, this.item.type, P.item.x, P.item.y, P.item.a);
        P.arms.forEach((a, i) => !armsBehind[i] && drawArm(a, i));
      }
      if (P.legsFront && P.legsOnTop >= 0.5) P.legs.forEach(drawLeg);

      this.drawEffects(ctx, P, hx, headY);
      ctx.restore();
      this.drawFlares(ctx, groundY);
    }

    // --- 신호탄 -------------------------------------------------------------------
    fireFlare(world) {
      const s = this.scale;
      const x = this.x + this.dir * DIM.bodyR * 0.6 * s;
      const h = this.h + this.height + 6 * s;
      // 창 위쪽 가까이에서 터지도록 속도를 맞춘다
      const top = Math.max(h + 40, (world.height || 320) - 26);
      const g = 420;
      this.flares.push({ kind: 'shot', x, h, vx: this.dir * 18, vy: Math.sqrt(2 * g * (top - h)), g, t: 0, trail: [] });
    }

    updateFlares(dt) {
      if (!this.flares.length) return;
      const next = [];
      for (const f of this.flares) {
        f.t += dt;
        if (f.kind === 'shot') {
          f.trail.push({ x: f.x, h: f.h });
          if (f.trail.length > 14) f.trail.shift();
          f.vy -= f.g * dt;
          f.x += f.vx * dt;
          f.h += f.vy * dt;
          if (f.vy <= 30) {
            // 꼭대기에서 펑! 불꽃이 사방으로 퍼진다
            for (let i = 0; i < 22; i++) {
              const a = (i / 22) * Math.PI * 2 + Math.random() * 0.3;
              const v = 80 + Math.random() * 70;
              next.push({ kind: 'spark', x: f.x, h: f.h, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.9 + Math.random() * 0.5 });
            }
            next.push({ kind: 'flash', x: f.x, h: f.h, t: 0, life: 0.35 });
            continue;
          }
        } else {
          if (f.kind === 'spark') {
            f.vy -= 120 * dt;
            f.vx *= Math.exp(-1.5 * dt);
            f.x += f.vx * dt;
            f.h += f.vy * dt;
          }
          if (f.t > f.life) continue;
        }
        next.push(f);
      }
      this.flares = next;
    }

    drawFlares(ctx, groundY) {
      for (const f of this.flares) {
        const y = groundY - f.h;
        if (f.kind === 'shot') {
          // 연기 꼬리 + 빛나는 빨간 불덩이
          f.trail.forEach((p, i) => {
            const k = i / f.trail.length;
            ctx.fillStyle = `rgba(240,235,225,${0.35 * k})`;
            ctx.beginPath();
            ctx.arc(p.x, groundY - p.h, 1.5 + k * 2.5, 0, Math.PI * 2);
            ctx.fill();
          });
          const g = ctx.createRadialGradient(f.x, y, 0, f.x, y, 13);
          g.addColorStop(0, 'rgba(255,248,220,1)');
          g.addColorStop(0.3, 'rgba(255,110,60,.95)');
          g.addColorStop(1, 'rgba(255,60,40,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(f.x, y, 13, 0, Math.PI * 2);
          ctx.fill();
        } else if (f.kind === 'spark') {
          const a = Math.max(0, 1 - f.t / f.life);
          ctx.fillStyle = `rgba(255,${150 + Math.round(90 * a)},70,${a})`;
          ctx.beginPath();
          ctx.arc(f.x, y, 1.6 + a * 2.2, 0, Math.PI * 2);
          ctx.fill();
        } else if (f.kind === 'flash') {
          const a = Math.max(0, 1 - f.t / f.life);
          const g = ctx.createRadialGradient(f.x, y, 0, f.x, y, 34);
          g.addColorStop(0, `rgba(255,240,200,${0.9 * a})`);
          g.addColorStop(1, 'rgba(255,120,60,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(f.x, y, 34, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    drawEye(ctx, P, headHex) {
      const H = DIM.headR;
      const ex = -H * 0.5 * (1 - 0.5 * (P.face || 0));
      const ey = -H * 0.05;
      // 레퍼런스에서 잰 비율: 흰자 세로 반지름 ≈ 머리 반지름의 0.52, 가로 ≈ 0.35,
      // 눈동자 ≈ 0.22 (옆을 보고 있어 가로로 살짝 눌려 보인다)
      const erx = H * 0.35;
      const ery = H * 0.52;
      const er = ery;
      // 눈은 깜빡이지 않는다. 감긴 눈은 엉덩방아 찧는 순간(쿵!)에만.
      if (P.lid > 0.9) {
        // 감은 눈
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ex - erx * 0.85, ey + 1);
        ctx.quadraticCurveTo(ex, ey + erx * 0.6, ex + erx * 0.85, ey + 1);
        ctx.stroke();
        return;
      }
      // 흰자는 살짝 세로로 긴 타원
      ctx.fillStyle = '#fbfbf6';
      ctx.beginPath();
      ctx.ellipse(ex, ey, erx, ery, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#141414';
      ctx.lineCap = 'round';
      if (P.spiral > 0.5) {
        // 헤롱헤롱: 빙글빙글 도는 소용돌이 눈. 레퍼런스처럼 굵은 선이
        // 흰자를 거의 꽉 채우며 두 바퀴 남짓 감기고, 선 굵기 ≈ 선 사이 간격이다.
        // 가운데는 0 이 아니라 작은 반지름에서 시작해 갈고리처럼 말린다.
        const turns = 2.25;
        const rot = -this.t * 8;
        const sx = erx * 0.84;
        const sy = Math.min(ery * 0.8, erx * 1.0); // 흰자가 세로로 길어도 소용돌이는 거의 동그랗게
        const r0 = 0.12;
        ctx.lineWidth = Math.max(1.4, (erx * 0.84 * (1 - r0)) / turns * 0.78);
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i <= 90; i++) {
          const k = i / 90;
          const a = k * turns * Math.PI * 2 + rot;
          const rr = r0 + (1 - r0) * k;
          const x = ex + Math.cos(a) * sx * rr;
          const y = ey + Math.sin(a) * sy * rr;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        return;
      }
      if (P.sleep > 0.5) {
        // 잠든 눈: 흰자 안에 또렷한 U. 고개를 숙여도 U 가 기울지 않게
        // 머리·몸 기울기만큼 되돌려서 항상 똑바로 선 U 로 보이게 한다.
        const r = erx * 0.52;
        const top = ey - ery * 0.42;
        const bottom = ey + ery * 0.28;
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(-(P.headTilt + P.tilt));
        ctx.translate(-ex, -ey);
        ctx.lineWidth = 2.3;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(ex - r, top);
        ctx.lineTo(ex - r, bottom - r);
        ctx.arc(ex, bottom - r, r, Math.PI, 0, true);
        ctx.lineTo(ex + r, top);
        ctx.stroke();
        ctx.restore();
        return;
      }
      const lx = this.look.x * erx * 0.4;
      const ly = this.look.y * ery * 0.35;
      ctx.fillStyle = '#141414';
      ctx.beginPath();
      ctx.ellipse(ex + lx, ey + ly, H * 0.17, H * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      if (P.lid > 0.05) {
        // 처진 눈꺼풀
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(ex, ey, erx + 0.5, ery + 0.5, 0, 0, Math.PI * 2);
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
