// Web FastLED: 3D view of LED matrix. Matrix image (as LED window shows it) is wrapped on figure:
//   cylinder — matrix is side surface: columns go round, rows go down (running text runs round cylinder);
//   sphere   — as many points as LEDs, golden-angle (Fibonacci) distribution; each point shows LED under its
//              longitude / latitude (equirectangular: x → longitude, y → latitude, top row at north pole).
// Modes: dots  — canvas 2D, one dot per point, back side dimmer (as object3D dots);
//        solid — WebGL, figure is ray-traced in fragment shader, LEDs are round dots on dark lit surface.
// Arcball rotation with inertia (fling), wheel / pinch / right+left drag zoom, random rotation when idle (rotate on).
// Rotation, arcball and inertia follow object3D-4 (quaternions, toArc, history of last 5 moves).
(function () {
  'use strict';
  const TAU = Math.PI * 2, R0 = 12; // figure fits sphere of radius 12 (object3D default sphereRadius)
  const SHAPES = ['cylinder', 'sphere', 'globe', 'torus', 'disc', 'dome']; // index = uShape of shader

  // ---------------------------------------------------------------- quaternions / vectors
  const qMul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  const qNorm = (q) => { const l = Math.hypot(q[0], q[1], q[2], q[3]); return l > 1e-9 ? [q[0] / l, q[1] / l, q[2] / l, q[3] / l] : [0, 0, 0, 1]; };
  const qAA = (x, y, z, a) => { const s = Math.sin(a / 2); return [x * s, y * s, z * s, Math.cos(a / 2)]; };
  // rotation matrix of q, column-major (m[0..2] = first column)
  function q2m3(q) {
    const x = q[0], y = q[1], z = q[2], w = q[3], x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    return [1 - (yy + zz), xy + wz, xz - wy, xy - wz, 1 - (xx + zz), yz + wx, xz + wy, yz - wx, 1 - (xx + yy)];
  }
  const vCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const vNorm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return l > 1e-9 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 1, 0]; };
  function toArc(cx, cy, W, H) { // point of virtual ball under cursor (object3D)
    const s = Math.min(W, H), x = (cx - (W - s) / 2) / s * 2 - 1, y = 1 - (cy - (H - s) / 2) / s * 2, d = x * x + y * y;
    if (d <= 1) return [x, y, Math.sqrt(1 - d)];
    const n = Math.sqrt(d); return [x / n, y / n, 0];
  }

  // ---------------------------------------------------------------- geometry: points (object space) and LED cell of each
  // Figures (y is up, front faces +z, column x grows to the right on front side, row 0 is at top / centre):
  //   cylinder — side surface: columns round, rows down (LED pitch same round and along axis at height 100%)
  //   sphere   — golden-angle points (as many as LEDs), each takes LED under its longitude / latitude
  //   globe    — latitude / longitude grid: row = parallel, column = meridian (LEDs crowd to poles, as on real ones)
  //   torus    — columns round big ring, rows round tube (middle row on outer equator)
  //   disc     — polar: row = ring (row 0 at centre), column = angle (column 0 … clockwise from top)
  //   dome     — polar on hemisphere facing viewer: row 0 at pole, last row at rim
  const DISC_IN = 0.12; // hole of disc: part of radius
  function cylSize(iw, ih, hk) {
    const r = iw / TAU, h = ih / 2 * (hk || 1), k = R0 / Math.hypot(r, h);
    return { r: r * k, h: h * k, pitch: k };
  }
  function torSize(iw, ih) { // tube / ring radii from LED pitch (same round ring and round tube), tube at most 0.6 of ring
    const q = Math.min(0.6, ih / iw), Rt = R0 / (1 + q);
    return { Rt, rt: Rt * q };
  }
  function geometry(shape, iw, ih, hk) {
    const n = iw * ih, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), cell = new Int32Array(n), sz = new Float32Array(n).fill(1);
    let pitch;
    // position and outward normal (default: from centre, as on sphere)
    const put = (i, x, y, z, nx, ny, nz) => {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      if (nx == null) { const l = Math.hypot(x, y, z) || 1; nx = x / l; ny = y / l; nz = z / l; }
      nrm[i * 3] = nx; nrm[i * 3 + 1] = ny; nrm[i * 3 + 2] = nz;
    };
    const ang = (x) => TAU * ((x + 0.5) / iw - 0.5);
    const clampSz = (v) => Math.max(0.25, Math.min(1, v));
    if (shape === 'sphere') {
      const ga = Math.PI * (3 - Math.sqrt(5)), off = 2 / n;
      for (let i = 0; i < n; i++) {
        const y = 1 - (i * off + off / 2), r = Math.sqrt(Math.max(0, 1 - y * y)), th = ga * i;
        const x = Math.cos(th) * r, z = Math.sin(th) * r;
        put(i, x * R0, y * R0, z * R0);
        const u = Math.atan2(x, z) / TAU + 0.5, v = Math.acos(Math.max(-1, Math.min(1, y))) / Math.PI;
        cell[i] = Math.min(ih - 1, Math.floor(v * ih)) * iw + Math.min(iw - 1, Math.floor(u * iw));
      }
      pitch = Math.sqrt(4 * Math.PI / n) * R0;
    } else if (shape === 'globe' || shape === 'dome') {
      const span = shape === 'globe' ? Math.PI : Math.PI / 2;
      pitch = Math.min(TAU * R0 / iw, span * R0 / ih);
      for (let y = 0, i = 0; y < ih; y++) {
        const th = span * (y + 0.5) / ih, s = Math.sin(th), c = Math.cos(th);
        for (let x = 0; x < iw; x++, i++) {
          const a = ang(x);
          if (shape === 'globe') put(i, R0 * s * Math.sin(a), R0 * c, R0 * s * Math.cos(a));
          else put(i, -R0 * s * Math.sin(a + Math.PI), R0 * s * Math.cos(a + Math.PI), R0 * c); // pole towards viewer, column 0 at top, counter-clockwise (as north half of globe seen from above)
          cell[i] = y * iw + x; sz[i] = clampSz(TAU * R0 * s / iw / pitch);
        }
      }
    } else if (shape === 'torus') {
      const t = torSize(iw, ih);
      pitch = Math.min(TAU * t.Rt / iw, TAU * t.rt / ih); // at middle of tube; inner side gets smaller dots
      for (let y = 0, i = 0; y < ih; y++) {
        const ps = -TAU * ((y + 0.5) / ih - 0.5), rr = t.Rt + t.rt * Math.cos(ps);
        for (let x = 0; x < iw; x++, i++) {
          const a = ang(x);
          put(i, rr * Math.sin(a), t.rt * Math.sin(ps), rr * Math.cos(a), Math.cos(ps) * Math.sin(a), Math.sin(ps), Math.cos(ps) * Math.cos(a));
          cell[i] = y * iw + x; sz[i] = clampSz(TAU * rr / iw / pitch);
        }
      }
    } else if (shape === 'disc') {
      const rin = R0 * DISC_IN, pr = (R0 - rin) / ih;
      pitch = Math.min(pr, TAU * R0 / iw);
      for (let y = 0, i = 0; y < ih; y++) {
        const r = rin + pr * (y + 0.5);
        for (let x = 0; x < iw; x++, i++) {
          const a = ang(x) + Math.PI; // column 0 at top, clockwise as seen from front
          put(i, r * Math.sin(a), r * Math.cos(a), 0, 0, 0, 1);
          cell[i] = y * iw + x; sz[i] = clampSz(TAU * r / iw / pitch);
        }
      }
    } else {
      const c = cylSize(iw, ih, hk);
      for (let y = 0, i = 0; y < ih; y++) {
        for (let x = 0; x < iw; x++, i++) {
          const a = ang(x);
          put(i, c.r * Math.sin(a), c.h * (1 - 2 * (y + 0.5) / ih), c.r * Math.cos(a), Math.sin(a), 0, Math.cos(a));
          cell[i] = y * iw + x;
        }
      }
      pitch = c.pitch * Math.min(1, hk || 1); // dots must not overlap along axis when cylinder is lower
    }
    return { n, pos, nrm, cell, pitch, sz };
  }

  // ---------------------------------------------------------------- WebGL (solid)
  // uShape: 0 cylinder, 1 sphere, 2 globe, 3 torus, 4 disc, 5 dome. LED grid coordinates (u along columns, w along rows)
  // and physical cell size (cw, ch) come from hit point; dot is round in physical units
  const VS = 'attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0,1);}';
  const FS = [
    'precision highp float;',
    'varying vec2 v;',
    'uniform mat3 uR;uniform float uZ,uAsp,uShape,uSR,uDot,uIn;uniform vec2 uCyl,uTor,uTS;uniform sampler2D uTex;',
    'const float PI=3.14159265,TAU=6.2831853;',
    'float sdTor(vec3 p){return length(vec2(length(p.xz)-uTor.x,p.y))-uTor.y;}',
    'void main(){',
    '  vec2 uv=(v*2.-1.)*vec2(uAsp,1.);',
    '  vec3 ro=vec3(0,0,uZ),rd=normalize(vec3(uv,-1.8));',
    '  vec3 O=uR*ro,D=uR*rd;', // ray in object space
    '  float t=1e9;vec3 nO=vec3(0.);float back=0.;', // back: board without LEDs (cylinder caps, back of disc, inside of dome)
    '  if(uShape<.5){',
    '    float R=uCyl.x,h=uCyl.y;',
    '    float a=D.x*D.x+D.z*D.z,b=O.x*D.x+O.z*D.z,c=O.x*O.x+O.z*O.z-R*R,ds=b*b-a*c;',
    '    if(a>1e-6&&ds>=0.){float s=sqrt(ds),t1=(-b-s)/a;vec3 p=O+D*t1;',
    '      if(t1>0.&&abs(p.y)<=h){t=t1;nO=normalize(vec3(p.x,0.,p.z));}}',
    '    if(abs(D.y)>1e-6){for(int k=0;k<2;k++){float yy=k==0?h:-h;float tc=(yy-O.y)/D.y;vec3 p=O+D*tc;',
    '      if(tc>0.&&tc<t&&p.x*p.x+p.z*p.z<=R*R){t=tc;nO=vec3(0.,sign(yy),0.);back=1.;}}}',
    '  }else if(uShape<2.5||uShape>4.5){',
    '    float b=dot(D,O),c=dot(O,O)-uSR*uSR,ds=b*b-c;',
    '    if(ds>=0.){float s=sqrt(ds),t1=-b-s,t2=-b+s;',
    '      if(uShape<4.5){t=t1;nO=normalize(O+D*t1);}',
    '      else{vec3 p1=O+D*t1,p2=O+D*t2;', // dome: half with z >= 0; inner side is board
    '        if(p1.z>=0.){t=t1;nO=normalize(p1);}else if(p2.z>=0.){t=t2;nO=-normalize(p2);back=1.;}}}',
    '  }else if(uShape<3.5){',
    '    float b=dot(D,O),c=dot(O,O)-uSR*uSR,ds=b*b-c;',
    '    if(ds>=0.){float tt=max(0.,-b-sqrt(ds));',
    '      for(int i=0;i<120;i++){float d=sdTor(O+D*tt);if(d<.002){t=tt;break;}tt+=d;if(tt>-b+sqrt(ds))break;}',
    '      if(t<1e8){vec3 p=O+D*t;nO=normalize(p-uTor.x*normalize(vec3(p.x,0.,p.z)));}}',
    '  }else{',
    '    if(abs(D.z)>1e-6){float tc=-O.z/D.z;vec3 p=O+D*tc;float r=length(p.xy);',
    '      if(tc>0.&&r<=uSR&&r>=uSR*uIn){t=tc;nO=vec3(0.,0.,sign(O.z));back=O.z<0.?1.:0.;}}',
    '  }',
    '  if(t>=1e8){gl_FragColor=vec4(0.,0.,0.,1.);return;}',
    '  vec3 P=O+D*t;',
    '  vec3 n=nO*uR;', // object normal → world (uR is orthonormal: transpose = inverse)
    '  vec3 l1=normalize(vec3(.6,.8,.5)),l2=normalize(vec3(-.5,-.3,-.7));',
    '  float df=max(dot(n,l1),0.)*.75+.25,sp=pow(max(dot(reflect(-l1,n),-rd),0.),48.)*.35,ri=pow(1.-abs(dot(n,-rd)),2.)*.15;',
    '  vec3 board=vec3(.055)*(df+ri)+max(dot(n,l2),0.)*vec3(.02);',
    '  vec3 col=board;',
    '  if(back<.5){',
    '    float u,w,cw,ch;',
    '    if(uShape<.5){u=atan(P.x,P.z)/TAU+.5;w=(uCyl.y-P.y)/(2.*uCyl.y);cw=TAU*uCyl.x/uTS.x;ch=2.*uCyl.y/uTS.y;}',
    '    else if(uShape<2.5){float th=acos(clamp(P.y/uSR,-1.,1.));u=atan(P.x,P.z)/TAU+.5;w=th/PI;cw=max(TAU*uSR*sin(th)/uTS.x,1e-3);ch=PI*uSR/uTS.y;}',
    '    else if(uShape<3.5){float rr=length(P.xz),ps=atan(P.y,rr-uTor.x);u=atan(P.x,P.z)/TAU+.5;w=fract(.5-ps/TAU);cw=TAU*rr/uTS.x;ch=TAU*uTor.y/uTS.y;}',
    '    else if(uShape<4.5){float r=length(P.xy);u=fract(atan(P.x,P.y)/TAU+1.);w=(r-uSR*uIn)/(uSR*(1.-uIn));cw=TAU*r/uTS.x;ch=uSR*(1.-uIn)/uTS.y;}',
    '    else{float th=acos(clamp(P.z/uSR,-1.,1.));u=fract(atan(-P.x,P.y)/TAU+1.);w=th/(PI*.5);cw=max(TAU*uSR*sin(th)/uTS.x,1e-3);ch=.5*PI*uSR/uTS.y;}',
    '    vec2 c=vec2(u,w)*uTS;vec2 f=fract(c)-.5;',
    '    vec3 led=texture2D(uTex,(floor(c)+.5)/uTS).rgb;',
    '    vec2 q=f*vec2(cw,ch)/min(cw,ch);', // in units of smaller side of cell: dot stays round
    '    float m=1.-smoothstep(.30*uDot,.44*uDot,length(q));',
    '    vec3 off=vec3(.09)*(df+ri);',
    '    col=mix(board,max(led,off),m);',
    '  }',
    '  gl_FragColor=vec4(clamp(col+vec3(sp),0.,1.),1.);',
    '}',
  ].join('\n');

  function glInit(canvas) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: true, preserveDrawingBuffer: true });
    if (!gl) return null;
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); return null; }
    gl.useProgram(p);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const ap = gl.getAttribLocation(p, 'a'); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
    const u = {}; for (const k of ['uR', 'uZ', 'uAsp', 'uShape', 'uSR', 'uDot', 'uIn', 'uCyl', 'uTor', 'uTS', 'uTex']) u[k] = gl.getUniformLocation(p, k);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.uniform1i(u.uTex, 0);
    return { gl, u, tex };
  }

  // ---------------------------------------------------------------- view
  function Led3D(box) {
    const cfg = { sensitivity: 1, inertia: 0.991, autoSpin: 0.005 };
    const st = {
      shape: 'cylinder', mode: 'dots', rotate: true, zoom: 1, dot: 1, cylH: 1,
      quat: qNorm(qMul(qAA(1, 0, 0, 0.25), [0, 0, 0, 1])), isDrag: false, prevArc: null, hist: [],
      inertiaAxis: [0, 1, 0], inertiaAngle: 0.005,
      img: null, iw: 0, ih: 0, geo: null, geoKey: '', texDirty: true, shown: false, raf: 0,
    };
    const mk = () => { const c = document.createElement('canvas'); c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:none;touch-action:none;cursor:grab'; box.appendChild(c); return c; };
    const c2 = mk(), cg = mk();
    const ctx = c2.getContext('2d');
    let G = null, glFailed = false;
    let W = 0, H = 0, dpr = 1;

    function size() {
      dpr = window.devicePixelRatio || 1;
      W = box.clientWidth; H = box.clientHeight;
      for (const c of [c2, cg]) { const w = Math.max(1, Math.round(W * dpr)), h = Math.max(1, Math.round(H * dpr)); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } }
    }
    function canvas() { return st.mode === 'solid' && !glFailed ? cg : c2; }
    function layout() {
      const cur = canvas();
      c2.style.display = st.shown && cur === c2 ? 'block' : 'none';
      cg.style.display = st.shown && cur === cg ? 'block' : 'none';
      if (st.shown && cur === cg && !G) { G = glInit(cg); if (!G) { glFailed = true; layout(); } }
    }

    // --- rotation (object3D): random rotation when idle, inertia
    const rr = { iter: 0, dX: 0, dY: 0, dZ: 0 };
    function rrTick() {
      if (!st.rotate || st.isDrag) return;
      const as = cfg.autoSpin;
      if (st.inertiaAngle > as * 3) return;
      if (rr.iter <= 0) {
        const rnd = () => (Math.floor(Math.random() * 7) - 5) * as;
        rr.dX = rnd(); rr.dY = rnd(); rr.dZ = rnd(); if (!rr.dX && !rr.dY && !rr.dZ) rr.dZ = as;
        rr.iter = Math.floor(Math.random() * 250) + 5;
      }
      rr.iter--;
      if (rr.dX) st.quat = qNorm(qMul(qAA(1, 0, 0, rr.dX), st.quat));
      if (rr.dY) st.quat = qNorm(qMul(qAA(0, 1, 0, rr.dY), st.quat));
      if (rr.dZ) st.quat = qNorm(qMul(qAA(0, 0, 1, rr.dZ), st.quat));
    }
    function spinTick() {
      if (st.isDrag) return;
      const ag = st.inertiaAngle; if (Math.abs(ag) < 1e-7) return;
      const ax = st.inertiaAxis;
      st.quat = qNorm(qMul(qAA(ax[0], ax[1], ax[2], ag), st.quat));
      st.inertiaAngle *= cfg.inertia;
      if (st.inertiaAngle < 1e-4) st.inertiaAngle = st.rotate ? cfg.autoSpin : 0;
    }
    function pushHist(ax, ag) { st.hist.push({ ax, ag, t: performance.now() }); if (st.hist.length > 5) st.hist.shift(); }
    function flushInertia() {
      const now = performance.now(), h = st.hist.filter((x) => now - x.t < 120); // released after holding still: no fling
      if (!h.length) { st.inertiaAngle = st.rotate ? cfg.autoSpin : 0; return; }
      const ax = [0, 0, 0]; let ag = 0;
      for (const x of h) { ax[0] += x.ax[0] * x.ag; ax[1] += x.ax[1] * x.ag; ax[2] += x.ax[2] * x.ag; ag += x.ag; }
      st.inertiaAxis = vNorm(ax); st.inertiaAngle = Math.min(0.3, ag / h.length);
    }
    function arcDelta(cx, cy) {
      if (!st.prevArc) return;
      const cur = toArc(cx, cy, W, H), a = st.prevArc;
      const dot = Math.min(1, Math.max(-1, a[0] * cur[0] + a[1] * cur[1] + a[2] * cur[2]));
      const ag = Math.acos(dot) * cfg.sensitivity;
      const cr = vCross(a, cur);
      if (ag < 1e-6 || Math.hypot(cr[0], cr[1], cr[2]) < 1e-6) { st.prevArc = cur; return; }
      const axis = vNorm(cr);
      st.quat = qNorm(qMul(qAA(axis[0], axis[1], axis[2], ag), st.quat)); pushHist(axis, ag); st.prevArc = cur;
    }
    const Q0 = qNorm(qMul(qAA(1, 0, 0, 0.25), [0, 0, 0, 1])); // start view: front, slightly from above
    function reset() { st.zoom = 1; st.quat = Q0.slice(); st.hist = []; st.inertiaAngle = st.rotate ? cfg.autoSpin : 0; }
    const ZMIN = 0.21, ZMAX = 2.5; // min: 30% below 0.3 of 0.5.0
    const zoomBy = (d) => { st.zoom = Math.min(ZMAX, Math.max(ZMIN, st.zoom * Math.exp(d))); };

    // --- input: pointer events (mouse, pen, touch): one pointer rotates, two pinch-zoom; wheel zoom; right+left drag zoom
    const ptrs = new Map(); let pinch = 0, zy = null;
    const lxy = (e) => { const r = box.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    function down(e) {
      if (e.button === 2) { zy = e.clientY; e.preventDefault(); return; }
      e.currentTarget.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 1) { st.isDrag = true; st.hist = []; st.inertiaAngle = 0; const p = lxy(e); st.prevArc = toArc(p[0], p[1], W, H); e.currentTarget.style.cursor = 'grabbing'; }
      else if (ptrs.size === 2) { st.isDrag = false; const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
      e.preventDefault();
    }
    function move(e) {
      if (zy != null && (e.buttons & 2)) { zoomBy((zy - e.clientY) * 0.01); zy = e.clientY; return; }
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size >= 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoomBy(Math.log(d / pinch)); pinch = d; return; }
      if (st.isDrag) { const p = lxy(e); arcDelta(p[0], p[1]); }
    }
    function up(e) {
      if (e.button === 2) { zy = null; return; }
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (ptrs.size === 0) { if (st.isDrag) { st.isDrag = false; flushInertia(); } e.currentTarget.style.cursor = 'grab'; }
      else if (ptrs.size === 1) { st.isDrag = false; pinch = 0; }
    }
    for (const c of [c2, cg]) {
      c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move);
      c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
      c.addEventListener('contextmenu', (e) => e.preventDefault());
      c.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(-e.deltaY * 0.0015); }, { passive: false });
      c.addEventListener('dblclick', () => { reset(); });
    }

    // --- drawing
    function geo() {
      const key = st.shape + st.iw + 'x' + st.ih + ':' + st.cylH;
      if (key !== st.geoKey) { st.geo = geometry(st.shape, st.iw, st.ih, st.cylH); st.geoKey = key; }
      return st.geo;
    }
    const buckets = 48;
    function drawDots() {
      const g = geo(), img = st.img, m = q2m3(st.quat), n = g.n, pos = g.pos;
      const cw = c2.width, ch = c2.height, sc = Math.min(cw, ch) * 0.40 / R0 * st.zoom;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);
      const px = new Float32Array(n), py = new Float32Array(n), pz = new Float32Array(n), fz = new Float32Array(n), nr = g.nrm;
      const cnt = new Int32Array(buckets + 1), order = new Int32Array(n), bk = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        const rx = m[0] * x + m[3] * y + m[6] * z, ry = m[1] * x + m[4] * y + m[7] * z, rz = m[2] * x + m[5] * y + m[8] * z;
        px[i] = cw / 2 + rx * sc; py[i] = ch / 2 - ry * sc; pz[i] = rz;
        fz[i] = m[2] * nr[i * 3] + m[5] * nr[i * 3 + 1] + m[8] * nr[i * 3 + 2]; // normal towards viewer: 1 facing, < 0 back side
        const b = Math.max(0, Math.min(buckets - 1, Math.floor((rz / R0 + 1) / 2 * buckets)));
        bk[i] = b; cnt[b + 1]++;
      }
      for (let b = 0; b < buckets; b++) cnt[b + 1] += cnt[b];
      for (let i = 0; i < n; i++) order[cnt[bk[i]]++] = i;
      const r0 = Math.max(0.6 * dpr, g.pitch * sc * 0.42 * st.dot), round = r0 > 1.6 * dpr, szk = g.sz;
      for (let k = 0; k < n; k++) {
        const i = order[k], t = Math.max(0, Math.min(1, (pz[i] / R0 + 1) / 2)); // 0 back … 1 front
        // brightness by facing (not by depth: flat disc facing viewer is full bright), back side seen through is dim
        const f = fz[i], c = g.cell[i] * 4, kb = f >= 0 ? 0.62 + 0.38 * f : 0.22 + 0.2 * (1 + f);
        let r = img ? img[c] : 0, gg = img ? img[c + 1] : 0, b = img ? img[c + 2] : 0;
        if (!(r | gg | b)) { r = gg = b = 22; }
        ctx.fillStyle = `rgb(${(r * kb) | 0},${(gg * kb) | 0},${(b * kb) | 0})`;
        const rad = Math.max(0.5 * dpr, r0 * szk[i] * (0.8 + 0.2 * t));
        if (round) { ctx.beginPath(); ctx.arc(px[i], py[i], rad, 0, TAU); ctx.fill(); }
        else ctx.fillRect(px[i] - rad, py[i] - rad, rad * 2, rad * 2);
      }
    }
    function drawSolid() {
      const { gl, u, tex } = G;
      gl.viewport(0, 0, cg.width, cg.height);
      if (st.texDirty && st.img) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, st.iw, st.ih, 0, gl.RGBA, gl.UNSIGNED_BYTE, st.img);
        st.texDirty = false;
      }
      const m = q2m3(st.quat);
      // GLSL mat3 from column-major array: transposed rotation = world → object
      gl.uniformMatrix3fv(u.uR, false, new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]));
      // perspective camera; figure of radius R0 takes about same part of view as in dots mode
      gl.uniform1f(u.uZ, R0 * 2.368 / st.zoom * Math.max(1, cg.height / Math.min(cg.width, cg.height)));
      gl.uniform1f(u.uAsp, cg.width / cg.height);
      gl.uniform1f(u.uShape, SHAPES.indexOf(st.shape)); gl.uniform1f(u.uSR, R0); gl.uniform1f(u.uIn, DISC_IN);
      const tr = torSize(st.iw || 1, st.ih || 1); gl.uniform2f(u.uTor, tr.Rt, tr.rt);
      const c = cylSize(st.iw || 1, st.ih || 1, st.cylH); gl.uniform2f(u.uCyl, c.r, c.h);
      gl.uniform1f(u.uDot, st.dot);
      gl.uniform2f(u.uTS, st.iw || 1, st.ih || 1);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    function frame() {
      st.raf = 0;
      if (!st.shown) return;
      if (box.clientWidth !== W || box.clientHeight !== H) size();
      rrTick(); spinTick();
      if (st.iw && st.ih) { if (canvas() === cg && G) drawSolid(); else drawDots(); }
      st.raf = requestAnimationFrame(frame);
    }

    return {
      // rgba: Uint8Array w*h*4 of LED colors as on screen (0,0,0 = off)
      setImage(rgba, w, h) { st.img = rgba; if (w !== st.iw || h !== st.ih) { st.iw = w; st.ih = h; } st.texDirty = true; },
      set(o) {
        if (o.shape) st.shape = SHAPES.includes(o.shape) ? o.shape : 'cylinder';
        if (o.mode) st.mode = o.mode === 'solid' ? 'solid' : 'dots';
        if (o.dot != null) st.dot = Math.max(0.2, Math.min(1, +o.dot || 1));
        if (o.cylH != null) st.cylH = Math.max(0.1, Math.min(4, +o.cylH || 1));
        if (o.rotate != null) { st.rotate = !!o.rotate; if (st.rotate && st.inertiaAngle < 1e-4) { st.inertiaAngle = cfg.autoSpin; } if (!st.rotate) { rr.iter = 0; rr.dX = rr.dY = rr.dZ = 0; } }
        st.texDirty = true; layout();
      },
      show(v) {
        st.shown = !!v; size(); layout();
        if (st.shown && !st.raf) st.raf = requestAnimationFrame(frame);
        if (!st.shown && st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; }
      },
      // figure size on screen, CSS px: square view of this side shows it at zoom 1 (Fit of LED window)
      fitSize() { size(); return Math.min(W, H) * st.zoom; },
      reset() { reset(); },
      setZoom(z) { st.zoom = Math.min(ZMAX, Math.max(ZMIN, z)); },
      get solidFailed() { return glFailed; },
      get state() { return { shape: st.shape, mode: st.mode, rotate: st.rotate, zoom: st.zoom, quat: st.quat.slice() }; },
    };
  }
  window.Led3D = Led3D;
})();
