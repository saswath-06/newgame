"use client";

import { useEffect, useRef } from "react";

/**
 * Lightweight canvas confetti — rose/violet/peach squares with a few
 * hearts mixed in. Fire-and-forget: mounts, bursts, self-cleans.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  color: string;
  heart: boolean;
  life: number;
}

const COLORS = ["#FF4D7D", "#8B5CF6", "#FFB86B", "#FF7DA1", "#AB8BFA"];

export function Confetti({ burst = 120 }: { burst?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();

    const particles: Particle[] = [];
    for (let i = 0; i < burst; i++) {
      const fromLeft = i % 2 === 0;
      particles.push({
        x: (fromLeft ? 0.15 : 0.85) * canvas.width + (Math.random() - 0.5) * 60,
        y: canvas.height * 0.65,
        vx: (fromLeft ? 1 : -1) * (2 + Math.random() * 5) * dpr,
        vy: -(7 + Math.random() * 7) * dpr,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.3,
        size: (4 + Math.random() * 5) * dpr,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        heart: Math.random() < 0.18,
        life: 1,
      });
    }

    let raf = 0;
    const gravity = 0.18 * dpr;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += gravity;
        p.vx *= 0.99;
        p.rot += p.vrot;
        p.life -= 0.006;
        if (p.life <= 0 || p.y > canvas.height + 40) continue;
        alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
        if (p.heart) {
          ctx.fillStyle = p.color;
          ctx.font = `${p.size * 2.2}px serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("♥", 0, 0);
        } else {
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        }
        ctx.restore();
      }
      if (alive) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [burst]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}
