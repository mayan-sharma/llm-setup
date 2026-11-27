// The black hole, shared by make.html (the still sky) and frames.mjs (the turning disc):
// a Schwarzschild ray trace of a thin disc, and the disc's texture as a function of time.
(function (G) {
  var seed = 20261127;
  function rnd() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  function sm(a, b, x) { var t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

  var NT = new Float32Array(1024); for (var i = 0; i < 1024; i++) NT[i] = rnd();
  function n1(x) { var f = Math.floor(x), t = x - f; t = t * t * (3 - 2 * t); return NT[f & 1023] * (1 - t) + NT[(f + 1) & 1023] * t; }
  function rings(r) { return 0.52 * n1(r * 1.9 + 40) + 0.30 * n1(r * 5.3 + 90) + 0.18 * n1(r * 13.7 + 7); }

  // The camera: a little above the disc's plane, rolled a little.
  var elev = 7.5 * Math.PI / 180, roll = 15 * Math.PI / 180;
  var se = Math.sin(elev), ce = Math.cos(elev), sr = Math.sin(roll), cr = Math.cos(roll);
  var D = 30, RIN = 3.0, ROUT = 12.2, EXPO = 2.5, REG = 13.6;

  // Brighter and dimmer stretches of gas along each ring. The pattern repeats FOLD times
  // around the hole, so turning it by 1/FOLD of a circle is a seamless loop; the inner
  // bands go round more often in that time than the outer ones, as gas nearer a hole does.
  var FOLD = 6, STEP = 2 * Math.PI / FOLD;
  var BANDS = [
    { r: 3.7, w: 1.3, k: 3, cells: 2 },
    { r: 5.6, w: 1.7, k: 2, cells: 3 },
    { r: 8.6, w: 3.0, k: 1, cells: 4 },
  ];
  BANDS.forEach(function (b) {
    b.a = []; b.b = [];
    for (var i = 0; i < b.cells; i++) b.a.push(rnd());
    for (i = 0; i < b.cells * 3; i++) b.b.push(rnd());
  });
  function loopNoise(tab, x) {
    var n = tab.length; x = ((x % n) + n) % n;
    var f = Math.floor(x), t = x - f; t = t * t * (3 - 2 * t);
    return tab[f] * (1 - t) + tab[(f + 1) % n] * t;
  }
  // `turn` runs 0..1 through one loop.
  function tex(rc, phi, turn) {
    var base = 0.30 + 1.25 * Math.pow(rings(rc), 1.6);
    var a = 0, ws = 0;
    for (var i = 0; i < BANDS.length; i++) {
      var b = BANDS[i], d = (rc - b.r) / b.w, w = Math.exp(-d * d) + 0.02;
      var x = (phi / STEP + turn * b.k) * b.cells;
      a += w * (0.68 * loopNoise(b.a, x) + 0.32 * loopNoise(b.b, x * 3));
      ws += w;
    }
    a /= ws;
    return base * (0.42 + 1.25 * a * a * (3 - 2 * a));
  }

  // One ray through the image point (u, w), in Schwarzschild radii from the hole's centre,
  // w upward. Calls hit(light, green, blue, radius, angle) for each crossing of the disc,
  // already dimmed by what lies in front. Returns false where no ray needs tracing.
  function trace(u, w, hit) {
    var b2 = u * u + w * w;
    var A = u * cr + w * sr, Bv = -u * sr + w * cr;
    if (b2 > REG * REG || (b2 > 49 && Math.abs(Bv) > 2.9)) return false;
    var x = A, y = Bv * ce + D * se, z = -Bv * se + D * ce;
    var vx = 0, vy = -se, vz = -ce, h2 = b2, T = 1;
    for (var st = 0; st < 420; st++) {
      var r2 = x * x + y * y + z * z;
      if (r2 < 1.0) break;
      if (r2 > 1000 && x * vx + y * vy + z * vz > 0) break;
      var r = Math.sqrt(r2), dt = 0.028 + 0.045 * (r - 1);
      var k = -1.5 * h2 / (r2 * r2 * r) * dt;
      vx += x * k; vy += y * k; vz += z * k;
      var nx = x + vx * dt, ny = y + vy * dt, nz = z + vz * dt;
      if (y * ny < 0) {
        var t = y / (y - ny), qx = x + (nx - x) * t, qz = z + (nz - z) * t;
        var rc = Math.sqrt(qx * qx + qz * qz);
        if (rc > RIN - 0.05 && rc < ROUT) {
          var prof = Math.pow(RIN / rc, 2.1) * sm(RIN - 0.05, RIN + 0.55, rc) * (1 - sm(ROUT * 0.5, ROUT, rc));
          var vl = Math.sqrt(vx * vx + vy * vy + vz * vz);
          var beta = Math.sqrt(0.5 / (rc - 1)), gam = 1 / Math.sqrt(1 - beta * beta);
          var cosv = -(qz * vx - qx * vz) / (rc * vl);      // gas on the left moves toward the camera
          var g = Math.sqrt(1 - 1 / rc) / (gam * (1 - beta * cosv));
          var s = g * Math.pow(RIN / rc, 0.35); if (s > 1.5) s = 1.5;
          hit(T * prof * Math.pow(g, 2.5) * EXPO, 0.17 + 0.44 * s, 0.015 + 0.27 * s * s, rc, Math.atan2(qz, qx));
          var al = prof * 1.5; if (al > 0.9) al = 0.9;
          T *= 1 - al;
          if (T < 0.02) break;
        }
      }
      x = nx; y = ny; z = nz;
    }
    return true;
  }

  // Where the hole sits in the 1512x949 sky (main.js SKY repeats x and y), its size, and
  // the circle inside which the mod draws the turning disc instead of the painted one.
  G.Hole = { x: 177, y: 706, rs: 25, region: REG, inner: 150, outer: 176, fold: FOLD, rnd: rnd, sm: sm, tex: tex, trace: trace };
})(globalThis);
