/* Grain field.
   One WebGL2 point cloud that settles into a different figure for each section,
   like sand on a vibrating plate. No libraries. Figures live in float textures;
   the vertex shader morphs between two of them and adds each figure's motion. */
(function () {
  'use strict';

  var canvas = document.getElementById('field');
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var gl = canvas && canvas.getContext('webgl2', {
    alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'high-performance'
  });
  if (!gl) { document.documentElement.classList.add('no-field'); return; }

  var phone = innerWidth < 820 || matchMedia('(pointer: coarse)').matches;
  var lowMem = (navigator.deviceMemory || 8) <= 4;
  var target = phone ? 56000 : lowMem ? 100000 : 160000;
  var TEX = Math.ceil(Math.sqrt(target));
  var N = TEX * TEX;

  /* Figure motion lives here so positions stay on the GPU. A texel is xyz + w,
     where floor(w) is a channel for the figure and fract(w) is tone:
     under .5 is base colour at rising strength, .5 and above is stamp red. */
  var VS = '#version 300 es\n' +
  'precision highp float;precision highp int;precision highp sampler2D;\n' +
  'uniform sampler2D uA,uB,uR;uniform int uW,uKA,uKB;\n' +
  'uniform float uMix,uT,uNoise,uAgit,uAspect,uScale,uPx,uSize,uAlpha,uForce,uCalm,uDof;\n' +
  'uniform vec2 uOff,uPtr,uRot,uMode;\n' +
  'out float vA;out float vRed;\n' +
  'const float PI=3.14159265;const float D=3.2;\n' +
  'mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}\n' +
  'float chladni(vec2 u,out vec2 g){float a=uMode.x*PI,b=uMode.y*PI;' +
    'float f=cos(a*u.x)*cos(b*u.y)-cos(b*u.x)*cos(a*u.y);' +
    'g=vec2(-a*sin(a*u.x)*cos(b*u.y)+b*sin(b*u.x)*cos(a*u.y),' +
    '-b*cos(a*u.x)*sin(b*u.y)+a*cos(b*u.x)*sin(a*u.y));return f;}\n' +
  'vec3 figure(vec4 s,int kind,vec4 r,out float alpha,out float red){\n' +
  '  float chan=floor(s.w),tone=fract(s.w);\n' +
  '  red=tone>=.5?1.:0.;alpha=tone<.5?.42+tone*1.16:tone;\n' +
  '  vec3 p=s.xyz;\n' +
  '  if(kind==1){\n' +                                         // traffic: light trails on a tilted city grid
  '    float L=2.8;\n' +
  '    if(chan<3.5){float dir=mod(chan,2.)<.5?1.:-1.;float v=(.13+.17*r.x)*dir;\n' +
  '      if(chan<1.5){p.x=mod(p.x+uT*v+L,2.*L)-L;alpha*=(.66+.34*sin(p.x*4.+r.y*2.5))*(1.-smoothstep(.78,1.,abs(p.x)/L));}\n' +
  '      else{p.z=mod(p.z+uT*v+L,2.*L)-L;alpha*=(.66+.34*sin(p.z*4.+r.y*2.5))*(1.-smoothstep(.78,1.,abs(p.z)/L));}\n' +
  '    }\n' +
  '    p.yz=rot(-1.0)*p.yz;p.y-=.02;\n' +
  '  }else if(kind==2){\n' +                                     // plate: Newton steps pull grains onto the nodal lines
  '    if(chan<.5){vec2 q=p.xy;vec2 g;\n' +
  '      for(int i=0;i<4;i++){vec2 u=(q+1.)*.5;float f=chladni(u,g);q-=f*g/(dot(g,g)+1.4)*1.;}\n' +
  '      q+=(r.yz-.5)*.016;q=clamp(q,-1.,1.);\n' +
  '      p.xy=q+(r.zw-.5)*.0035*sin(uT*61.+r.x*40.);\n' +
  '    }\n' +
  '    p.xy*=.92;\n' +
  '  }else if(kind==3){\n' +                                     // slow turn
  '    p.xz=rot(uT*.16)*p.xz;p.yz=rot(.42)*p.yz;\n' +
  '  }else if(kind==4){\n' +                                     // dunes
  '    float h=.17*sin(p.x*1.6+uT*.22)+.1*sin(p.z*2.4-uT*.18+p.x*.7)+.04*sin((p.x+p.z)*6.+uT*.34);\n' +
  '    alpha*=smoothstep(-.1,.2,h);p.y=h;p.yz=rot(-1.16)*p.yz;p.y-=.8;\n' +
  '    alpha*=1.-smoothstep(-.42,.02,p.y);\n' +
  '  }else if(kind==5){\n' +                                     // one clean string; the cursor plucks it
  '    float x=p.x;float y=.3*sin(2.1*x-uT*.85);\n' +
  '    vec2 w=vec2((uPtr.x-uOff.x)*uAspect,uPtr.y-uOff.y)/max(uScale,.01);\n' +
  '    float pull=exp(-(x-w.x)*(x-w.x)/.2)*uForce;y+=(w.y-y)*pull*.8;\n' +
  '    p=vec3(x,y+p.y,p.z);\n' +
  '  }else if(kind==6){\n' +                                     // conveyor: real block hides in the tunnel, predicted block shows there
  '    float L=1.75;float v=.27;\n' +
  '    if(chan>.5&&chan<1.5){p.x=mod(p.x+uT*v+L,2.*L)-L;alpha*=1.-smoothstep(.8,1.,abs(p.x)/L);}\n' +
  '    else if(chan>1.5){float ph=r.x<.5?0.:L;float c=mod(uT*v+ph+L,2.*L)-L;float x=c+p.x;\n' +
  '      float inT=step(-.8,c)*step(c,-.05);alpha*=(chan<2.5?1.-inT:inT)*(1.-smoothstep(.8,1.,abs(x)/L));p.x=x;}\n' +
  '  }else if(kind==7){\n' +                                     // satellite pass over fields
  '    float bx=mod(uT*.2,5.2)-2.6;alpha*=.72+.9*exp(-(p.x-bx)*(p.x-bx)/.02);\n' +
  '    p.yz=rot(-.34)*p.yz;\n' +
  '  }else if(kind==8){\n' +                                     // paper grain
  '    p.y=mod(p.y+uT*(.006+.012*r.y)+1.4,2.8)-1.4;\n' +
  '  }\n' +
  '  return p;\n' +
  '}\n' +
  'void main(){\n' +
  '  ivec2 ij=ivec2(gl_VertexID%uW,gl_VertexID/uW);\n' +
  '  vec4 r=texelFetch(uR,ij,0);\n' +
  '  float aA,aB,rA,rB;\n' +
  '  vec3 pa=figure(texelFetch(uA,ij,0),uKA,r,aA,rA);\n' +
  '  vec3 pb=figure(texelFetch(uB,ij,0),uKB,r,aB,rB);\n' +
  '  float d=r.x*.46;float k=smoothstep(d,d+.54,uMix);\n' +
  '  vec3 p=mix(pa,pb,k);\n' +
  '  float sw=sin(k*PI)*uCalm;\n' +
  '  p+=sw*.46*vec3(sin(p.y*2.7+uT*.6+r.y*6.28),sin(p.z*2.3+uT*.5+r.z*6.28),sin(p.x*2.9-uT*.4+r.w*6.28));\n' +
  '  float alpha=mix(aA,aB,k),red=mix(rA,rB,k);\n' +
  '  float nn=clamp(uNoise*1.4-r.w*.4,0.,1.);\n' +
  '  float g1=sqrt(-2.*log(max(r.x,1e-4))),g2=sqrt(-2.*log(max(r.z,1e-4)));\n' +
  '  vec3 g=vec3(g1*cos(6.283*r.y),g1*sin(6.283*r.y),g2*cos(6.283*r.w));\n' +
  '  g+=(r.wxy-.5)*.05*sin(uT*37.+r.z*70.);\n' +
  '  p=mix(p,g*vec3(.62*uAspect,.62,.5),nn*nn);\n' +
  '  alpha=mix(alpha,.8,nn);red*=1.-nn;\n' +
  '  p+=(r.zwx-.5)*uAgit*.11*sin(uT*47.+r.w*90.);\n' +
  '  p.xz=rot(uRot.y)*p.xz;p.yz=rot(uRot.x)*p.yz;\n' +
  '  float vz=D-p.z*uScale;float persp=D/max(vz,.2);\n' +
  '  vec2 ndc=p.xy*uScale*persp/vec2(uAspect,1.)+uOff;\n' +
  '  vec2 dv=(ndc-uPtr)*vec2(uAspect,1.);float f=exp(-dot(dv,dv)/.04)*uForce;\n' +
  '  ndc+=(normalize(dv+1e-4)*.05+(r.yz-.5)*.26)*f/vec2(uAspect,1.);\n' +
  '  alpha*=1.-.45*f;\n' +
  '  float coc=smoothstep(.72,2.2,abs(p.z*uScale))*uDof;\n' +
  '  float size=uSize*(.78+.44*r.z)*min(persp,1.8)+coc*3.6*uPx;\n' +
  '  alpha/=1.+coc*coc*8.;\n' +
  '  alpha*=step(vz,D*2.)*smoothstep(.2,.7,vz);\n' +
  '  gl_Position=vec4(ndc,0.,1.);gl_PointSize=size;\n' +
  '  vA=clamp(alpha,0.,1.)*uAlpha;vRed=red;\n' +
  '}';

  var FS = '#version 300 es\n' +
  'precision mediump float;uniform vec3 uFg,uRed;in float vA;in float vRed;out vec4 o;\n' +
  'void main(){float d=length(gl_PointCoord-.5);float a=(1.-smoothstep(.28,.5,d))*vA;\n' +
  'if(a<.004)discard;vec3 c=mix(uFg,uRed,step(.5,vRed));o=vec4(c*a,a);}';

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var prog = gl.createProgram();
  try {
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) {
    console.warn('Grain field disabled:', e);
    document.documentElement.classList.add('no-field');
    return;
  }
  gl.useProgram(prog);
  var U = {};
  ['uA','uB','uR','uW','uKA','uKB','uMix','uT','uNoise','uAgit','uAspect','uScale','uPx','uSize','uAlpha','uForce','uCalm','uDof','uOff','uPtr','uRot','uMode','uFg','uRed']
    .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
  gl.bindVertexArray(gl.createVertexArray());
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  /* Seeded RNG keeps figures identical between visits. */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeTex(data) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TEX, TEX, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  /* Random order means drawing fewer points thins every figure evenly. */
  function shuffle(a, R) {
    for (var i = N - 1; i > 0; i--) {
      var j = (R() * (i + 1)) | 0, i4 = i * 4, j4 = j * 4;
      for (var c = 0; c < 4; c++) { var t = a[i4 + c]; a[i4 + c] = a[j4 + c]; a[j4 + c] = t; }
    }
    return a;
  }
  function gauss(R) { return Math.sqrt(-2 * Math.log(Math.max(R(), 1e-5))) * Math.cos(6.2832 * R()); }

  var randTex = (function () {
    var R = rng(11), a = new Float32Array(N * 4);
    for (var i = 0; i < a.length; i++) a[i] = R();
    return makeTex(a);
  })();

  /* Draws into an offscreen canvas and returns a reader for its alpha. */
  function inkMask(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var x = c.getContext('2d', { willReadFrequently: true });
    draw(x, w, h);
    return x.getImageData(0, 0, w, h).data;
  }
  function fromMask(data, w, h, worldW, fill, R) {
    var a = new Float32Array(N * 4), s = worldW / w;
    for (var i = 0; i < N; i++) {
      var px, py, tries = 0;
      do {
        px = (R() * w) | 0; py = (R() * h) | 0; tries++;
      } while (data[(py * w + px) * 4 + 3] < 128 && tries < 4000);
      fill(a, i * 4, (px - w / 2) * s + (R() - .5) * s, (h / 2 - py) * s + (R() - .5) * s, px, py);
    }
    return a;
  }

  var FIG = {
    /* Stippled from the real photo: dark tones get more grains, edges get a boost. */
    portrait: {
      kind: 0, w: 1.34, h: 2, alpha: .95, max: 1.04,
      gen: function (R) {
        return new Promise(function (ok, no) {
          var img = new Image();
          img.onload = function () {
            var W = img.width, H = img.height, c = document.createElement('canvas');
            c.width = W; c.height = H;
            var x = c.getContext('2d', { willReadFrequently: true });
            x.drawImage(img, 0, 0);
            var d = x.getImageData(0, 0, W, H).data, lum = new Float32Array(W * H), blur = new Float32Array(W * H), i, px, py;
            for (i = 0; i < W * H; i++) lum[i] = d[i * 4] / 255;
            var rad = 4, xx, yy;
            for (py = 0; py < H; py++) for (px = 0; px < W; px++) {
              var sum = 0, cnt = 0;
              for (yy = -rad; yy <= rad; yy += 2) for (xx = -rad; xx <= rad; xx += 2) {
                var qx = px + xx, qy = py + yy;
                if (qx >= 0 && qy >= 0 && qx < W && qy < H) { sum += lum[qy * W + qx]; cnt++; }
              }
              blur[py * W + px] = sum / cnt;
            }
            var a = new Float32Array(N * 4), cx = 223, cy = 170, s = 2 / H;
            for (i = 0; i < N; i++) {
              var tries = 0, ok2 = false, l, p;
              while (!ok2 && tries++ < 3000) {
                px = (R() * W) | 0; py = (R() * H) | 0;
                var k = py * W + px;
                if (d[k * 4 + 3] < 90) continue;
                l = lum[k];
                var edge = Math.max(0, blur[k] - l) * 3.6;
                p = Math.pow(Math.max(0, 1.02 - l), 2.15) + edge + .008;
                // let the shirt and shoulders fall away so the face carries the figure
                var low = Math.min(1, Math.max(0, (py / H - .7) / .3));
                var wide = Math.min(1, Math.abs(px - cx) / 150);
                p *= 1 - .9 * low * (.55 + .45 * wide);
                ok2 = R() < p;
              }
              var wx = (px - cx) * s + (R() - .5) * s, wy = (cy - py) * s + (R() - .5) * s - .02;
              var dx = wx / .74, dy = (wy - .08) / .92, sph = Math.max(0, 1 - dx * dx - dy * dy);
              a[i * 4] = wx; a[i * 4 + 1] = wy;
              a[i * 4 + 2] = Math.sqrt(sph) * .58 - .1 + (l - .5) * .12;
              a[i * 4 + 3] = .2 + (1 - l) * .28;
            }
            ok(a);
          };
          img.onerror = no;
          img.src = window.PORTRAIT_MAP;
        });
      }
    },
    /* Speckled paper behind text-heavy sections. */
    dust: {
      kind: 8, w: 2, h: 2, alpha: .3, max: 1,
      gen: function (R) {
        var a = new Float32Array(N * 4);
        for (var i = 0; i < N; i++) {
          a[i * 4] = (R() * 2 - 1) * 3.6; a[i * 4 + 1] = (R() * 2 - 1) * 1.4;
          a[i * 4 + 2] = (R() * 2 - 1) * .9; a[i * 4 + 3] = R() * .12;
        }
        return a;
      }
    },
    dunes: {
      kind: 4, w: 2, h: 2, alpha: .8, max: 1, dof: .25,
      gen: function (R) {
        var a = new Float32Array(N * 4);
        for (var i = 0; i < N; i++) {
          a[i * 4] = (R() * 2 - 1) * 3.8; a[i * 4 + 2] = R() * 2.6 - .6;
          a[i * 4 + 3] = .05 + R() * .3;
        }
        return a;
      }
    },
    pramana: {
      kind: 0, w: 1.72, h: 1.05, alpha: .95, max: 1.25, font: "400 300px 'Tiro Devanagari Sanskrit'", sample: 'प्रमाण',
      gen: function (R) {
        var w = 1300, h = 640;
        var d = inkMask(w, h, function (x) {
          x.fillStyle = '#000'; x.textAlign = 'center'; x.textBaseline = 'middle';
          x.font = "400 330px 'Tiro Devanagari Sanskrit', serif";
          x.fillText('प्रमाण', w / 2, h / 2 + 10);
        });
        return fromMask(d, w, h, 2.5, function (a, i, X, Y) {
          a[i] = X + gauss(R) * .004; a[i + 1] = Y + gauss(R) * .004; a[i + 2] = gauss(R) * .06; a[i + 3] = .3 + R() * .18;
        }, R);
      }
    },
    /* Stacked hidden-state layers. Correct and hallucinated activations separate with depth. */
    layers: {
      kind: 3, w: 3.1, h: 2.75, alpha: .9, max: 1,
      gen: function (R) {
        var a = new Float32Array(N * 4), L = 8;
        for (var i = 0; i < N; i++) {
          var l = (R() * L) | 0, y = -.86 + l * (1.72 / (L - 1)), o = i * 4;
          if (R() < .1) {
            var t = R() * 2 - 1, side = R();
            a[o] = side < .5 ? t * 1.02 : (side < .75 ? 1.02 : -1.02);
            a[o + 2] = side < .5 ? (R() < .5 ? .72 : -.72) : t * .72;
            a[o + 1] = y; a[o + 3] = .12;
          } else {
            var sep = Math.pow(l / (L - 1), 1.1) * .56, bad = R() < .42;
            var x = (bad ? sep : -sep) + gauss(R) * .24, z = gauss(R) * .2;
            a[o] = Math.max(-1, Math.min(1, x)); a[o + 1] = y + gauss(R) * .004; a[o + 2] = Math.max(-.7, Math.min(.7, z));
            a[o + 3] = bad ? .9 : .28 + R() * .15;
          }
        }
        return a;
      }
    },
    /* Patchwork seen from orbit: each plot has its own row direction and vigour. */
    fields: {
      kind: 7, w: 4.6, h: 2.4, alpha: .92, max: 1, dof: .2,
      gen: function (R) {
        var seeds = [], i, S = 84;
        for (i = 0; i < S; i++) {
          seeds.push({
            x: (R() * 2 - 1) * 2.7, y: (R() * 2 - 1) * 1.45, ang: [0, .5, 1.57, 2.2, 1.1][(R() * 5) | 0] + (R() - .5) * .16,
            freq: 42 + R() * 70, keep: .25 + R() * .75, bad: R() < .09
          });
        }
        var a = new Float32Array(N * 4);
        for (i = 0; i < N; i++) {
          var x, y, tone = 0, ok = false, tries = 0;
          while (!ok && tries++ < 400) {
            x = (R() * 2 - 1) * 2.7; y = (R() * 2 - 1) * 1.45;
            var d1 = 1e9, d2 = 1e9, s = null;
            for (var j = 0; j < S; j++) {
              var dx = x - seeds[j].x, dy = (y - seeds[j].y) * 1.25, dd = dx * dx + dy * dy;
              if (dd < d1) { d2 = d1; d1 = dd; s = seeds[j]; } else if (dd < d2) d2 = dd;
            }
            if (Math.sqrt(d2) - Math.sqrt(d1) < .022) continue;
            var band = Math.sin((x * Math.cos(s.ang) + y * Math.sin(s.ang)) * s.freq);
            if (band < .18 || R() > s.keep) continue;
            tone = s.bad ? .85 : .08 + s.keep * .3; ok = true;
          }
          a[i * 4] = x; a[i * 4 + 1] = y; a[i * 4 + 2] = 0; a[i * 4 + 3] = tone;
        }
        return a;
      }
    },
    denied: {
      kind: 0, w: 2.5, h: 1.3, alpha: .96, max: 1, font: "900 200px Anybody",
      gen: function (R) {
        var w = 1300, h = 640;
        var blots = [];
        for (var b = 0; b < 170; b++) blots.push([R() * w, R() * h, 3 + R() * R() * 34]);
        var d = inkMask(w, h, function (x) {
          x.translate(w / 2, h / 2); x.rotate(-.13);
          x.lineWidth = 22; x.strokeStyle = '#000'; x.fillStyle = '#000';
          var rw = 1090, rh = 350, r = 34;
          x.beginPath(); x.moveTo(-rw / 2 + r, -rh / 2); x.arcTo(rw / 2, -rh / 2, rw / 2, rh / 2, r); x.arcTo(rw / 2, rh / 2, -rw / 2, rh / 2, r);
          x.arcTo(-rw / 2, rh / 2, -rw / 2, -rh / 2, r); x.arcTo(-rw / 2, -rh / 2, rw / 2, -rh / 2, r); x.closePath(); x.stroke();
          x.textAlign = 'center'; x.textBaseline = 'middle';
          x.font = "900 205px Anybody, Impact, sans-serif";
          x.fillText('DENIED', 0, 12);
          x.setTransform(1, 0, 0, 1, 0, 0);
          x.globalCompositeOperation = 'destination-out';
          blots.forEach(function (p) { x.beginPath(); x.arc(p[0], p[1], p[2], 0, 7); x.fill(); });
        });
        return fromMask(d, w, h, 2.5, function (a, i, X, Y) {
          a[i] = X; a[i + 1] = Y; a[i + 2] = gauss(R) * .03; a[i + 3] = .82 + R() * .17;
        }, R);
      }
    },
    undeny: {
      kind: 0, w: 2.5, h: 1, alpha: .96, max: 1, font: "900 200px Anybody",
      gen: function (R) {
        var w = 1300, h = 640, cut = 0;
        var d = inkMask(w, h, function (x) {
          x.fillStyle = '#000'; x.textAlign = 'left'; x.textBaseline = 'middle';
          x.font = "900 262px Anybody, Impact, sans-serif";
          var un = x.measureText('Un').width, all = x.measureText('UnDeny').width, left = (w - all) / 2;
          cut = left + un;
          x.fillText('UnDeny', left, h / 2 + 8);
        });
        return fromMask(d, w, h, 2.5, function (a, i, X, Y, px) {
          a[i] = X; a[i + 1] = Y; a[i + 2] = gauss(R) * .03; a[i + 3] = px < cut ? .92 : .3 + R() * .18;
        }, R);
      }
    },
    /* Long-exposure city grid. Channels 0-3 are the four traffic directions. */
    traffic: {
      kind: 1, w: 3.2, h: 2, alpha: 1, max: 1.1, dof: .16, size: 1.5,
      gen: function (R) {
        var a = new Float32Array(N * 4), L = 2.8;
        var xs = [-1.95, -.9, .05, 1.05, 2.05], zs = [-2.2, -1.2, -.35, .5, 1.35];
        for (var i = 0; i < N; i++) {
          var o = i * 4, u = R();
          if (u < .05) {
            a[o] = (R() * 2 - 1) * L; a[o + 2] = (R() * 2 - 1) * L; a[o + 1] = 0; a[o + 3] = 4 + .03;
          } else if (u < .07) {
            // camera frames at a few intersections
            var ci = [[2, 3], [3, 2], [3, 3], [1, 4]][(R() * 4) | 0], s = .15, e = R() * 2 - 1, side = (R() * 4) | 0;
            a[o] = xs[ci[0]] + (side < 2 ? e * s : (side === 2 ? s : -s));
            a[o + 2] = zs[ci[1]] + (side < 2 ? (side ? s : -s) : e * s);
            a[o + 1] = .004; a[o + 3] = 4 + .85;
          } else {
            var horiz = R() < .5, dirFwd = R() < .5, lane = (.02 + R() * .016) * (dirFwd ? 1 : -1);
            var chan = (horiz ? 0 : 2) + (dirFwd ? 0 : 1);
            var along = (R() * 2 - 1) * L;
            if (horiz) { a[o] = along; a[o + 2] = zs[(R() * zs.length) | 0] + lane; }
            else { a[o] = xs[(R() * xs.length) | 0] + lane; a[o + 2] = along; }
            a[o + 1] = 0;
            a[o + 3] = chan + (dirFwd ? .25 + R() * .2 : .75 + R() * .24);
          }
        }
        return a;
      }
    },
    /* Square plate. Channel 0 grains are pulled to nodal lines in the shader. */
    plate: {
      kind: 2, w: 2, h: 2, alpha: .95, max: .9,
      gen: function (R) {
        var a = new Float32Array(N * 4);
        for (var i = 0; i < N; i++) {
          var o = i * 4;
          if (R() < .035) {
            var t = R() * 2 - 1, s = (R() * 4) | 0, m = 1 + (R() - .5) * .006;
            a[o] = s < 2 ? t : (s === 2 ? m : -m); a[o + 1] = s < 2 ? (s ? m : -m) : t; a[o + 3] = 1 + .2;
          } else {
            a[o] = R() * 2 - 1; a[o + 1] = R() * 2 - 1; a[o + 3] = .2 + R() * .25;
          }
          a[o + 2] = 0;
        }
        return a;
      }
    },
    /* Side view of the pick-and-place cell: 7-DOF arm, belt, occlusion tunnel. */
    arm: {
      kind: 6, w: 2.75, h: 1.9, alpha: .95, max: 1,
      gen: function (R) {
        var a = new Float32Array(N * 4), parts = [], total = 0;
        function add(weight, fn) { total += weight; parts.push([total, fn]); }
        function capsule(ax, ay, bx, by, r, w) {
          add(w, function (o) {
            var t = R(), ang = R() * 6.2832, rim = R() < .45, rr = r * (rim ? .97 + R() * .03 : Math.sqrt(R()));
            var dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
            var side = (R() * 2 - 1) * (rim ? (R() < .5 ? 1 : -1) : 1);
            var x = ax + dx * t + nx * side * r * (rim ? .98 : Math.abs(rr / r)), y = ay + dy * t + ny * side * r * (rim ? .98 : Math.abs(rr / r));
            if (R() < .24) { var e = R() < .5; x = (e ? ax : bx) + Math.cos(ang) * rr; y = (e ? ay : by) + Math.sin(ang) * rr; }
            a[o] = x; a[o + 1] = y; a[o + 2] = gauss(R) * .012; a[o + 3] = .1 + R() * .18;
          });
        }
        function ring(cx, cy, r, w, tone) {
          add(w, function (o) {
            var an = R() * 6.2832, rr = r * (.86 + R() * .14);
            a[o] = cx + Math.cos(an) * rr; a[o + 1] = cy + Math.sin(an) * rr; a[o + 2] = .02; a[o + 3] = tone;
          });
        }
        var by = -.56;
        capsule(1.02, -.86, 1.02, -.16, .14, 5.2);
        capsule(1.02, -.16, .64, .52, .115, 4.6);
        capsule(.64, .52, .2, .36, .095, 3.4);
        capsule(.2, .36, .28, .1, .075, 1.9);
        capsule(.22, .08, .2, -.17, .018, .7);
        capsule(.34, .08, .36, -.17, .018, .7);
        capsule(.2, .08, .36, .08, .022, .5);
        [[1.02, -.62], [1.02, -.16], [.84, .17], [.64, .52], [.42, .44], [.2, .36], [.28, .1]].forEach(function (j) {
          ring(j[0], j[1], .052, .34, .92);
        });
        add(9, function (o) { // belt surface flows
          a[o] = (R() * 2 - 1) * 1.75; a[o + 1] = by + (R() - .5) * .018; a[o + 2] = 0; a[o + 3] = 1 + .34;
        });
        add(3.2, function (o) { // belt underside and frame
          a[o] = (R() * 2 - 1) * 1.7; a[o + 1] = by - .09 + (R() - .5) * .01; a[o + 2] = 0; a[o + 3] = .22;
        });
        add(6, function (o) { // tunnel: hatched arch over the belt
          var x, y, t;
          do { x = -.8 + R() * .75; y = by + R() * .36; t = Math.sin((x + y) * 68); } while (t < .25);
          a[o] = x; a[o + 1] = y; a[o + 2] = .04; a[o + 3] = .3 + R() * .15;
        });
        add(1.6, function (o) { // block, seen
          a[o] = (R() - .5) * .13; a[o + 1] = by + .01 + R() * .13; a[o + 2] = .06; a[o + 3] = 2 + .4;
        });
        add(1.6, function (o) { // block, predicted while hidden
          a[o] = (R() - .5) * .13; a[o + 1] = by + .01 + R() * .13; a[o + 2] = .08; a[o + 3] = 3 + .95;
        });
        for (var i = 0; i < N; i++) {
          var u = R() * total, k = 0;
          while (parts[k][0] < u) k++;
          parts[k][1](i * 4);
        }
        return a;
      }
    },
    /* The last figure: everything on one clean line. */
    string: {
      kind: 5, w: 2, h: 2, alpha: .96, max: 1,
      gen: function (R) {
        var a = new Float32Array(N * 4);
        for (var i = 0; i < N; i++) {
          a[i * 4] = (R() * 2 - 1) * 3.7; a[i * 4 + 1] = gauss(R) * .0028; a[i * 4 + 2] = gauss(R) * .002; a[i * 4 + 3] = .46;
        }
        return a;
      }
    }
  };

  var ready = {};
  function store(name, data, R) {
    FIG[name].tex = makeTex(shuffle(data, R));
    ready[name] = true;
  }
  function build(name) {
    var def = FIG[name], R = rng(name.length * 1307 + name.charCodeAt(0));
    var make = function () { return Promise.resolve(def.gen(R)).then(function (d) { store(name, d, R); }); };
    if (def.font && document.fonts) return document.fonts.load(def.font, def.sample || 'A').then(make, make);
    return make();
  }

  /* Portrait first so the opening never waits. The rest build between frames. */
  var queue = ['dunes', 'dust', 'pramana', 'layers', 'fields', 'denied', 'undeny', 'traffic', 'plate', 'arm', 'string'];
  function buildNext() {
    var name = queue.shift();
    if (!name) { api.complete = true; return; }
    build(name).then(function () {
      if (window.requestIdleCallback) requestIdleCallback(buildNext, { timeout: 300 });
      else setTimeout(buildNext, 30);
    });
  }

  var hexRGB = function (h) { return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]; };
  var TONES = {
    plate: { fg: hexRGB('#11180F'), red: hexRGB('#CF2C14') },
    night: { fg: hexRGB('#D6EBC9'), red: hexRGB('#FF6B47') }
  };

  var api = {
    N: N, complete: false, noise: reduced ? 0 : 1, figures: FIG,
    target: { a: 'portrait', b: 'portrait', mix: 0 },
    layouts: {},
    mode: { n: 3, m: 5 },
    pointer: { x: 9, y: 9, on: 0 },
    agitate: 0,
    setTone: function (t) { toneGoal = TONES[t] || TONES.plate; },
    layoutFor: function (name, l) { api.layouts[name] = l; }
  };
  var toneGoal = TONES.plate;
  var fg = TONES.plate.fg.slice(), red = TONES.plate.red.slice();

  var cur = api.cur = { a: 'portrait', b: 'portrait', mix: 0 };
  var L = { ox: 0, oy: 0, s: 1 }, P = { x: 9, y: 9, f: 0 }, rot = { x: 0, y: 0 }, agit = 0;
  var dpr = 1, W = 0, H = 0, frameMs = 16, drawN = N, sizeK = 1, last = 0, frames = 0, born = 0, dirty = true;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, phone ? 1.6 : 1.75);
    W = Math.round(innerWidth * dpr); H = Math.round(innerHeight * dpr);
    canvas.width = W; canvas.height = H;
    gl.viewport(0, 0, W, H);
    dirty = true;
  }
  addEventListener('resize', resize);
  resize();

  addEventListener('pointermove', function (e) {
    api.pointer.x = e.clientX / innerWidth * 2 - 1;
    api.pointer.y = 1 - e.clientY / innerHeight * 2;
    api.pointer.on = 1;
    dirty = true;
  }, { passive: true });
  document.addEventListener('pointerleave', function () { api.pointer.on = 0; });

  function known(n) { return ready[n] ? n : (ready.dust ? 'dust' : 'portrait'); }
  function relabel(goal, t) { cur.a = t.a; cur.b = t.b; cur.mix = goal === t.b && t.a !== t.b ? 1 : 0; }

  function step(dt) {
    var t = { a: known(api.target.a), b: known(api.target.b), mix: api.target.mix };
    if (cur.a === t.a && cur.b === t.b) {
      cur.mix += (t.mix - cur.mix) * (reduced ? 1 : 1 - Math.exp(-dt * 7));
    } else {
      var goal = t.mix > .5 ? t.b : t.a, speed = reduced ? 99 : 1;
      if (cur.b === goal) {
        cur.mix = Math.min(1, cur.mix + dt * 1.15 * speed);
        if (cur.mix >= 1) relabel(goal, t);
      } else if (cur.a === goal) {
        cur.mix = Math.max(0, cur.mix - dt * 1.15 * speed);
        if (cur.mix <= 0) relabel(goal, t);
      } else if (cur.mix >= .5) {
        cur.mix = Math.min(1, cur.mix + dt * 2.6 * speed);
        if (cur.mix >= 1) { cur.a = cur.b; cur.b = goal; cur.mix = 0; }
      } else {
        cur.mix = Math.max(0, cur.mix - dt * 2.6 * speed);
        if (cur.mix <= 0) cur.b = goal;
      }
    }
    var A = api.layouts[cur.a] || L, B = api.layouts[cur.b] || A, m = cur.mix, k = 1 - Math.exp(-dt * 6);
    var ox = A.ox + (B.ox - A.ox) * m, oy = A.oy + (B.oy - A.oy) * m, s = A.s + (B.s - A.s) * m;
    // a zero-sized window can produce one bad layout; never let it stick
    if (isFinite(ox) && isFinite(oy) && isFinite(s)) {
      L.ox += (ox - L.ox) * k; L.oy += (oy - L.oy) * k; L.s += (s - L.s) * k;
    }
    if (!isFinite(cur.mix)) cur.mix = 0;
    var pk = 1 - Math.exp(-dt * 9);
    if (api.pointer.x < 2) { P.x += (api.pointer.x - P.x) * pk; P.y += (api.pointer.y - P.y) * pk; }
    P.f += ((api.pointer.on ? 1 : 0) - P.f) * (1 - Math.exp(-dt * 3));
    if (api.pointer.x < 2 && !reduced) {
      rot.y += (api.pointer.x * .11 - rot.y) * (1 - Math.exp(-dt * 2.2));
      rot.x += (-api.pointer.y * .07 - rot.x) * (1 - Math.exp(-dt * 2.2));
    }
    agit += (Math.min(1, api.agitate) - agit) * (1 - Math.exp(-dt * 5));
    for (var i = 0; i < 3; i++) {
      fg[i] += (toneGoal.fg[i] - fg[i]) * (1 - Math.exp(-dt * 8));
      red[i] += (toneGoal.red[i] - red[i]) * (1 - Math.exp(-dt * 8));
    }
    if (api.noise > 0) {
      var e = (performance.now() - born) / 2600;
      api.noise = Math.max(0, 1 - e * e * (3 - 2 * e));
      if (e >= 1) api.noise = 0;
    }
  }

  function draw(now) {
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, FIG[cur.a].tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, FIG[cur.b].tex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, randTex);
    gl.uniform1i(U.uA, 0); gl.uniform1i(U.uB, 1); gl.uniform1i(U.uR, 2);
    gl.uniform1i(U.uW, TEX);
    gl.uniform1i(U.uKA, FIG[cur.a].kind); gl.uniform1i(U.uKB, FIG[cur.b].kind);
    gl.uniform1f(U.uMix, cur.mix);
    gl.uniform1f(U.uT, reduced ? 12 : now / 1000);
    gl.uniform1f(U.uNoise, api.noise);
    gl.uniform1f(U.uAgit, reduced ? 0 : agit);
    gl.uniform1f(U.uAspect, W / H);
    gl.uniform1f(U.uScale, L.s);
    gl.uniform1f(U.uPx, dpr);
    var szA = FIG[cur.a].size || 1, szB = FIG[cur.b].size || 1;
    gl.uniform1f(U.uSize, (phone ? 1.34 : 1.3) * dpr * sizeK * (szA + (szB - szA) * cur.mix));
    var alphaA = FIG[cur.a].alpha, alphaB = FIG[cur.b].alpha;
    gl.uniform1f(U.uAlpha, alphaA + (alphaB - alphaA) * cur.mix);
    gl.uniform1f(U.uForce, reduced ? 0 : P.f);
    gl.uniform1f(U.uCalm, reduced ? 0 : 1);
    var dofA = FIG[cur.a].dof === undefined ? 1 : FIG[cur.a].dof, dofB = FIG[cur.b].dof === undefined ? 1 : FIG[cur.b].dof;
    gl.uniform1f(U.uDof, dofA + (dofB - dofA) * cur.mix);
    gl.uniform2f(U.uOff, L.ox, L.oy);
    gl.uniform2f(U.uPtr, P.x, P.y);
    gl.uniform2f(U.uRot, rot.x, rot.y);
    gl.uniform2f(U.uMode, api.mode.n, api.mode.m);
    gl.uniform3fv(U.uFg, fg);
    gl.uniform3fv(U.uRed, red);
    gl.drawArrays(gl.POINTS, 0, drawN);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    var raw = now - (last || now), ms = Math.min(220, raw);
    last = now;
    if (document.hidden) return;
    step(ms / 1000);
    draw(now);
    /* Slow machine: thin the grains and fatten them a little instead of dropping frames. */
    // (long frames are a hiccup or a throttled background tab, not a slow GPU)
    if (raw < 70) { frameMs += (raw - frameMs) * .04; frames++; }
    if (frames > 120 && frameMs > 30 && drawN > N * .45) {
      drawN = Math.round(drawN * .82);
      sizeK = Math.min(1.35, sizeK * 1.06);
      frames = 0; frameMs = 20;
    } else if (frames > 300 && frameMs < 19 && drawN < N) {
      drawN = Math.min(N, Math.round(drawN * 1.12));
      sizeK = Math.max(1, sizeK / 1.04);
      frames = 0;
    }
    api.drawn = drawN;
    if (api.onframe) api.onframe(now, ms);
  }

  /* Jumps straight to the current target. Handy from the console. */
  api.settle = function () { for (var i = 0; i < 90; i++) step(.1); };

  build('portrait').then(function () {
    born = performance.now();
    document.documentElement.classList.add('field-on');
    window.dispatchEvent(new Event('fieldready'));
    requestAnimationFrame(frame);
    setTimeout(buildNext, 120);
  }).catch(function (e) {
    console.warn('Grain field disabled:', e);
    document.documentElement.classList.add('no-field');
  });

  window.Field = api;
})();
