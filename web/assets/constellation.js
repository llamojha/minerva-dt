/* Llamojha constellation background.
   Recreates the live site's signature animated network: drifting teal
   nodes joined by faint lines, with one warm "anchor" node radiating
   gold spokes. Pure canvas, no deps.

   Usage:
     <canvas data-constellation></canvas>
     <script src="assets/constellation.js"></script>
   Optional attrs on the canvas:
     data-density="1"      // node multiplier
     data-anchor="0.32,0.74" // anchor node position (fraction of w,h)
*/
(function () {
  function init(canvas) {
    if (canvas.dataset.cInit) return;
    canvas.dataset.cInit = "1";
    const ctx = canvas.getContext("2d");
    const density = parseFloat(canvas.dataset.density || "1");
    const anchorFrac = (canvas.dataset.anchor || "0.30,0.76")
      .split(",")
      .map(Number);
    let w, h, dpr, nodes, anchor, raf;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const TEAL = "61, 214, 196";
    const GOLD = "255, 214, 102";

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }

    function build() {
      const count = Math.round((w * h) / 26000 * density);
      nodes = [];
      for (let i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.12,
          vy: (Math.random() - 0.5) * 0.12,
          r: Math.random() * 1.4 + 0.6,
        });
      }
      anchor = { x: anchorFrac[0] * w, y: anchorFrac[1] * h };
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);

      // links between near nodes
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < 130) {
            const o = (1 - d / 130) * 0.16;
            ctx.strokeStyle = `rgba(${TEAL}, ${o})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // gold spokes from the anchor to nearby nodes
      for (const n of nodes) {
        const d = Math.hypot(n.x - anchor.x, n.y - anchor.y);
        if (d < 230) {
          const o = (1 - d / 230) * 0.5;
          ctx.strokeStyle = `rgba(${GOLD}, ${o})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(anchor.x, anchor.y);
          ctx.lineTo(n.x, n.y);
          ctx.stroke();
        }
      }

      // teal nodes
      for (const n of nodes) {
        ctx.fillStyle = `rgba(${TEAL}, 0.7)`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // gold anchor
      ctx.fillStyle = `rgba(${GOLD}, 1)`;
      ctx.shadowColor = `rgba(${GOLD}, 0.8)`;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    function tick() {
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }
      draw();
      raf = requestAnimationFrame(tick);
    }

    resize();
    window.addEventListener("resize", resize);
    if (reduce) draw();
    else tick();
  }

  function boot() {
    document.querySelectorAll("canvas[data-constellation]").forEach(init);
  }
  window.Constellation = { boot, init };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
