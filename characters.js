(() => {
  "use strict";

  // Each moving joint has a single mesh. Armor, cloth and ornament share vertex colors.
  window.createCharacter = function createCharacter(THREE, type) {
    const hero = type === "hero";
    const boss = type === "boss";
    const root = new THREE.Group();
    root.name = type;
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.74, metalness: 0.14,
      flatShading: true, side: THREE.DoubleSide
    });
    const buckets = new Map();
    const palette = new Map();
    const TAU = Math.PI * 2;
    const steel = "#a6b9c4", light = "#dfebeb", dark = "#34434c";
    const iron = "#51545b", ironLight = "#909092", leather = "#523524";
    const gold = "#c59550", goldLight = "#f4ce83";
    const blue = "#224e7c", cloth = "#347ea0", red = "#a23d30";
    const skin = boss ? "#668452" : "#709856";
    const skinLit = boss ? "#86a26b" : "#8aaa65";
    const ivory = "#eddbb0";
    const chestHeight = hero ? 1.43 : 1.38;
    const armX = hero ? 0.35 : 0.40;

    function joint(parent, x = 0, y = 0, z = 0) {
      const group = new THREE.Group();
      group.position.set(x, y, z);
      parent.add(group);
      return group;
    }
    function triangle(group, color, a, b, c) {
      if (!buckets.has(group)) buckets.set(group, { positions: [], colors: [] });
      if (!palette.has(color)) palette.set(color, new THREE.Color(color));
      const col = palette.get(color);
      const buf = buckets.get(group);
      buf.positions.push(...a, ...b, ...c);
      for (let i = 0; i < 3; i++) buf.colors.push(col.r, col.g, col.b);
    }
    function quad(group, color, a, b, c, d) {
      triangle(group, color, a, b, c);
      triangle(group, color, a, c, d);
    }
    // Horizontal polygon rings, ordered from the foot of a shape to its crown.
    function lathe(group, x, y, z, levels, segments, color, offset = Math.PI / 8) {
      const rings = levels.map(([h, rx, rz, dz = 0]) =>
        Array.from({length: segments}, (_, i) => {
          const a = offset + i * TAU / segments;
          return [x + rx * Math.sin(a), y + h, z + rz * Math.cos(a) + dz];
        })
      );
      for (let k = 0; k < rings.length - 1; k++) {
        for (let i = 0; i < segments; i++) {
          const j = (i + 1) % segments;
          quad(group, color, rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]);
        }
      }
      for (let i = 1; i < segments - 1; i++) {
        triangle(group, color, rings[0][0], rings[0][i+1], rings[0][i]);
        const r = rings[rings.length - 1];
        triangle(group, color, r[0], r[i], r[i+1]);
      }
    }
    function oval(group, x, y, z, rx, ry, rz, color, segments = 8) {
      lathe(group, x, y, z, [
        [-ry, rx * .24, rz * .24], [-ry * .64, rx * .83, rz * .83],
        [ry * .08, rx, rz], [ry * .62, rx * .83, rz * .83], [ry, rx * .27, rz * .27]
      ], segments, color);
    }
    function line(group, a, b, r1, r2, color, sides = 7) {
      const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
      const dir = to.clone().sub(from).normalize();
      const side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) < .91
        ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1)).normalize();
      const tangent = new THREE.Vector3().crossVectors(dir, side);
      const ring = (p, r) => Array.from({length: sides}, (_, i) => {
        const angle = i * TAU / sides;
        return p.clone().addScaledVector(side, r * Math.cos(angle))
          .addScaledVector(tangent, r * Math.sin(angle)).toArray();
      });
      const ra = ring(from, r1), rb = ring(to, r2);
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        quad(group, color, ra[i], ra[j], rb[j], rb[i]);
      }
      for (let i = 1; i < sides - 1; i++) {
        triangle(group, color, ra[0], ra[i+1], ra[i]);
        triangle(group, color, rb[0], rb[i], rb[i+1]);
      }
    }
    // A raised plate with a beveled, faceted face. points run around its silhouette in XY.
    function plate(group, points, z, thickness, ridge, fill, bevel = fill, center = null) {
      const count = points.length;
      const mid = center || points.reduce(([x,y], p) => [x+p[0]/count, y+p[1]/count], [0,0]);
      const tip = [...mid, z + thickness + ridge];
      for (let i = 0; i < count; i++) {
        const a = points[i], b = points[(i + 1) % count];
        const A = [...a,z+thickness], B = [...b,z+thickness];
        triangle(group, fill, A,B,tip);
        quad(group, bevel, [...a,z], [...b,z], B,A);
        triangle(group, bevel, [...b,z], [...a,z], [...mid,z]);
      }
    }
    function emblem(group, x, y, z, scale, color) {
      const p = (a,b) => [x+a*scale,y+b*scale,z];
      // Winged spear sigil, broad enough to read across the arena.
      quad(group, color, p(0,.29),p(.046,.035),p(0,-.25),p(-.046,.035));
      for (const s of [-1,1]) {
        triangle(group, color, p(s*.025,.08),p(s*.24,.22),p(s*.125,.015));
        triangle(group, color, p(s*.018,.0),p(s*.18,.075),p(s*.077,-.09));
      }
    }

    const rig = joint(root);
    const pelvis = joint(rig, 0, .84, 0);
    const torso = joint(pelvis, 0, .17, 0);
    const head = joint(torso, 0, hero ? .60 : .62, hero ? 0 : .067);
    const cape = joint(torso, 0, .49, -.14);
    const shoulders = [], elbows = [], legs = [], knees = [];
    let sword, shield;

    // Greaves articulate at the knee and overlap the boot throughout the stride.
    for (const sign of [-1, 1]) {
      const hip = joint(pelvis, sign * (hero ? .158 : .216), 0, 0);
      const knee = joint(hip, 0, -.376, .024);
      legs.push(hip); knees.push(knee);
      oval(hip,0,-.16,0,hero?.15:.168,.24,.145,hero?dark:leather);
      lathe(hip,0,-.245,0,[[-.062,.14,.139],[.065,.155,.15]],8,hero?steel:"#70513a");
      oval(knee,0,-.19,-.008,.125,.218,.119,leather);
      lathe(knee,0,-.355,.049,[[-.102,.14,.214],[.005,.151,.213],[.109,.129,.141]],8,hero?"#39464c":"#3d3028");
      oval(knee,0,-.014,.10,.131,.134,.093,hero?steel:iron);
      plate(knee,[[-.101,-.077],[0,-.038],[.101,-.077],[.07,-.37],[0,-.413],[-.07,-.37]],
        .081,.021,.061,hero?steel:iron,hero?light:"#888681");
      lathe(knee,0,-.269,.0,[[-.018,.134,.137],[.018,.134,.137]],8,hero?"#8d744f":"#765435");
    }

    lathe(pelvis,0,-.013,0,[[-.10,.245,.168],[.13,.265,.18]],8,hero?dark:leather);
    lathe(torso,0,0,0,hero ? [
      [-.115,.248,.169],[.12,.277,.168],[.331,.372,.216],[.443,.357,.191],[.505,.168,.13]
    ] : [
      [-.099,.259,.193],[.121,.291,.215],[.329,.422,.253],[.459,.409,.233],[.539,.221,.157]
    ],10,hero?steel:skin);
    lathe(torso,0,0,0,[[-.01,.27,.196],[.085,.282,.2]],10,leather);
    plate(torso,[[-.072,.004],[-.077,.08],[.075,.08],[.072,.004]],.186,.03,.02,gold);
    const apron = hero ? blue : boss ? red : "#784b30";
    plate(pelvis,[[-.176,.068],[.167,.068],[.144,-.222],[0,-.353],[-.14,-.238]],
      .122,.058,.056,apron);
    if (hero) {
      for (const s of [-1,1]) {
        plate(torso,[[s*.03,.405],[s*.227,.454],[s*.355,.326],[s*.247,.229],[s*.027,.19]],
          .132,.03,.07,steel,light);
        line(torso,[s*.027,.2,.225],[s*.266,.29,.211],.014,.023,gold);
      }
      lathe(torso,0,.48,0,[[0,.168,.14],[.082,.147,.143]],8,dark);
      emblem(torso,0,.305,.255,.35,goldLight);
    } else {
      for (const s of [-1,1]) oval(torso,s*.178,.32,.169,.199,.143,.117,skinLit);
      quad(torso,leather,[-.32,.448,.203],[-.23,.49,.224],[.26,.087,.222],[.192,.063,.228]);
      quad(torso,"#8d6542",[-.32,.448,.205],[-.303,.456,.216],[.205,.071,.23],[.192,.063,.23]);
      for (let i=0;i<4;i++) oval(torso,-.213+i*.107,.407-i*.087,.246,.021,.022,.013,gold);
      for (const side of [-1,1]) {
        const x = side*.224;
        plate(pelvis,[[x-.05,.068],[x+.045,.064],[x+.032,-.09],[x,-.158],[x-.035,-.094]],
          .095,.044,.027,"#694733");
        line(pelvis,[x,.015,.168],[x+side*.012,-.11,.176],.031,.006,ivory);
      }
      if (boss) {
        plate(torso,[[-.204,.489],[.171,.487],[.151,.33],[0,.206],[-.171,.342]],.213,.021,.088,iron);
        emblem(torso,0,.372,.325,.36,goldLight);
      }
    }

    if (hero || boss) {
      const hem = hero ? -.95 : -.78;
      const back = hero ? -.153 : -.22;
      const strips = [[-.302,.016,-.043],[-.222,.062,back],[-.067,.081,back-.071],
        [.124,.062,back-.068],[.262,.023,back+.008],[.318,-.035,-.033]];
      const edge = strips.map(([x,y,z],i) =>
        [x*(hero?1.21:1.36)+(i%2)*.013,hem+[.10,.01,.07,0,.112,.16][i],z-.157]);
      const mid = strips.map(([x,y,z],i) => [x*1.113,-.43+y*.3,z-.085-(i%2)*.035]);
      const tints = hero ? ["#22476e","#315f8b","#497da3","#335f89","#20486f"] :
        ["#732c25","#9d3931","#b8523b","#8c3029","#722e27"];
      for (let i=0;i<5;i++) {
        quad(cape,tints[i],strips[i],strips[i+1],mid[i+1],mid[i]);
        quad(cape,tints[i],mid[i],mid[i+1],edge[i+1],edge[i]);
        const up = p => [p[0],p[1]+.035,p[2]+.005];
        quad(cape,hero?gold:"#b58451",edge[i],edge[i+1],up(edge[i+1]),up(edge[i]));
      }
      if (hero) {
        emblem(cape,0,-.445,back-.223,.70,goldLight);
        for (const s of [-1,1]) {
          line(cape,[s*.198,-.049,back-.014],[s*.238,-.352,back-.094],.012,.007,cloth,5);
          line(cape,[s*.265,-.586,back-.127],[s*.29,-.81,back-.144],.009,.009,"#987340",5);
        }
      }
    }

    // The helmet's rear crest, bright pauldrons and split cape distinguish the hero from behind.
    if (hero) {
      oval(head,0,.102,0,.197,.207,.178,dark);
      lathe(head,0,.095,0,[[-.069,.222,.194],[.035,.238,.213],[.16,.175,.164],[.203,.09,.086]],10,steel);
      lathe(head,0,.103,0,[[-.018,.241,.215],[.022,.239,.212]],10,light);
      oval(head,0,.108,.204,.158,.052,.022,"#162d37");
      for (const s of [-1,1]) {
        plate(head,[[s*.05,.067],[s*.185,.1],[s*.213,.065],[s*.167,-.058],[s*.074,-.11]],
          .11,.042,.036,steel);
        line(head,[s*.062,.09,.222],[s*.144,.104,.211],.009,.006,"#b7d9df");
      }
      plate(head,[[-.028,.13],[.033,.13],[.026,-.014],[0,-.059],[-.024,-.018]],.196,.019,.02,gold);
      line(head,[0,.20,.162],[0,.282,-.067],.03,.038,gold);
      const plume = [[0,.25,.113],[0,.313,.034],[0,.34,-.068],[0,.312,-.176],[0,.255,-.252],[0,.167,-.307]];
      for (let i=0;i<plume.length-1;i++) line(head,plume[i],plume[i+1],i<3?.059:.047,i===4?.005:.05,cloth);
    } else {
      oval(head,0,.071,-.003,.238,.226,.192,skin);
      for (const s of [-1,1]) {
        line(head,[s*.175,.105,0],[s*.36,.21,-.044],.085,.003,skinLit);
        oval(head,s*.133,.065,.141,.105,.094,.078,skinLit);
      }
      oval(head,0,-.031,.115,.207,.139,.173,skin);
      // The mouth sits on the front of the protruding jaw, with curved lower tusks.
      line(head,[-.122,-.046,.256],[.122,-.046,.256],.021,.021,"#473b2b");
      for (const s of [-1,1]) {
        line(head,[s*.122,-.074,.249],[s*.141,-.014,.278],.043,.031,ivory);
        line(head,[s*.141,-.014,.278],[s*.132,.057,.286],.031,.002,"#fff0c7");
        oval(head,s*.10,.105,.18,.061,.031,.024,"#292b23");
        oval(head,s*.102,.105,.206,.031,.014,.008,"#e9b858");
        line(head,[s*.035,.133,.209],[s*.186,.169,.142],.032,.043,skinLit);
      }
      oval(head,0,.067,.212,.079,.065,.085,skinLit);
      for (const s of [-1,1]) oval(head,s*.044,.047,.282,.018,.011,.006,"#4c5b41");
      const headTop = boss ? iron : "#343b31";
      lathe(head,0,.136,-.01,[[.028,.226,.193],[.111,.198,.16],[.168,.081,.07]],9,headTop);
      if (boss) {
        lathe(head,0,.167,-.01,[[-.008,.236,.20],[.031,.225,.195]],9,gold);
        for (const s of [-1,1]) {
          const horn = [[s*.181,.233,-.026],[s*.305,.241,-.032],[s*.413,.344,-.019],
            [s*.445,.461,.024],[s*.416,.534,.066]];
          for (let j=0;j<4;j++) line(head,horn[j],horn[j+1],[.092,.078,.054,.027][j],
            [.078,.054,.027,.002][j],j<1?"#a98562":ivory);
          plate(head,[[s*.154,.193],[s*.222,.19],[s*.203,-.021],[s*.149,-.051]],.079,.033,.034,iron);
        }
        plate(head,[[-.037,.30],[.037,.30],[.044,.132],[0,.073],[-.041,.132]],.129,.032,.066,gold);
      } else {
        lathe(head,0,.28,-.04,[[-.019,.079,.067],[.023,.066,.058]],7,leather);
        line(head,[0,.295,-.046],[0,.333,-.116],.069,.058,"#303a30");
        line(head,[0,.333,-.116],[0,.234,-.188],.058,.012,"#303a30");
      }
    }

    for (const s of [-1,1]) {
      const upper = joint(torso,s*armX,chestHeight-1.01,0);
      const lower = joint(upper,0,-.259,.015);
      shoulders.push(upper); elbows.push(lower);
      oval(upper,0,-.103,.004,hero?.11:.155,.192,hero?.112:.151,hero?dark:skinLit);
      oval(lower,0,-.119,.012,hero?.094:.122,.173,hero?.105:.126,hero?dark:skin);
      oval(lower,0,-.247,.021,hero?.094:.112,.113,.107,hero?"#5c4938":skinLit);
      const armored = hero || boss || s < 0;
      if (armored) {
        lathe(upper,0,0,0,[[-.095,.185,.181],[-.069,.201,.194],
          [.056,.168,.17],[.114,.095,.093]],8,hero?steel:iron);
        lathe(upper,0,-.089,0,[[-.024,.184,.181],[.012,.20,.193]],8,hero?gold:"#ae8953");
        if (boss || !hero) {
          const spikes = boss ? [[.031,.015],[.084,-.072],[.134,.052]] : [[.088,.01]];
          for (const [x,z] of spikes) line(upper,[x*s,.067,z],[(x+.084)*s,.245,z-.038],.053,.002,ivory);
        }
      }
      lathe(lower,0,-.137,.01,[[-.073,.108,.113],[.065,.123,.129]],8,hero?steel:"#584638");
      lathe(lower,0,-.169,.012,[[-.018,.112,.118],[.014,.116,.122]],8,hero?light:gold);
      if (s < 0) {
        sword = joint(lower,-.041,-.246,.073);
        if (hero) {
          line(sword,[0,-.18,0],[0,.13,0],.034,.037,leather);
          for (let j=0;j<3;j++) line(sword,[0,-.13+j*.058,0],[0,-.115+j*.058,0],.039,.039,gold);
          oval(sword,0,-.20,0,.059,.06,.056,gold);
          for (const side of [-1,1]) {
            line(sword,[0,.126,0],[side*.147,.112,0],.037,.031,goldLight);
            line(sword,[side*.147,.112,0],[side*.19,.157,0],.033,.011,gold);
          }
          const blade = [[-.061,.145],[-.085,.246],[-.049,.914],[0,1.119],
            [.049,.914],[.085,.246],[.061,.145]];
          plate(sword,blade,-.019,.034,.043,light,steel,[0,.53]);
          plate(sword,[[-.011,.232],[0,.202],[.011,.232],[0,.843]],.057,.003,.002,"#8aafbe");
        } else {
          line(sword,[0,-.32,0],[0,.72,0],.044,.037,"#72553b");
          for (const y of [-.265,-.22,.445,.587]) line(sword,[0,y,0],[0,y+.027,0],.05,.047,gold);
          const sides = boss ? [-1,1] : [-1];
          for (const side of sides) {
            const mirror = points => points.map(([x,y])=>[side*x,y]);
            plate(sword,mirror([[0,.476],[.13,.485],[.267,.389],[.347,.324],[.419,.552],
              [.401,.79],[.248,.726],[.105,.644],[0,.655]]),-.051,.092,.051,iron,ironLight);
            plate(sword,mirror([[.311,.408],[.347,.324],[.419,.552],[.401,.79],[.351,.736],[.361,.548]]),
              .049,.009,.008,light,steel);
          }
          line(sword,[0,.653,0],[0,.807,0],.055,.005,ironLight);
        }
      } else {
        shield = joint(lower,.031,-.15,.117);
        if (hero) {
          const outline = [[0,.445],[.297,.351],[.336,.248],[.291,-.111],[.18,-.31],[0,-.47],
            [-.18,-.31],[-.291,-.111],[-.336,.248],[-.297,.351]];
          const inset = outline.map(([x,y])=>[x*.883,y*.884]);
          plate(shield,outline,-.06,.073,.067,gold,leather);
          plate(shield,inset,.022,.01,.079,blue,"#688293");
          emblem(shield,0,.026,.124,.82,goldLight);
          const reverse = outline.map(([x,y])=>[x*.92,y*.92]);
          plate(shield,reverse,-.069,.008,0,"#523f2e");
          for (const y of [-.094,.195]) {
            const w = y<0 ? .233 : .282;
            quad(shield,"#7f7561",[-w,y-.015,-.072],[w,y-.015,-.072],[w,y+.015,-.072],[-w,y+.015,-.072]);
          }
          for (const sign of [-1,1]) {
            oval(shield,sign*.262,.255,-.072,.018,.018,.009,gold);
            oval(shield,sign*.263,.265,.056,.022,.022,.017,goldLight);
            oval(shield,sign*.224,-.109,.055,.018,.018,.015,goldLight);
            line(shield,[sign*.168,.268,-.073],[sign*.118,-.188,-.073],.026,.025,leather);
          }
        }
      }
    }

    for (const [part,data] of buckets) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position",new THREE.Float32BufferAttribute(data.positions,3));
      geometry.setAttribute("color",new THREE.Float32BufferAttribute(data.colors,3));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry,material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      part.add(mesh);
    }
    root.scale.setScalar(boss ? 1.256 : hero ? 1.025 : 1.075);
    let clock = 0;
    function update(dt, state = {}) {
      clock += Math.max(0,dt || 0);
      const t = state.time ?? clock;
      const move = Math.min(1,Math.max(0,state.move || 0));
      const phase = t * (hero ? 10.7 : 8.8);
      const gait = Math.sin(phase) * move;
      const breathe = Math.sin(t*2.3) * .009;
      const progress = Math.max(0,Math.min(1,state.attack || 0));
      const swing = Math.sin(progress*Math.PI);
      const follow = Math.sin(progress*Math.PI*2) * swing;
      const block = !!state.block;
      const dead = Math.max(0,Math.min(1,state.dead || 0));
      const spin = !!state.spin;
      const evade = Math.sin(Math.PI * Math.min(1, Math.max(0, state.dodge || 0)));
      const hit = Math.min(1,state.hit || 0);
      rig.rotation.x = -dead*1.43;
      rig.position.y = dead*.135;
      pelvis.position.y = .84 + breathe + Math.abs(gait)*.035;
      pelvis.rotation.z = gait*.027;
      torso.rotation.x = .012 + move*.102 - hit*.13 + (block ? .10 : 0);
      torso.rotation.y = gait*.067 + follow*.64 + (block ? -.23 : 0);
      head.rotation.y = -torso.rotation.y*.34;
      head.rotation.x = -.035 - move*.055;
      cape.rotation.x = .055 + move*(.18+Math.sin(phase)*.035)+swing*.13;
      for (let i=0;i<2;i++) {
        const s = i===0 ? -1:1;
        legs[i].rotation.x = gait*s*.49 - .044;
        knees[i].rotation.x = Math.max(0,-gait*s*.52) + .066;
        shoulders[i].rotation.x = -.11 - gait*s*.27;
        shoulders[i].rotation.z = s*(hero ? .16 : .22);
        elbows[i].rotation.x = -(hero ? .28 : .24);
      }
      shoulders[0].rotation.x -= .11 + swing*1.52;
      shoulders[0].rotation.z -= swing*(spin ? .81 : .45);
      shoulders[0].rotation.y = -.08 + follow*.91;
      elbows[0].rotation.x -= swing*.21;
      sword.rotation.set(.41 + swing*.44, -.08, (hero ? .59 : .49) + follow*.90);
      if (spin) {
        shoulders[0].rotation.z = -1.05;
        shoulders[0].rotation.x = -.45;
        sword.rotation.z = 1.99;
      }
      if (hero) {
        shoulders[1].rotation.x -= block ? .82 : .20;
        shoulders[1].rotation.z = block ? .024 : .24;
        elbows[1].rotation.x -= block ? .54 : .12;
        shield.rotation.set(block ? 1.42 : .59, block ? -.16 : .67, block ? -.10 : -.13);
        shield.visible = !state.shieldAway;
      }
      if (evade > 0) {
        pelvis.position.y -= .16 * evade;
        torso.rotation.x += .48 * evade;
        torso.rotation.z = .20 * evade;
        head.rotation.x -= .20 * evade;
        legs[0].rotation.x -= .91 * evade;
        legs[1].rotation.x += .72 * evade;
        knees[0].rotation.x += .86 * evade;
        knees[1].rotation.x += .18 * evade;
        shoulders[1].rotation.x -= .65 * evade;
        cape.rotation.x += .30 * evade;
      } else {
        torso.rotation.z = 0;
      }
      material.emissive.setRGB(hit*.31,hit*.082,hit*.032);
    }
    update(0);
    return {root, shield, update};
  };
})();
