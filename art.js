/* Small hand-drawn HUD illustrations, rendered at the native canvas resolution. */
(() => {
  function paint(canvas) {
    const ctx = canvas.getContext('2d');
    const kind = canvas.dataset.art;
    ctx.scale(canvas.width / 100, canvas.height / 100);
    const color = {
      portrait:['#53685e','#1b312e','#101d1a'], lunge:['#a57739','#4a3d21','#202820'],
      shield:['#519ba3','#224a51','#172b34'], whirl:['#9c849f','#53445c','#282835']
    }[kind];
    const grad = (x,y,x2,y2,stops) => {
      const g = ctx.createLinearGradient(x,y,x2,y2);
      stops.forEach((c,i) => g.addColorStop(i/(stops.length-1),c));
      return g;
    };
    const path = (d,fill,stroke,width=1) => {
      const p = new Path2D(d);
      if(fill){ctx.fillStyle=fill;ctx.fill(p);}
      if(stroke){ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.lineJoin='round';ctx.stroke(p);}
    };
    ctx.fillStyle=grad(10,0,90,100,color);ctx.fillRect(0,0,100,100);
    let seed=9371;
    const rand=() => ((seed=(seed*1664525+1013904223)>>>0)/4294967296);
    for(let i=0;i<360;i++){
      const x=rand()*110,y=rand()*110;
      ctx.globalAlpha=rand()*.12;ctx.strokeStyle=i%2?'#fff9bf':'#041011';
      ctx.lineWidth=rand()*1.4+.25;ctx.beginPath();ctx.moveTo(x,y);
      ctx.lineTo(x+rand()*12,y-rand()*11);ctx.stroke();
    }
    ctx.globalAlpha=1;
    if(kind==='portrait'){
      const steel=grad(18,18,80,75,['#ddddc3','#94a29a','#526666','#253b3e']);
      const lit=grad(27,13,51,52,['#fff1c9','#c7cdc0','#778d88']);
      const shadow=grad(44,25,89,58,['#8a9a90','#4f6767','#273b3d']);
      path('M-4 104L-2 86 20 74 35 68 62 68 95 82 104 96 104 105Z','#163b41');
      path('M-3 99L4 85 25 75 40 76 50 90 38 102Z',steel,'#223a3a',1.5);
      path('M-2 95L8 85 26 78 38 79 33 84 16 86Z','#c4cec0');
      path('M6 95L23 87 38 85 34 90 17 95Z','#536e70');
      path('M53 88L67 73 93 81 103 96 101 105 65 104Z',shadow,'#253d3e',1.6);
      path('M66 76L78 75 95 83 102 92 86 87 68 85Z','#a1afa3');
      path('M24 99L37 88 65 83 74 90 67 102Z','#25434e');
      path('M33 65L39 79 53 87 69 74 70 61Z','#233c3f','#303e3b');
      path('M35 71L53 81 66 74 59 82 53 84 39 78Z','#b1b6a1');
      path('M22 38Q21 18 38 11Q60 0 74 15L81 30 80 48 71 63 56 76 34 66 24 55Z',steel,'#223532',2);
      path('M23 36Q21 15 41 10L54 8 43 19 36 34Z',lit);
      path('M54 8Q69 7 76 21L80 31 61 27 46 30Z',shadow);
      path('M36 32L45 17 57 6 60 7 48 23 44 33Z','#c3b388');
      path('M24 35L41 33 59 27 81 30 81 36 61 34 44 40 26 42Z','#a5b2a6','#4c605b',1);
      path('M26 42L43 40 59 34 80 35 77 43 54 46 44 50 30 49Z','#15282a');
      path('M26 45L43 46 56 40 61 39 57 56 43 72 30 63Z',lit,'#5d716e',1);
      path('M61 39L76 39 75 53 66 64 46 73 57 56Z',shadow,'#455a59',1);
      path('M55 42L61 37 61 51 54 61 43 72 51 56Z','#ccd0bb');
      path('M29 50L33 52 36 62 32 59ZM34 49L37 50 41 61 37 58ZM39 48L42 48 45 57 42 55Z','#526560');
      path('M63 50L72 46 72 48 63 53ZM62 55L70 51 69 54 61 58Z','#263e40');
      path('M24 37L31 36 31 41 26 42Z','#dde0c6');
      path('M20 70L35 66 40 72 30 77 23 76Z','#32515a');
      path('M33 79L40 76 50 85 45 89Z','#b7a271');
    } else if(kind==='lunge'){
      for(let i=0;i<22;i++){
        let x=rand()*105-27,y=rand()*105;
        path('M'+x+' '+y+'l'+(18+rand()*45)+' '+(-8-rand()*27),'',i%3===0?'#efd39466':'#cf985b55',rand()*1.9+.5);
      }
      path('M-8 94Q20 54 78 24Q46 51 18 88L29 71Z','#d59c4c88');
      path('M-2 89Q27 50 90 13Q44 52 22 78L29 58Z','#f5ca7a99');
      path('M23 70L76 15 94 6 86 25 38 74 30 79Z','#fbe6aa','#785c3d',1.3);
      path('M29 72L91 9 82 23 34 75Z',grad(31,70,88,11,['#9c8d68','#d4ceaa','#fff8d4']));
      path('M25 72L11 88 13 92 18 91 33 77Z','#51452c','#d8b279',1.5);
      path('M12 66L17 63 26 65 34 73 43 78 45 84 38 82 29 76 20 70Z','#d8b479','#6f5a39',1);
      path('M11 88L17 93 14 97 8 92Z','#f1cf8a');
    } else if(kind==='shield'){
      for(let i=0;i<13;i++){
        const s=i*4;
        path('M-13 '+(89-s)+'Q19 '+(90-s)+' 58 '+(38-s*.35),'',i%3===0?'#c0e9d8a6':'#70bfd0a3',i%3===0?2:1);
      }
      path('M-5 95Q21 88 56 53Q34 79 9 89Z','#c0eaddaa');
      ctx.save();ctx.translate(58,43);ctx.rotate(.49);
      path('M0 -31Q11 -24 26 -23L25 1Q21 25 0 38Q-20 25 -25 1L-27 -23Q-10 -24 0 -31Z',grad(-24,-23,23,25,['#fff0bc','#adbcac','#5c939d','#dae0ba']),'#21434b',1.8);
      path('M0 -26Q10 -20 22 -20L20 1Q17 21 0 32Q-16 21 -20 1L-22 -19Q-8 -20 0 -26Z',grad(-18,-16,17,24,['#92cad0','#386e83','#225261']),'#406874',1.7);
      path('M0 -23L1 26-12 12-17 -15Z','#6aa4aa');
      path('M0 -23L2 0 16 -12 5 5 2 20 0 26 -1 8 -14 -9 -3 -1Z','#d5dbc4');
      path('M-2 -6L5 1 0 9 -7 2Z','#c1b47e','#65888d');
      ctx.restore();
    } else {
      ctx.save(); ctx.translate(51,52);ctx.rotate(-.39);
      path('M-51 11C-56 -20 -12 -40 24 -28C-11 -33 -49 -10 -43 7C-40 16 -25 19 -12 18C-27 24 -48 22 -51 11Z','#cabcce');
      path('M-34 28C-4 38 41 21 49 -5C60 24 5 48 -34 28Z','#dfd3e6');
      path('M-37 17C-7 25 37 8 38 -12C46 4 20 21 -7 25Z','#8da2b5');
      path('M-45 4C-43 -13 -18 -28 8 -31C-18 -25 -37 -11 -45 4Z','#f1e5cd');
      path('M-9 -23Q6 -36 33 -28L35 -24Q15 -29 -9 -23Z','#9d9cb1');
      path('M-12 14L22 -16 36 -25 28 -11 -5 19Z','#dddcd4','#5d6777',1);
      path('M-8 16L34 -23 25 -10 -4 17Z','#9bafbc');
      path('M-20 8L-15 7 -5 17 3 21 5 26 -2 24 -10 19 -17 13Z','#e0c399');
      path('M-10 17L-23 27 -20 31 -6 20Z','#9b876e');
      ctx.restore();
    }
    if(kind!=='portrait'){
      for(let i=0;i<28;i++){
        let x=rand()*100,y=rand()*100,s=rand()*1.1+.5;
        path('M'+x+' '+(y-s*1.6)+'l'+(s*.5)+' '+s+' '+s+' '+(s*.4)+' '+(-s)+' '+(s*.6)+' '+(-s*.5)+' '+s+' '+(-s*.4)+' '+(-s)+' '+(-s)+' '+(-s*.6)+' '+s+' '+(-s*.4)+'Z','#f9e7bd99');
      }
    }
    const edge=ctx.createRadialGradient(48,43,28,50,50,74);edge.addColorStop(0,'#07120e00');edge.addColorStop(1,'#07120e63');
    ctx.fillStyle=edge;ctx.fillRect(0,0,100,100);
  }
  document.querySelectorAll('canvas[data-art]').forEach(paint);
})();
