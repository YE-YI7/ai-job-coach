"use client";

/**
 * 轻量级 Canvas 烟花/彩纸效果
 * 仅在 S/A+/A 等高分时触发
 */

import { useEffect, useRef } from "react";

type Shape = "rect" | "circle" | "star";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  rotation: number;
  rotationSpeed: number;
  shape: Shape;
}

const COLORS = [
  "#f59e0b", "#f97316", "#ef4444", "#8b5cf6",
  "#3b82f6", "#10b981", "#ec4899", "#6366f1",
  "#fbbf24", "#a78bfa",
];

const SHAPES: Shape[] = ["rect", "circle", "star"];

export default function ConfettiOverlay({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!active || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 设置 canvas 大小
    const rect = canvas.parentElement?.getBoundingClientRect();
    canvas.width = rect?.width || window.innerWidth;
    canvas.height = rect?.height || 400;

    const particles: Particle[] = [];

    // 生成粒子 — 两波爆发
    for (let wave = 0; wave < 2; wave++) {
      const count = wave === 0 ? 50 : 35;
      const delay = wave * 20;
      for (let i = 0; i < count; i++) {
        particles.push({
          x: canvas.width * 0.5 + (Math.random() - 0.5) * canvas.width * 0.5,
          y: canvas.height * (0.2 + wave * 0.1),
          vx: (Math.random() - 0.5) * 10,
          vy: -Math.random() * 7 - 2,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          size: Math.random() * 7 + 2,
          life: -delay,
          maxLife: 70 + Math.random() * 50,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.25,
          shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
        });
      }
    }

    function animate() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let alive = false;
      for (const p of particles) {
        p.life++;
        if (p.life < 0) { alive = true; continue; } // wave delay
        if (p.life > p.maxLife) continue;
        alive = true;

        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.14; // gravity
        p.vx *= 0.99;
        p.rotation += p.rotationSpeed;

        const alpha = Math.max(0, 1 - p.life / p.maxLife);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;

        if (p.shape === "circle") {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === "star") {
          ctx.beginPath();
          const s = p.size / 2;
          for (let j = 0; j < 5; j++) {
            const angle = (j * 4 * Math.PI) / 5 - Math.PI / 2;
            const method = j === 0 ? "moveTo" : "lineTo";
            ctx[method](Math.cos(angle) * s, Math.sin(angle) * s);
          }
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }

        ctx.restore();
      }

      if (alive) {
        animRef.current = requestAnimationFrame(animate);
      }
    }

    animate();

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ mixBlendMode: "normal" }}
    />
  );
}
