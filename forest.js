/* The forest is generated from a fixed seed so every restart uses the same clearing. */
window.createForest = function createForest(THREE, scene) {
  let seed = 493251;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const between = (min, max) => min + (max - min) * random();
  const choose = list => list[Math.floor(random() * list.length)];
  const tau = Math.PI * 2;
  const clamp = (x, low = 0, high = 1) => Math.max(low, Math.min(high, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const point = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
  const polar = (x, y, z, radius, angle) => [x + radius * Math.cos(angle), y, z + radius * Math.sin(angle)];
  const colorCache = new Map();
  function color(hex) {
    if (!colorCache.has(hex)) colorCache.set(hex, new THREE.Color(hex));
    return colorCache.get(hex);
  }
  function tint(hex, light) {
    return color(hex).clone().multiplyScalar(light);
  }
  function hash(x, z) {
    let n = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }
  function noise(x, z) {
    const i = Math.floor(x), j = Math.floor(z);
    const a = smooth(x - i), b = smooth(z - j);
    return mix(mix(hash(i,j), hash(i+1,j), a), mix(hash(i,j+1), hash(i+1,j+1), a), b);
  }
  function height(x, z) {
    const d = Math.hypot(x, z);
    return -.025 + smooth(clamp((d - 15) / 12)) * (.3 + 3.5 * noise(x * .105, z * .105));
  }

  const obstacles = [];
  function addObstacle(x, z, r, x2 = x, z2 = z) {
    const dx=x2-x, dz=z2-z, len2=dx*dx+dz*dz;
    const t=len2 ? clamp(-(x*dx+z*dz)/len2) : 0;
    if(Math.hypot(x+dx*t,z+dz*t) <= 14+r) {
      obstacles.push(len2 ? {x,z,x2,z2,r} : {x,z,r});
    }
  }
  const world = new THREE.Group();
  world.name = '林间空地';
  scene.add(world);
  scene.background = new THREE.Color(0x92aaac);
  scene.fog = new THREE.Fog(0x88a19e, 10.5, 49);
  const sky = new THREE.HemisphereLight(0xb9dcf3, 0x43594f, 1.17);
  const sun = new THREE.DirectionalLight(0xffdc93, 2.8);
  sun.position.set(-14, 21, -9);
  sun.target.position.set(1, 0, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {left: -23, right: 23, top: 23, bottom: -23, near: .4, far: 65});
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = .025;
  sun.shadow.bias = -.00028;
  world.add(sky, sun, sun.target);
  const fill = new THREE.DirectionalLight(0xd6eae8, .78);
  fill.position.set(4, 7, 9);
  world.add(fill);

  // Each group of static scenery uses one draw call and flat geometric facets.
  function batch() { return {positions: [], colors: []}; }
  function triangle(group, a, b, c, shade) {
    const col = typeof shade === 'number' ? color(shade) : shade;
    group.positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) group.colors.push(col.r, col.g, col.b);
  }
  function quad(group, a, b, c, d, shade) {
    triangle(group, a, b, c, shade);
    triangle(group, a, c, d, shade);
  }
  function finish(group, name, castShadow, receiveShadow = true) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(group.positions,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(group.colors,3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({vertexColors: true, side: THREE.DoubleSide}));
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    world.add(mesh);
    return mesh;
  }
  const trees = batch(), plants = batch(), stones = batch(), litter = batch();

  function ground() {
    const positions = [], colors = [], uvs = [];
    const count = 74, step = 1.35, nodes = [];
    const soil = color(0x998562), sand = color(0xc2a778), moss = color(0x64794e), shade = color(0x405d4b);
    for (let i = 0; i <= count; i++) {
      nodes[i] = [];
      for (let j = 0; j <= count; j++) {
        const x = (i - count/2 + between(-.31,.31)) * step;
        const z = (j - count/2 + between(-.31,.31)) * step;
        const fine = noise(x * .38 + 7, z * .38 + 2);
        const wide = noise(x * .13 + 5, z * .13 - 3);
        const trail = Math.abs(x - (Math.sin(z * .24 - 1) * 1.6 + z * .27 - .7));
        const bare = clamp(1 - trail / (3.5 + wide * 3) + (fine - .5) * .6);
        const border = smooth(clamp((Math.hypot(x*.93, z*1.05) - 5) / 10));
        const col = moss.clone().lerp(shade, border*.65 + .3*(1-wide))
          .lerp(soil, clamp(bare*.95 + (wide-.4)*.9))
          .lerp(sand, bare*(.29 + fine*.3))
          .multiplyScalar(.85 + .23*wide + .13*fine);
        nodes[i][j] = {p:[x,height(x,z),z], c:col};
      }
    }
    function face(a,b,c) {
      const variation = between(.963,1.035);
      for (const node of [a,b,c]) {
        positions.push(...node.p);
        colors.push(node.c.r*variation,node.c.g*variation,node.c.b*variation);
        uvs.push(node.p[0]/8, node.p[2]/8);
      }
    }
    for (let i = 0; i<count; i++) for (let j = 0; j<count; j++) {
      const a=nodes[i][j], b=nodes[i][j+1], c=nodes[i+1][j+1], d=nodes[i+1][j];
      if (random()<.5) { face(a,b,c); face(a,c,d); }
      else { face(a,b,d); face(b,c,d); }
    }
    // A small repeatable grain gives the earth detail down to individual stones.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e4e4e4';
    ctx.fillRect(0,0,256,256);
    for(let i=0;i<8000;i++) {
      const value=Math.round(between(84,254));
      ctx.fillStyle='rgba('+value+','+value+','+value+','+between(.1,.33)+')';
      ctx.fillRect(random()*256,random()*256,between(.5,2.4),between(.4,1.1));
    }
    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 4;
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({vertexColors:true,map}));
    mesh.receiveShadow=true;
    world.add(mesh);
  }
  ground();

  function branch(group, from, to, startWidth, endWidth, sides, hex, phase = 0) {
    const axis = new THREE.Vector3(to[0]-from[0],to[1]-from[1],to[2]-from[2]).normalize();
    const tangent = new THREE.Vector3(0,0,1);
    if(Math.abs(axis.z)>.9) tangent.set(1,0,0);
    tangent.cross(axis).normalize();
    const bitangent = new THREE.Vector3().crossVectors(axis,tangent);
    const ring=(p,w,i)=>{
      const angle=phase+tau*i/sides, a=Math.cos(angle)*w, b=Math.sin(angle)*w;
      return [p[0]+a*tangent.x+b*bitangent.x,p[1]+a*tangent.y+b*bitangent.y,p[2]+a*tangent.z+b*bitangent.z];
    };
    for(let i=0;i<sides;i++) {
      const a=ring(from,startWidth,i), b=ring(from,startWidth,i+1);
      const c=ring(to,endWidth,i+1), d=ring(to,endWidth,i);
      quad(group,a,b,c,d,tint(hex,.83+.18*hash(i,10)));
      if(endWidth>0) triangle(group,d,c,to,hex);
    }
  }

  // Two rings of overlapping drooping sprays give each conifer a broken silhouette.
  function pine(x,z,h,spread,age = 1) {
    const y=height(x,z), phase=between(0,tau), lean=between(-.06,.06)*h;
    const bark=choose([0x534e3e,0x655b44,0x4f5144,0x635447]);
    const leaf=choose([0x24574b,0x2a5c47,0x345c46,0x375f4a,0x30584c,0x40694f]);
    const trunkWidth=h*between(.021,.029)*age;
    addObstacle(x,z,trunkWidth);
    const trunk=(t)=>[x+lean*t*t,y+h*t,z+lean*.35*t];
    branch(trees,trunk(0),trunk(.45),trunkWidth,trunkWidth*.65,7,bark,phase);
    branch(trees,trunk(.45),trunk(1),trunkWidth*.65,.02,6,bark,phase);
    if(h>7 && Math.hypot(x,z)<22) {
      for(let i=0;i<5;i++) {
        const angle=phase+i*tau/5;
        const tip=polar(x,y+.03,z,trunkWidth*between(2.8,4),angle);
        branch(trees,trunk(.05),tip,trunkWidth*.59,.018,4,bark,phase);
      }
    }
    const tiers = h > 7 ? 7 : 5;
    const base = between(.22,.38);
    for(let tier=0;tier<tiers;tier++) {
      const t=tier/tiers, level=base+t*(1-base);
      const origin=trunk(level);
      const length=spread*(1-.84*t)*between(.88,1.09);
      const layerHeight=h*(1-base)/tiers;
      const sides= Math.max(5,Math.round(8-t*2));
      const turn=phase+tier*2.41;
      const top=trunk(Math.min(1,level+layerHeight/h*1.7));
      for(let i=0;i<sides;i++) {
        const angle=turn+i/sides*tau;
        const tip=polar(origin[0], origin[1]-layerHeight*between(.03,.43),origin[2],length*between(.83,1.13),angle);
        const left=polar(origin[0],origin[1]+.13*layerHeight,origin[2],length*.57,angle-.55);
        const right=polar(origin[0],origin[1]+.06*layerHeight,origin[2],length*.60,angle+.55);
        const ridge=polar(origin[0],origin[1]+layerHeight*.35,origin[2],length*.64,angle+.03);
        triangle(trees,top,ridge,left,tint(leaf,between(1.00,1.25)));
        triangle(trees,top,right,ridge,tint(leaf,between(.85,1.14)));
        triangle(trees,left,ridge,tip,tint(leaf,between(.89,1.12)));
        triangle(trees,ridge,right,tip,tint(leaf,between(.74,.96)));
        const inner=trunk(level-.02);
        triangle(trees,left,tip,inner,tint(leaf,.62));
        triangle(trees,tip,right,inner,tint(leaf,.69));
      }
    }
    const top=trunk(1.025), center=trunk(.92);
    for(let i=0;i<5;i++) triangle(trees,top,polar(center[0],center[1],center[2],spread*.16,phase+(i+1)*tau/5),polar(center[0],center[1],center[2],spread*.16,phase+i*tau/5),leaf);
  }

  // A broken, distant ridge appears through gaps between the trees.
  for(let row=0;row<2;row++) {
    const z=-42-row*15;
    let last=null;
    for(let i=0;i<=30;i++) {
      const x=-64+i*4.5;
      const y=6+row*4+6*noise(i*.31,row+4)+2.6*noise(i,row+1);
      const top=[x,y,z+between(-1.5,1.5)], low=[x,-1,z+4];
      if(last) quad(stones,last.low,last.top,top,low,row ? 0x79908a : 0x607f73);
      last={top,low};
    }
  }
  for(let i=0;i<134;i++) {
    const x=between(-37,37),z=between(-39,15);
    if(z < -17 || (Math.abs(x)>17 && z<9)) pine(x,z,between(6.6,13),between(1.9,3.5));
  }
  for(let i=0;i<21;i++) {
    const x=-24+i*2.45+between(-.8,.8), z=between(-20,-12.5);
    pine(x,z,between(7.5,13),between(2.2,3.6));
  }
  for(const [x,z,h,w] of [
    [-11,-6,12,3.5],[-8.8,-10,11,3],[-6.1,-13.9,10,3],[-2.1,-15.4,13.2,3.5],
    [2.8,-14.3,10.5,2.8],[7.2,-12,11.2,3.25],[11.6,-5.6,13,3.2],
    [12.8,-.6,10.3,2.4],[-14,2.7,11.9,3.1],[-10.5,4.8,8.7,2.6],
    [15.8,8.5,10,3],[-17.2,10.6,11,3.2]
  ]) pine(x,z,h,w);

  function boulder(x,z,w,h,d,base = 0, mossy = true) {
    if(w>=.49 && h>=.35) {
      const r=Math.min(w,d)*.9;
      addObstacle(x-(w-d),z,r,x+(w-d),z);
    }
    const y=height(x,z)+base-.07;
    const phase=between(0,tau), n=Math.round(between(5,8));
    const stone=choose([0x68796f,0x5a6c64,0x788477,0x828977,0x6f7e73,0x536a62]);
    const moss=choose([0x81935c,0x91a169,0x778c55,0x9eac73]);
    const rings=[[],[],[]];
    const drift=between(-.16,.18);
    for(let i=0;i<n;i++) {
      const a=phase+i*tau/n, r=between(.86,1.13);
      const dx=Math.cos(a)*w*r,dz=Math.sin(a)*d*r;
      rings[0].push([x+dx*.81,y,z+dz*.82]);
      rings[1].push([x+dx,y+h*between(.35,.60),z+dz]);
      rings[2].push([x+dx*.59+w*drift,y+h*between(.83,.98),z+dz*.65]);
    }
    for(let i=0;i<n;i++) {
      const j=(i+1)%n;
      quad(stones,rings[0][i],rings[1][i],rings[1][j],rings[0][j],tint(stone,between(.59,.81)));
      quad(stones,rings[1][i],rings[2][i],rings[2][j],rings[1][j],tint(stone,between(.89,1.12)));
      triangle(stones,rings[2][i],[x+w*drift,y+h,z],rings[2][j],tint(mossy?moss:stone,between(.93,1.07)));
    }
  }
  const gardens=[[-8.7,-4,1.3],[-6.7,-8,1.0],[8.8,-5.1,1.4],[8.9,.9,.94],
    [-8.4,4.8,1.1],[7.6,6.4,1],[-5,-11,1.25],[3.9,-12,1.8],[-12,.8,1.8],[12,3,1.6]];
  for(const [x,z,s] of gardens) {
    boulder(x,z,s,s*between(.68,1.03),s*between(.63,.88));
    for(let i=0;i<5;i++) {
      const a=between(0,tau), r=between(.7,2)*s, w=between(.14,.58)*s;
      boulder(x+Math.cos(a)*r,z+Math.sin(a)*r,w,w*between(.48,.86),w*between(.65,.9));
    }
  }

  function frond(x,z,size) {
    const y=height(x,z)+.015, turn=between(0,tau);
    const greens=[0x628b55,0x467351,0x7f995e,0x577f48,0x3f744d];
    for(let k=0;k<7;k++) {
      const a=turn+k*tau/7+between(-.23,.23), len=size*between(.6,1.05);
      const dx=Math.cos(a), dz=Math.sin(a);
      const at=t=>[x+dx*len*t,y+len*(Math.sin(t*Math.PI*.78)*.59+t*.09),z+dz*len*t];
      const hex=choose(greens);
      for(let j=0;j<6;j++) {
        const t=.07+j/6*.83, start=at(t), next=at(t+.15);
        const breadth=len*(1-t)*.28;
        triangle(plants,start,[next[0]-dz*.014,next[1],next[2]+dx*.014],next,hex);
        for(const side of [-1,1]) {
          const tip=at(t+.24);
          tip[0]-=dz*breadth*side;
          tip[2]+=dx*breadth*side;
          tip[1]+=.055*len;
          triangle(plants,start,tip,at(t+.128),tint(hex,between(.9,1.1)));
        }
      }
    }
  }
  function tuft(x,z,w,meadow = false) {
    const y=height(x,z)+.005;
    const hex=meadow?choose([0x8c9262,0x92916a,0x879067]):choose([0x71834d,0x648052,0x4a6e48,0x809059,0x91a064]);
    const phase=between(0,tau), n=meadow?4:6;
    for(let i=0;i<n;i++) {
      const a=phase+i*tau/n+between(-.25,.25), dx=Math.cos(a), dz=Math.sin(a);
      const r=between(.34,.89)*w, off=w*between(.01,.24), thick=w*between(.045,.11), high=w*between(.61,1.25);
      const bx=x+dx*off,bz=z+dz*off;
      const left=[bx+dz*thick,y,bz-dx*thick], right=[bx-dz*thick,y,bz+dx*thick];
      const mid=[bx+dx*r*.6,y+high*.64,bz+dz*r*.6];
      const tip=[bx+dx*r,y+high,bz+dz*r];
      triangle(plants,left,right,mid,tint(hex,.87));
      triangle(plants,left,mid,tip,tint(hex,1.04));
    }
  }
  for(const [x,z,s] of gardens) {
    for(let i=0;i<11;i++) {
      const a=between(0,tau), r=between(.8,2.3)*s;
      const px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r;
      if(i<3) frond(px,pz,between(.52,.99)*s);
      else tuft(px,pz,between(.23,.53)*s);
    }
  }
  for(const [x,z,s] of [[-6.3,4.9,.99],[-6.7,5.4,.75],[-5.8,5.75,.82],[7,5.4,1.14],[6.2,5.8,.77],[5.9,6.2,.84],[-8.9,.7,1.1],[8.9,-1.2,.92]]) frond(x,z,s);
  for(let i=0;i<830;i++) {
    const x=between(-19,19),z=between(-18,15),r=Math.hypot(x*.93,z);
    if(r<6 && random()<.92) continue;
    if(r<10 && random()<.44) continue;
    if(noise(x*.46,z*.46)<.29) continue;
    if(r>9 && random()<.13) frond(x,z,between(.38,.8));
    else tuft(x,z,between(.11,r<7 ? .25 : .46),r<8);
  }

  // Eroded waystone with pale-gold inlay on the south face.
  function waystone(x,z,s,tilt) {
    addObstacle(x-.25*s,z,.28*s,x+.23*s,z);
    const y=height(x,z);
    const front=.28*s;
    const shape=[[-.47,0],[-.52,1.42],[-.31,2.07],[.22,2.29],[.48,1.88],[.43,.18],[.24,0]];
    const at=(p,depth)=>[x+(p[0]+p[1]*tilt)*s,y+p[1]*s,z+depth];
    const center=at([-.04,1.08],front+.014*s);
    for(let i=0;i<shape.length;i++) {
      const a=shape[i],b=shape[(i+1)%shape.length];
      triangle(stones,center,at(b,front),at(a,front),tint(0x697a72,.87+.15*(i%3)/2));
      quad(stones,at(a,front),at(b,front),at(b,-front),at(a,-front),tint(0x708073,.67+.18*(i%4)/3));
    }
    const rune=[[[0,1.78],[-.19,1.46]], [[-.19,1.46],[0,1.16]], [[0,1.16],[.18,1.46]],
      [[.18,1.46],[0,1.78]], [[0,1.80],[0,1.38]], [[-.17,1.04],[0,.84]], [[0,.84],[.16,1.04]],
      [[0,.85],[0,.43]], [[-.26,1.79],[-.21,1.89]], [[.24,1.84],[.3,1.76]]];
    for(const [a,b] of rune) {
      const thick=.015, vx=b[0]-a[0],vy=b[1]-a[1],len=Math.hypot(vx,vy);
      const p=[-vy/len*thick,vx/len*thick], depth=front+.023*s;
      quad(stones,at([a[0]-p[0],a[1]-p[1]],depth),at([b[0]-p[0],b[1]-p[1]],depth),
        at([b[0]+p[0],b[1]+p[1]],depth),at([a[0]+p[0],a[1]+p[1]],depth),0xc9bd8b);
    }
    boulder(x-.45*s,z+.21*s,.65*s,.33*s,.47*s);
  }
  waystone(-7.45,-4.3,1.18,-.055);
  waystone(9.2,-6,.89,.19);

  function log(x,z,a,length,radius) {
    const y=height(x,z)+radius*.64;
    const end=[x+Math.cos(a)*length,y+radius*.27,z+Math.sin(a)*length];
    addObstacle(x,z,radius,end[0],end[2]);
    const start=[x,y,z], dx=Math.cos(a), dz=Math.sin(a);
    branch(stones,start,end,radius,radius*.85,8,0x625440,.1);
    // Separate concentric end-grain disks remain visible from across the clearing.
    for(const [p,sign,baseR] of [[start,-1,radius],[end,1,radius*.85]]) {
      for(let ring=0;ring<3;ring++) {
        const center=[p[0]+dx*sign*(ring+1)*.013,p[1],p[2]+dz*sign*(ring+1)*.013];
        const size=baseR*[.87,.6,.27][ring];
        for(let i=0;i<8;i++) {
          const rim=j=>[center[0]-dz*Math.cos(j*tau/8)*size,center[1]+Math.sin(j*tau/8)*size,center[2]+dx*Math.cos(j*tau/8)*size];
          triangle(stones,center,rim(i),rim(i+1),[0xa38b5d,0x85704b,0xbea672][ring]);
        }
      }
    }
    const fork=point(start,end,.47);
    branch(stones,fork,[fork[0]+.3,y+radius*2.7,fork[2]-.1],radius*.38,.05,5,0x665640);
  }
  log(7.9,3.8,-1.25,2.3,.31);
  log(-11.4,-2.0,-1.4,3.8,.32);
  log(4.9,-9.7,.13,3.1,.29);

  // Small leaf shapes and half-buried shale read at the feet of the characters.
  for(let i=0;i<1550;i++) {
    const x=between(-17,17), z=between(-16,13);
    if(noise(x*.53,z*.53)<.32) continue;
    const y=height(x,z)+between(.015,.035),a=between(0,tau);
    const r=between(.033,.134)*(Math.hypot(x,z)>6?1.3:1);
    const w=r*between(.25,.54),dx=Math.cos(a),dz=Math.sin(a);
    const A=[x-dx*r,y,z-dz*r],B=[x+dx*r,y,z+dz*r];
    const C=[x+dz*w,y,z-dx*w],D=[x-dz*w,y+.007,z+dx*w];
    const col=choose([0x8a8455,0x777b51,0x626f4b,0xa59c6b,0xb8a874,0x898d76]);
    triangle(litter,A,D,B,col);
    triangle(litter,A,B,C,tint(col,.87));
  }
  finish(stones,'Moss, shale and waystones',true);
  finish(trees,'Spruce canopy and bark',true);
  finish(plants,'Sword ferns and grass',false);
  finish(litter,'Forest litter',false);

  // Soft, projected canopy silhouettes bridge the direct shadows from actual trees.
  function canopyShade() {
    const canvas=document.createElement('canvas'), size=768, span=40;
    canvas.width=canvas.height=size;
    const ctx=canvas.getContext('2d'), px=size/span;
    const at=v=>(v/span+.5)*size;
    function stamp(x,z,r,width,color,angle=0) {
      ctx.save();
      ctx.translate(at(x),at(z));
      ctx.rotate(angle);
      ctx.scale(r*px,width*px);
      const gradient=ctx.createRadialGradient(0,0,.04,0,0,1);
      gradient.addColorStop(0,color);
      gradient.addColorStop(1,'rgba(9,28,27,0)');
      ctx.fillStyle=gradient;
      ctx.fillRect(-1,-1,2,2);
      ctx.restore();
    }
    for(const [x,z] of gardens) stamp(x,z,2.25,1.35,'rgba(20,37,34,.21)',.28);
    const edges=[[-8,-4,2.8],[-4.5,-8.8,2],[5,-7,3.2],[8,3,2.6],[-9,6,3.1],[6,10,3.6]];
    for(const [x,z,r] of edges) {
      for(let i=0;i<85;i++) {
        const a=between(0,tau),d=Math.sqrt(random())*r;
        stamp(x+Math.cos(a)*d,z+Math.sin(a)*d*.66,between(.22,.85),between(.18,.60),'rgba(15,36,35,.16)',a);
      }
    }
    // Long branching silhouettes fall toward the lower right, in the sun direction.
    for(const [x,z,length,angle] of [[-9,-3,8,.59],[-4.5,-7.4,8,.63],[3,-5.5,8,.78],[-8,5,5,.60],[6,0,6,.68]]) {
      const dx=Math.cos(angle), dz=Math.sin(angle);
      ctx.strokeStyle='rgba(12,36,33,.16)';
      ctx.lineCap='round';
      ctx.lineWidth=px*.10;
      ctx.beginPath(); ctx.moveTo(at(x),at(z)); ctx.lineTo(at(x+dx*length),at(z+dz*length)); ctx.stroke();
      for(let j=0;j<10;j++) {
        const t=j/10, reach=(1-t)*1.3+.22;
        for(const sign of [-1,1]) {
          const bx=x+dx*length*t, bz=z+dz*length*t;
          const ex=bx-dz*reach*sign+dx*.95, ez=bz+dx*reach*sign+dz*.95;
          ctx.beginPath();ctx.moveTo(at(bx),at(bz));ctx.lineTo(at(ex),at(ez));ctx.stroke();
          for(let k=0;k<6;k++) stamp(ex+between(-.42,.42),ez+between(-.32,.32),between(.19,.65),between(.15,.52),'rgba(15,37,35,.15)',angle);
        }
      }
    }
    // Store alpha separately from the tint so interpolation cannot produce
    // colored fringes in very low-opacity portions of the canopy shadows.
    const mask=ctx.getImageData(0,0,size,size);
    for(let i=0;i<mask.data.length;i+=4) {
      mask.data[i]=255;mask.data[i+1]=255;mask.data[i+2]=255;
    }
    ctx.putImageData(mask,0,0);
    const texture=new THREE.CanvasTexture(canvas);
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(span,span),new THREE.MeshBasicMaterial({
      map:texture,color:0x1b302b,transparent:true,depthWrite:false,opacity:.74
    }));
    mesh.rotation.x=-Math.PI/2;
    mesh.position.y=-.009;
    mesh.renderOrder=-1;
    world.add(mesh);
  }
  canopyShade();

  // A common soft-edged map is shared by the narrow shafts in the rear treeline.
  const beamCanvas=document.createElement('canvas');
  beamCanvas.width=96; beamCanvas.height=192;
  const bc=beamCanvas.getContext('2d');
  const horizontal=bc.createLinearGradient(0,0,96,0);
  horizontal.addColorStop(0,'rgba(255,241,196,0)');
  horizontal.addColorStop(.3,'rgba(255,241,196,.56)');
  horizontal.addColorStop(.58,'rgba(255,246,210,.76)');
  horizontal.addColorStop(1,'rgba(255,241,196,0)');
  bc.fillStyle=horizontal;bc.fillRect(0,0,96,192);
  bc.globalCompositeOperation='destination-in';
  const vertical=bc.createLinearGradient(0,0,0,192);
  vertical.addColorStop(0,'rgba(255,255,255,.45)');
  vertical.addColorStop(.28,'white');
  vertical.addColorStop(.66,'rgba(255,255,255,.78)');
  vertical.addColorStop(1,'rgba(255,255,255,0)');
  bc.fillStyle=vertical;bc.fillRect(0,0,96,192);
  const beamMat=new THREE.MeshBasicMaterial({
    map:new THREE.CanvasTexture(beamCanvas),color:0xffe1a1,transparent:true,opacity:.255,blending:THREE.AdditiveBlending,
    depthWrite:false,side:THREE.DoubleSide,fog:false
  });
  const beamPos=[],beamUV=[];
  for(const [x,z,w] of [[-5.7,-6,.85],[-4.15,-7,.37],[2,-8,1.15],[3.4,-8,.45],[7,-8,.66]]) {
    const h=between(8.5,11),tx=x-h*.65,tz=z-h*.42;
    const corners=[[x-w,.06,z],[x+w,.06,z],[tx+w*.56,h,tz],[tx-w*.56,h,tz]];
    const uv=[[0,0],[1,0],[1,1],[0,1]];
    for(const j of [0,1,2,0,2,3]) {beamPos.push(...corners[j]);beamUV.push(...uv[j]);}
  }
  const beamGeo=new THREE.BufferGeometry();
  beamGeo.setAttribute('position',new THREE.Float32BufferAttribute(beamPos,3));
  beamGeo.setAttribute('uv',new THREE.Float32BufferAttribute(beamUV,2));
  const beams=new THREE.Mesh(beamGeo,beamMat);
  beams.renderOrder=1;
  world.add(beams);

  const count=80, origins=[], coords=new Float32Array(count*3);
  for(let i=0;i<count;i++) origins.push([between(-12,12),between(.35,5),between(-13,8),between(0,tau)]);
  const pollenGeo=new THREE.BufferGeometry();
  const pollenAttr=new THREE.BufferAttribute(coords,3);
  pollenGeo.setAttribute('position',pollenAttr);
  const pollenCanvas=document.createElement('canvas');
  pollenCanvas.width=pollenCanvas.height=16;
  const pc=pollenCanvas.getContext('2d'),dot=pc.createRadialGradient(8,8,0,8,8,8);
  dot.addColorStop(0,'white');dot.addColorStop(.25,'rgba(255,252,207,.95)');dot.addColorStop(1,'rgba(255,230,163,0)');
  pc.fillStyle=dot;pc.fillRect(0,0,16,16);
  const pollen=new THREE.Points(pollenGeo,new THREE.PointsMaterial({map:new THREE.CanvasTexture(pollenCanvas),color:0xfbe0a3,
    transparent:true,size:.066,opacity:.76,blending:THREE.AdditiveBlending,depthWrite:false}));
  pollen.frustumCulled=false;
  world.add(pollen);
  let elapsed=0;
  function update(dt,time) {
    elapsed=Number.isFinite(time)?time:elapsed+(dt||0);
    for(let i=0;i<count;i++) {
      const a=origins[i],j=i*3;
      coords[j]=a[0]+Math.sin(elapsed*.18+a[3])*.47;
      coords[j+1]=a[1]+Math.sin(elapsed*.31+a[3])*.23;
      coords[j+2]=a[2]+Math.cos(elapsed*.22+a[3])*.37;
    }
    pollenAttr.needsUpdate=true;
  }
  update(0,0);
  return {update,radius:15,obstacles};
};
