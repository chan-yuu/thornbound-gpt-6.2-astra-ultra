(() => {
  'use strict';

  function createGame({ THREE: T, scene, createCharacter, onEvent = () => {}, obstacles = [] }) {
    const TAU = Math.PI * 2;
    const fieldRadius = 13;
    const hero = createCharacter(T, 'hero');
    const enemies = [
      { type: 'orc', x: -3.1, z: -1.8, side: -1 },
      { type: 'orc', x: 3.15, z: -2.65, side: 1 },
      { type: 'boss', x: 0.65, z: -5.05, side: 0 }
    ].map(spawn => {
      const model = createCharacter(T, spawn.type);
      const boss = spawn.type === 'boss';
      return { ...spawn, model, root: model.root, boss, maxHp: boss ? 360 : 110,
        radius: boss ? 0.72 : 0.47, reach: boss ? 3.2 : 2.65 };
    });
    scene.add(hero.root, ...enemies.map(e => e.root));

    const movement = new T.Vector2();
    const goal = new T.Vector2();
    const offset = new T.Vector2();
    const colliders = obstacles.map(({x, z, x2 = x, z2 = z, r}) => {
      const dx = x2 - x, dz = z2 - z;
      return { x, z, dx, dz, r, lengthSq: dx * dx + dz * dz };
    });
    const maxHp = 140;
    const spare = new T.Object3D();
    const worldUp = new T.Vector3(0, 1, 0);
    let elapsed, hp, rage, points, kills, status, started, paused, resultAt;
    let action, attackHeld, blockHeld, blockStarted, attackBuffer, flinch, invincible, dodgeReady;
    let combo, comboEnds, moved, projectile, blockLastFrame;

    function emit(name, data = {}) { onEvent(name, data); }
    function angleDelta(from, to) { return Math.atan2(Math.sin(to - from), Math.cos(to - from)); }
    function turn(root, yaw, rate, dt) {
      root.rotation.y += angleDelta(root.rotation.y, yaw) * (1 - Math.exp(-rate * dt));
    }
    function distance(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
    function fromObstacle(x, z, o) {
      const dx = x - o.x, dz = z - o.z;
      const u = o.lengthSq ? Math.min(1, Math.max(0, (dx * o.dx + dz * o.dz) / o.lengthSq)) : 0;
      return offset.set(dx - o.dx * u, dz - o.dz * u);
    }
    function constrain(p, radius) {
      // Repeat at joints between rocks and at the arena boundary, where sliding along
      // one surface can nudge a body into its neighbour.
      for (let pass = 0; pass < 5; pass++) {
        const length = Math.hypot(p.x, p.z);
        if (length > fieldRadius) {
          p.x *= fieldRadius / length;
          p.z *= fieldRadius / length;
        }
        let touched = false;
        for (const o of colliders) {
          const off = fromObstacle(p.x, p.z, o);
          const min = radius + o.r;
          const sq = off.lengthSq();
          if (sq >= min * min) continue;
          if (sq < 1e-12) {
            if (o.lengthSq) off.set(-o.dz, o.dx).normalize();
            else off.set(1, 0);
          } else off.multiplyScalar(1 / Math.sqrt(sq));
          const push = min - Math.sqrt(sq) + 0.0001;
          p.x += off.x * push;
          p.z += off.y * push;
          touched = true;
        }
        if (!touched) break;
      }
    }
    function moveHero(dx, dz) {
      const pos = hero.root.position;
      // Keep even the fastest lunge from stepping over a thin fallen trunk.
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.22));
      for (let i = 0; i < steps; i++) {
        pos.x += dx / steps; pos.z += dz / steps;
        constrain(pos, 0.46);
      }
    }
    function steer(enemy) {
      const p = enemy.root.position;
      const x = p.x + goal.x * 0.64, z = p.z + goal.y * 0.64;
      const o = colliders.find(o => fromObstacle(x, z, o).lengthSq() < (o.r + enemy.radius + 0.13) ** 2);
      if (!o) {
        const previous = enemy.avoiding;
        if (previous && fromObstacle(p.x, p.z, previous).lengthSq() > (previous.r + enemy.radius + 1.15) ** 2) {
          enemy.avoiding = null;
        }
        return;
      }
      const normal = fromObstacle(p.x, p.z, o).normalize();
      const tx = -normal.y, tz = normal.x;
      if (enemy.avoiding !== o) {
        const alignment = tx * goal.x + tz * goal.y;
        enemy.skirt = Math.abs(alignment) > 0.14 ? Math.sign(alignment) : enemy.side || 1;
        enemy.avoiding = o;
      }
      goal.set(tx * enemy.skirt + normal.x * 0.08, tz * enemy.skirt + normal.y * 0.08).normalize();
    }
    function nearest(point, range = Infinity, skip = null) {
      let target = null;
      let best = range;
      for (const enemy of enemies) {
        if (enemy.hp <= 0 || (skip && skip.has(enemy))) continue;
        const dist = distance(point, enemy.root.position);
        if (dist <= best) { best = dist; target = enemy; }
      }
      return target;
    }
    function aimAngle(root, to) {
      return Math.atan2(to.x - root.position.x, to.z - root.position.z);
    }

    // Each arc has a tapered edge. The same meshes are used for ground marks and sword trails.
    function band(inner, outer, spread, taper = false) {
      const n = Math.max(12, Math.ceil(spread * 12));
      const vertices = [], index = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const a = (u - 0.5) * spread;
        const half = (outer - inner) * 0.5 * (taper ? 0.025 + 0.975 * Math.sin(Math.PI * u) : 1);
        const mid = (outer + inner) * 0.5;
        for (const r of [mid - half, mid + half]) vertices.push(Math.sin(a) * r, 0, Math.cos(a) * r);
        if (i < n) {
          const k = i * 2;
          index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
      geo.setIndex(index);
      return geo;
    }
    function unlit(color, opacity = 1) {
      return new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false,
        side: T.DoubleSide, toneMapped: false });
    }
    function mark(radius, color, isHero) {
      const group = new T.Group();
      const material = unlit(color, isHero ? 0.6 : 0.58);
      const ring = band(radius, radius + 0.023, Math.PI * 0.68);
      for (let i = 0; i < 2; i++) {
        const arc = new T.Mesh(ring, material);
        arc.rotation.y = 0.6 + i * Math.PI;
        arc.renderOrder = 1;
        group.add(arc);
      }
      scene.add(group);
      return group;
    }
    const heroMark = mark(0.75, 0xc5ecd8, true);
    for (const enemy of enemies) {
      enemy.mark = mark(enemy.boss ? 1.04 : 0.72, enemy.boss ? 0xc69151 : 0xab6550, false);
      const radius = enemy.reach;
      const sector = enemy.boss ? 2.15 : 1.7;
      enemy.warn = new T.Group();
      enemy.fill = new T.Mesh(band(0.05, radius, sector), unlit(0xf45a36, 0.1));
      enemy.rim = new T.Mesh(band(radius - 0.052, radius, sector), unlit(0xffb069, 0.75));
      enemy.fill.renderOrder = 2;
      enemy.rim.renderOrder = 3;
      enemy.warn.add(enemy.fill, enemy.rim);
      enemy.warn.visible = false;
      scene.add(enemy.warn);
    }

    const sweepNarrow = band(1.35, 2.24, 2.3, true);
    const sweepWide = band(2.15, 3.55, 3.45, true);
    const sweepEdge = band(2.19, 2.26, 2.28, true);
    const spinEdge = band(3.43, 3.56, 3.4, true);
    const sweeps = [];
    const slashColors = {
      sword: [0xcfdee1, 0xf5ffff], rush: [0xffbc54, 0xfff0cd], spin: [0xbea4ff, 0xf7efff]
    };
    function slash(root, yaw, kind = 'sword', alternate = false) {
      const wide = kind === 'spin';
      const [trailColor, edgeColor] = slashColors[kind];
      const group = new T.Group();
      const angle = alternate ? -1 : 1;
      group.position.copy(root.position);
      group.position.y += wide ? 0.82 : 1.1;
      group.rotation.order = 'YXZ';
      group.rotation.set(wide ? 0.17 : 0.24 * angle, yaw - angle * 0.57, wide ? 0.16 * angle : 0.34 * angle);
      const blade = new T.Mesh(wide ? sweepWide : sweepNarrow, unlit(trailColor, 0.65));
      const edge = new T.Mesh(wide ? spinEdge : sweepEdge, unlit(edgeColor, 0.95));
      group.add(blade, edge);
      scene.add(group);
      sweeps.push({ group, blade, edge, turn: angle * 2, age: 0, life: wide ? 0.33 : 0.19 });
    }

    const maxSparks = 112;
    const particles = [];
    const sparks = new T.InstancedMesh(new T.OctahedronGeometry(1, 0),
      new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), maxSparks);
    sparks.instanceMatrix.setUsage(T.DynamicDrawUsage);
    sparks.frustumCulled = false;
    sparks.count = 0;
    scene.add(sparks);
    const palettes = {
      gold: [0xffe9b7, 0xffb852, 0xffd66a], blue: [0xedffff, 0x63cce1, 0xb7edf3],
      silver: [0xffffff, 0xc4d3d8, 0xe4f0f0], violet: [0xfaedff, 0xbc95ff, 0xdbc8ff],
      red: [0xffe0a0, 0xf27d47, 0xda5540], dust: [0x8b9773, 0xb6ac81, 0x889b79]
    };
    function burst(position, palette = 'gold', count = 9, scale = 1, height = 0) {
      for (let i = 0; i < count; i++) {
        if (particles.length >= maxSparks) particles.shift();
        const a = Math.random() * TAU;
        const speed = (1.6 + Math.random() * 3.6) * scale;
        const life = 0.18 + Math.random() * 0.19;
        particles.push({
          x: position.x, y: position.y + height, z: position.z,
          vx: Math.sin(a) * speed, vy: (1 + Math.random() * 3.8) * scale, vz: Math.cos(a) * speed,
          color: palettes[palette][i % 3], size: 0.035 + Math.random() * 0.045,
          life, total: life
        });
      }
    }
    const tint = new T.Color();
    function updateEffects(dt) {
      for (let i = sweeps.length - 1; i >= 0; i--) {
        const fx = sweeps[i];
        fx.age += dt;
        if (fx.age >= fx.life) {
          scene.remove(fx.group);
          fx.blade.material.dispose();
          fx.edge.material.dispose();
          sweeps.splice(i, 1);
        } else {
          const fade = 1 - fx.age / fx.life;
          fx.group.rotation.y += fx.turn * dt / fx.life;
          fx.blade.material.opacity = fade * 0.57;
          fx.edge.material.opacity = fade * 0.95;
        }
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vy -= 10 * dt;
      }
      sparks.count = particles.length;
      particles.forEach((p, i) => {
        const s = p.size * Math.min(1, p.life * 9);
        spare.position.set(p.x, p.y, p.z);
        spare.scale.set(s * 0.53, s * 1.8, s * 0.53);
        spare.quaternion.setFromUnitVectors(worldUp, sparkDirection.set(p.vx, p.vy, p.vz).normalize());
        spare.updateMatrix();
        sparks.setMatrixAt(i, spare.matrix);
        sparks.setColorAt(i, tint.setHex(p.color));
      });
      if (sparks.count) {
        sparks.instanceMatrix.needsUpdate = true;
        sparks.instanceColor.needsUpdate = true;
      }
    }
    const sparkDirection = new T.Vector3();
    const shieldFlight = new T.Group();
    if (hero.shield) {
      const copy = hero.shield.clone(true);
      copy.position.set(0, 0, 0);
      copy.rotation.set(0, 0, 0);
      copy.visible = true;
      shieldFlight.add(copy);
    } else {
      const disc = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 0.13, 10),
        new T.MeshStandardMaterial({ color: 0x4f97ad, metalness: 0.62, roughness: 0.36 }));
      disc.rotation.x = Math.PI / 2;
      shieldFlight.add(disc);
    }
    const halo = new T.Mesh(band(0.49, 0.53, TAU), unlit(0xb6f6ff, 0.7));
    halo.rotation.x = Math.PI / 2;
    shieldFlight.add(halo);
    shieldFlight.visible = false;
    scene.add(shieldFlight);
    const trailLength = 12;
    const trailPositions = new Float32Array(trailLength * 3);
    const trailColors = new Float32Array(trailLength * 3);
    for (let i = 0; i < trailLength; i++) {
      const u = (1 - i / trailLength) ** 2;
      trailColors.set([0.8 * u, 0.97 * u, u], i * 3);
    }
    const trailGeometry = new T.BufferGeometry();
    const trailBuffer = new T.BufferAttribute(trailPositions, 3);
    trailBuffer.setUsage(T.DynamicDrawUsage);
    trailGeometry.setAttribute('position', trailBuffer);
    trailGeometry.setAttribute('color', new T.BufferAttribute(trailColors, 3));
    const trail = new T.Line(trailGeometry, new T.LineBasicMaterial({ vertexColors: true,
      transparent: true, opacity: 0.88, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
    trail.frustumCulled = false;
    trail.visible = false;
    scene.add(trail);

    function stopProjectile() {
      projectile = null;
      shieldFlight.visible = false;
      trail.visible = false;
    }
    function gainRage(amount) {
      if (points >= 3) return;
      rage += amount;
      if (rage >= 100) {
        points++;
        rage = points === 3 ? 0 : rage - 100;
        emit('point', { points });
        burst(hero.root.position, 'gold', 12, 0.68, 0.8);
      }
    }
    function damageEnemy(enemy, amount, power, color) {
      if (enemy.hp <= 0 || status !== 'playing') return false;
      enemy.hp = Math.max(0, enemy.hp - amount);
      enemy.hit = 1;
      if (power && !enemy.boss && enemy.phase === 'windup') {
        enemy.phase = 'recover'; enemy.timer = 0.65;
        enemy.warn.visible = false;
      }
      const p = enemy.root.position.clone();
      p.y += enemy.boss ? 1.72 : 1.3;
      burst(p, color, power ? 14 : 8, power ? 1.1 : 0.8);
      emit('hit', { target: enemy.root, amount, boss: enemy.boss, heavy: power, position: p });
      if (enemy.hp === 0) {
        enemy.phase = 'dead';
        enemy.deathTime = 0;
        enemy.warn.visible = false;
        enemy.mark.visible = false;
        kills++;
        emit('kill', { boss: enemy.boss, kills });
        if (kills === enemies.length) {
          status = 'victory';
          resultAt = elapsed + 0.75;
        }
      }
      return true;
    }

    function guarding() { return status === 'playing' && blockHeld && !action && !projectile && flinch <= 0.18; }
    function hurt(enemy, amount) {
      if (invincible > 0 || status !== 'playing') return;
      const p = hero.root.position;
      if (guarding() && Math.abs(angleDelta(hero.root.rotation.y, aimAngle(hero.root, enemy.root.position))) < 1.6) {
        const perfect = elapsed - blockStarted < 0.29;
        burst(p, 'blue', perfect ? 14 : 8, 0.75, 1.06);
        emit('block', { perfect });
        if (perfect) enemy.timer += 0.55;
        return;
      }
      hp = Math.max(0, hp - amount);
      flinch = 0.32;
      invincible = 0.55;
      burst(p, 'red', 9, 0.8, 1.1);
      emit('hurt', { amount, position: p.clone() });
      if (hp === 0) {
        status = 'defeat';
        action = { kind: 'dead', t: 0 };
        stopProjectile();
        resultAt = elapsed + 0.75;
      }
    }
    function start() {
      if (!started) { started = true; emit('start'); }
    }
    function swing() {
      if (action || guarding() || flinch > 0.2) return false;
      start();
      combo = elapsed < comboEnds ? (combo + 1) % 3 : 0;
      const who = nearest(hero.root.position, 3.85);
      if (who) hero.root.rotation.y = aimAngle(hero.root, who.root.position);
      const duration = [0.46, 0.47, 0.62][combo];
      action = { kind: 'attack', t: 0, duration, combo, yaw: hero.root.rotation.y,
        hitAt: duration * (combo === 2 ? 0.5 : 0.4), done: false };
      comboEnds = elapsed + duration + 0.47;
      attackBuffer = 0;
      emit('swing', { combo: combo + 1 });
      return true;
    }
    const skillNames = ['', '突进斩', '回旋飞盾', '旋风斩'];
    function skill(slot) {
      if (points < slot) {
        emit('notice', { text: '需要 ' + slot + ' 个怒气点' });
        return;
      }
      if (action && action.kind !== 'attack') return;
      const pos = hero.root.position;
      const target = nearest(pos, slot === 2 ? 12 : 6.5);
      if (slot === 2 && (!target || projectile)) {
        emit('notice', { text: projectile ? '飞盾正在回旋' : '射程内没有目标' });
        return;
      }
      start();
      points -= slot;
      attackBuffer = 0;
      if (target) hero.root.rotation.y = aimAngle(hero.root, target.root.position);
      const yaw = hero.root.rotation.y;
      if (slot === 1) {
        const reach = target ? Math.min(5.5, Math.max(0, distance(pos, target.root.position) - 1.05)) : 4.8;
        action = { kind: 'rush', t: 0, duration: 0.46, yaw, reach, travelled: 0, done: false };
        invincible = Math.max(invincible, 0.29);
        burst(pos, 'dust', 7, 0.75, 0.12);
      } else if (slot === 2) {
        action = { kind: 'throw', t: 0, duration: 0.42 };
        launch(target);
      } else {
        action = { kind: 'spin', t: 0, duration: 1.7, yaw, pulse: 0 };
        invincible = Math.max(invincible, 0.32);
      }
      emit('skill', { slot, name: skillNames[slot] });
    }
    function launch(target) {
      shieldFlight.position.copy(hero.root.position);
      shieldFlight.position.y += 1.3;
      const yaw = hero.root.rotation.y;
      shieldFlight.position.x += Math.cos(yaw) * 0.48;
      shieldFlight.position.z -= Math.sin(yaw) * 0.48;
      shieldFlight.rotation.order = 'YXZ';
      shieldFlight.rotation.set(-0.95, yaw, 0);
      shieldFlight.visible = true;
      trail.visible = true;
      projectile = { target, seen: new Set(), leg: 0, phase: 0 };
      for (let i = 0; i < trailLength; i++) shieldFlight.position.toArray(trailPositions, i * 3);
      trailBuffer.needsUpdate = true;
    }
    const shieldGoal = new T.Vector3();
    function moveProjectile(dt) {
      if (!projectile) return;
      const shot = projectile;
      const p = shieldFlight.position;
      if (shot.target && shot.target.hp <= 0) {
        shot.seen.add(shot.target);
        shot.target = shot.leg < 2 ? nearest(p, 7, shot.seen) : null;
      }
      const next = shot.target;
      shieldGoal.copy(next ? next.root.position : hero.root.position);
      shieldGoal.y += next && next.boss ? 1.76 : 1.25;
      const dist = p.distanceTo(shieldGoal);
      const step = (next ? 17 : 21) * dt;
      p.lerp(shieldGoal, dist > 0.001 ? Math.min(1, step / dist) : 1);
      shieldFlight.rotation.z += dt * 19;
      shot.phase += dt;
      trailPositions.copyWithin(3, 0, trailPositions.length - 3);
      p.toArray(trailPositions, 0);
      trailBuffer.needsUpdate = true;
      if (dist <= step + 0.1) {
        if (!next) { stopProjectile(); emit('catch'); return; }
        shot.leg++;
        shot.seen.add(next);
        damageEnemy(next, shot.leg === 1 ? 44 : 39, true, 'blue');
        shot.target = shot.leg < 2 ? nearest(next.root.position, 7, shot.seen) : null;
      }
    }
    function dodge() {
      if ((action && action.kind !== 'attack') || elapsed < dodgeReady) return;
      start();
      const yaw = movement.lengthSq() > 0.01 ? Math.atan2(movement.x, movement.y) : hero.root.rotation.y;
      action = { kind: 'dodge', t: 0, duration: 0.36, yaw };
      hero.root.rotation.y = yaw;
      invincible = 0.31;
      dodgeReady = elapsed + 0.92;
      attackBuffer = 0;
      burst(hero.root.position, 'dust', 7, 0.7, 0.12);
      emit('dodge');
    }
    function input(name, down = true) {
      if (!down) {
        if (name === 'attack') attackHeld = false;
        if (name === 'block') blockHeld = false;
        return;
      }
      if (paused || status !== 'playing') return;
      if (name === 'attack') {
        if (attackHeld) return;
        attackHeld = true;
        attackBuffer = 0.2;
        swing();
      } else if (name === 'block') {
        if (!blockHeld) { start(); blockStarted = elapsed; }
        blockHeld = true;
      } else if (name === 'dodge') {
        dodge();
      } else if (name === 'skill1' || name === 'skill2' || name === 'skill3') {
        skill(Number(name.slice(-1)));
      }
    }
    function setMove(x, z) {
      movement.set(Number(x) || 0, Number(z) || 0);
      if (movement.lengthSq() > 1) movement.normalize();
      if (movement.lengthSq() > 0.01 && !paused && status === 'playing') start();
    }

    function forward(yaw, length) {
      moveHero(Math.sin(yaw) * length, Math.cos(yaw) * length);
    }
    function cleave(yaw, radius, arc, damage, power, tone) {
      const p = hero.root.position;
      let landed = false;
      for (const enemy of enemies) {
        if (enemy.hp <= 0 || distance(p, enemy.root.position) > radius + enemy.radius) continue;
        if (Math.abs(angleDelta(yaw, aimAngle(hero.root, enemy.root.position))) > arc * 0.5) continue;
        landed = damageEnemy(enemy, damage, power, tone) || landed;
      }
      return landed;
    }
    function tickAction(dt) {
      const a = action;
      if (!a) return;
      a.t += dt;
      const ratio = Math.min(1, a.t / a.duration);
      if (a.kind === 'attack') {
        if (ratio <= 0.42) forward(a.yaw, 1.65 * dt);
        if (!a.done && a.t >= a.hitAt) {
          a.done = true;
          slash(hero.root, a.yaw, 'sword', a.combo === 1);
          if (cleave(a.yaw, a.combo === 2 ? 2.5 : 2.2, a.combo === 2 ? 2.9 : 2.25,
            [10, 12, 16][a.combo], a.combo === 2, 'silver')) gainRage([32, 32, 36][a.combo]);
        }
      } else if (a.kind === 'rush') {
        const u = Math.min(1, a.t / 0.255);
        const wanted = a.reach * (1 - (1 - u) ** 2);
        forward(a.yaw, wanted - a.travelled);
        a.travelled = wanted;
        if (!a.done && a.t >= 0.23) {
          a.done = true;
          slash(hero.root, a.yaw, 'rush');
          cleave(a.yaw, 2.55, 2.6, 39, true, 'gold');
        }
      } else if (a.kind === 'spin') {
        hero.root.rotation.y = a.yaw + ratio * TAU * 2.8;
        if (a.pulse < 5 && a.t >= 0.16 + 0.29 * a.pulse) {
          slash(hero.root, hero.root.rotation.y, 'spin', a.pulse % 2 === 1);
          for (const enemy of enemies) {
            if (enemy.hp > 0 && distance(hero.root.position, enemy.root.position) <= 3.72 + enemy.radius) {
              damageEnemy(enemy, 17, true, 'violet');
            }
          }
          a.pulse++;
        }
      } else if (a.kind === 'dodge') {
        forward(a.yaw, (1 - ratio * 0.68) * 13.6 * dt);
      }
      if (a.t >= a.duration && action === a) action = null;
    }
    function updateHero(dt) {
      flinch = Math.max(0, flinch - dt);
      invincible = Math.max(0, invincible - dt);
      attackBuffer = Math.max(0, attackBuffer - dt);
      if (!action && (attackHeld || attackBuffer > 0)) swing();
      const block = guarding();
      if (block && !blockLastFrame) {
        const closest = nearest(hero.root.position, 5);
        if (closest) hero.root.rotation.y = aimAngle(hero.root, closest.root.position);
      }
      blockLastFrame = block;
      const spin = action && action.kind === 'spin';
      const speed = !action ? (block ? 1.85 : 5.15) : (spin ? 2.7 : 0);
      moved = movement.length() * speed / 5.15;
      if (speed && movement.lengthSq() > 0.001) {
        moveHero(movement.x * speed * dt, movement.y * speed * dt);
        if (!block && !spin) turn(hero.root, Math.atan2(movement.x, movement.y), 19, dt);
      }
      if (block) {
        const closest = nearest(hero.root.position, 4.7);
        if (closest) turn(hero.root, aimAngle(hero.root, closest.root.position), 12, dt);
      }
      tickAction(dt);
    }
    function updateEnemy(enemy, dt) {
      const root = enemy.root;
      enemy.moved = 0;
      enemy.hit = Math.max(0, enemy.hit - dt * 4.5);
      if (enemy.hp <= 0) { enemy.deathTime += dt; return; }
      if (!started || status !== 'playing') { enemy.warn.visible = false; return; }
      const p = hero.root.position;
      const dist = distance(root.position, p);
      const yaw = aimAngle(root, p);
      enemy.timer -= dt;
      if (enemy.phase === 'windup') {
        const u = Math.min(1, 1 - enemy.timer / enemy.windup);
        enemy.warn.visible = true;
        enemy.warn.position.copy(root.position);
        enemy.warn.position.y += 0.075;
        enemy.warn.rotation.y = enemy.attackYaw;
        enemy.fill.material.opacity = 0.035 + 0.18 * u;
        enemy.rim.material.opacity = 0.35 + 0.59 * u;
        if (enemy.timer <= 0) {
          enemy.phase = 'strike';
          enemy.timer = enemy.boss ? 0.35 : 0.28;
          enemy.warn.visible = false;
          if (dist <= enemy.reach + 0.36 && Math.abs(angleDelta(enemy.attackYaw, yaw)) < (enemy.boss ? 1.23 : 1.02)) {
            hurt(enemy, enemy.boss ? 20 : 11);
          }
          if (enemy.boss) {
            const at = root.position.clone();
            at.x += Math.sin(enemy.attackYaw) * 1.7;
            at.z += Math.cos(enemy.attackYaw) * 1.7;
            burst(at, 'dust', 12, 0.93, 0.1);
          }
        }
      } else if (enemy.phase === 'strike') {
        if (enemy.timer <= 0) { enemy.phase = 'recover'; enemy.timer = enemy.boss ? 1.06 : 0.8; }
      } else if (enemy.phase === 'recover') {
        if (enemy.timer <= 0) { enemy.phase = 'chase'; enemy.timer = 0.14; }
      } else {
        turn(root, yaw, 7, dt);
        if (dist < enemy.reach - 0.27 && enemy.timer <= 0) {
          enemy.phase = 'windup';
          enemy.windup = enemy.boss ? 1.08 : 0.76;
          enemy.timer = enemy.windup;
          enemy.attackYaw = yaw;
          root.rotation.y = yaw;
        } else if (dist > enemy.reach - 0.45) {
          goal.set(p.x - root.position.x, p.z - root.position.z).normalize();
          if (dist > 3.8 && dist < 8 && enemy.side) {
            const offset = Math.min(0.34, (dist - 3.8) * 0.09) * enemy.side;
            goal.set(goal.x - goal.y * offset, goal.y + goal.x * offset).normalize();
          }
          const speed = enemy.boss ? 1.75 : 2.45;
          steer(enemy);
          root.position.x += goal.x * speed * dt;
          root.position.z += goal.y * speed * dt;
          enemy.moved = enemy.boss ? 0.58 : 0.82;
        }
      }
    }
    function separate() {
      // The attacker can pass a target during a roll. Other movements stop outside its body.
      const ghost = action && action.kind === 'dodge';
      for (let i = 0; i < enemies.length; i++) {
        const a = enemies[i];
        if (a.hp <= 0) continue;
        for (let j = 0; j <= i; j++) {
          const other = j === i ? hero : enemies[j];
          if (other === hero ? ghost : other.hp <= 0) continue;
          const p = a.root.position, q = other.root.position;
          const min = a.radius + (other === hero ? 0.46 : other.radius) + (other === hero ? 0.04 : 0.27);
          let dx = p.x - q.x, dz = p.z - q.z;
          const d = Math.hypot(dx, dz);
          if (d >= min) continue;
          if (d < 0.001) { dx = i % 2 ? 1 : -1; dz = 0; }
          else { dx /= d; dz /= d; }
          const push = min - d;
          const aShare = other === hero ? 0.38 : 0.5;
          p.x += dx * push * aShare; p.z += dz * push * aShare;
          q.x -= dx * push * (1 - aShare); q.z -= dz * push * (1 - aShare);
        }
      }
      for (const enemy of enemies) if (enemy.hp > 0) constrain(enemy.root.position, enemy.radius);
      constrain(hero.root.position, 0.46);
    }
    function pose(dt) {
      const a = action;
      let attackPose = 0;
      if (a && ['attack', 'rush', 'throw'].includes(a.kind)) attackPose = Math.min(1, a.t / a.duration);
      hero.update(dt, { time: elapsed, move: moved, attack: attackPose, block: guarding(),
        spin: !!a && a.kind === 'spin', dodge: a && a.kind === 'dodge' ? a.t / a.duration : 0,
        dead: a && a.kind === 'dead' ? Math.min(1, a.t / 0.66) : 0,
        hit: Math.min(1, flinch * 3.1), shieldAway: !!projectile });
      heroMark.position.copy(hero.root.position);
      heroMark.position.y += 0.059;
      heroMark.visible = hp > 0;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        let attack = 0;
        if (e.phase === 'windup') attack = (1 - e.timer / e.windup) * 0.37;
        if (e.phase === 'strike') attack = Math.max(0.38, 1 - e.timer * 1.75);
        e.model.update(dt, { time: elapsed + i * 0.77, move: e.moved, attack,
          dead: e.hp <= 0 ? Math.min(1, e.deathTime / 0.7) : 0, hit: e.hit, block: false });
        e.mark.position.copy(e.root.position);
        e.mark.position.y += 0.06;
      }
    }
    function update(delta) {
      if (paused || !Number.isFinite(delta) || delta <= 0) return;
      let left = Math.min(0.15, delta);
      while (left > 0.00001) {
        const dt = Math.min(left, 1 / 45);
        left -= dt;
        elapsed += dt;
        if (status === 'playing') updateHero(dt);
        else {
          moved = 0;
          if (action && action.kind === 'dead') action.t += dt;
          else action = null;
        }
        for (const enemy of enemies) updateEnemy(enemy, dt);
        if (started && status === 'playing') separate();
        moveProjectile(dt);
        updateEffects(dt);
        pose(dt);
        if (elapsed >= resultAt && !projectile) {
          resultAt = Infinity;
          emit(status);
        }
      }
    }
    function setPaused(value) {
      paused = !!value;
      if (paused) {
        attackHeld = blockHeld = false;
        attackBuffer = 0;
        movement.set(0, 0);
      }
    }
    function reset(sendEvent) {
      elapsed = 0; hp = maxHp; rage = 0; points = 0; kills = 0;
      resultAt = Infinity;
      status = 'playing'; started = false; paused = false;
      action = null; combo = -1; comboEnds = -1;
      blockStarted = -1; attackBuffer = 0; dodgeReady = 0; flinch = 0; invincible = 0;
      attackHeld = false; blockHeld = false; blockLastFrame = false; moved = 0;
      movement.set(0, 0);
      stopProjectile();
      particles.length = 0;
      updateEffects(5);
      hero.root.position.set(0, 0, 3);
      hero.root.rotation.set(0, Math.PI, 0);
      enemies.forEach((e, i) => {
        e.root.position.set(e.x, 0, e.z);
        e.root.rotation.set(0, aimAngle(e.root, hero.root.position), 0);
        e.hp = e.maxHp; e.phase = 'chase'; e.timer = 0.45 + i * 0.3;
        e.hit = 0; e.deathTime = 0; e.moved = 0;
        e.avoiding = null;
        e.warn.visible = false; e.mark.visible = true;
      });
      pose(0);
      if (sendEvent) emit('restart');
    }
    function getState() {
      const chief = enemies[2];
      return { hp, maxHp, rage, points, kills, total: enemies.length,
        bossHp: chief.hp, bossMaxHp: chief.maxHp, status, started, elapsed,
        blocking: guarding(), shieldAway: !!projectile, paused,
        enemies: enemies.map(e => ({ root: e.root, hp: e.hp, maxHp: e.maxHp,
          boss: e.boss, attacking: e.phase === 'windup' || e.phase === 'strike' })) };
    }
    reset(false);
    return { hero, update, input, setMove, getState, restart: () => reset(true), setPaused };
  }

  window.createGame = createGame;
})();
