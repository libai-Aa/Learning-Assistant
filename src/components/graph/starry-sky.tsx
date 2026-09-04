/**
 * 星空背景组件
 * 使用Canvas渲染星空粒子效果
 */

import React, { useEffect, useRef, useCallback } from 'react';
import type { StarrySkyConfig } from '../../types/graph';
import { DEFAULT_STARRY_SKY_CONFIG } from '../../types/graph';

interface StarrySkyProps {
  /** 星空配置 */
  config?: Partial<StarrySkyConfig>;
  /** 画布类名 */
  className?: string;
  /** 子组件 */
  children?: React.ReactNode;
}

/**
 * 星星粒子
 */
interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  baseOpacity: number;
  twinkleSpeed: number;
  twinklePhase: number;
}

/**
 * 流星
 */
interface ShootingStar {
  x: number;
  y: number;
  length: number;
  speed: number;
  angle: number;
  opacity: number;
  life: number;
}

/**
 * 星空背景组件
 */
export const StarrySky: React.FC<StarrySkyProps> = ({
  config,
  className = '',
  children,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const starsRef = useRef<Star[]>([]);
  const shootingStarsRef = useRef<ShootingStar[]>([]);
  const animationRef = useRef<number>(0);
  const configRef = useRef<StarrySkyConfig>({
    ...DEFAULT_STARRY_SKY_CONFIG,
    ...config,
  });

  // 更新配置
  useEffect(() => {
    if (config) {
      configRef.current = { ...DEFAULT_STARRY_SKY_CONFIG, ...config };
    }
  }, [config]);

  // 初始化星星
  const initializeStars = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { starCount, minStarSize, maxStarSize, minOpacity, maxOpacity } = configRef.current;
    const width = canvas.width;
    const height = canvas.height;

    const stars: Star[] = [];
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: minStarSize + Math.random() * (maxStarSize - minStarSize),
        opacity: minOpacity + Math.random() * (maxOpacity - minOpacity),
        baseOpacity: minOpacity + Math.random() * (maxOpacity - minOpacity),
        twinkleSpeed: 0.5 + Math.random() * 2,
        twinklePhase: Math.random() * Math.PI * 2,
      });
    }

    starsRef.current = stars;
  }, []);

  // 创建流星
  const createShootingStar = useCallback((): ShootingStar => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return {
        x: 0,
        y: 0,
        length: 0,
        speed: 0,
        angle: 0,
        opacity: 0,
        life: 0,
      };
    }

    const angle = Math.PI / 4 + Math.random() * 0.2; // 45度左右
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.5,
      length: 50 + Math.random() * 100,
      speed: 10 + Math.random() * 15,
      angle,
      opacity: 1,
      life: 60 + Math.random() * 60,
    };
  }, []);

  // 动画循环
  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { twinkle, twinkleSpeed, shootingStar, shootingStarFrequency } = configRef.current;

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制星星
    for (const star of starsRef.current) {
      // 闪烁效果
      if (twinkle) {
        star.twinklePhase += 0.01 * twinkleSpeed;
        star.opacity = star.baseOpacity * (0.5 + 0.5 * Math.sin(star.twinklePhase));
      }

      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
      ctx.fill();

      // 发光效果
      if (star.size > 1.5) {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity * 0.1})`;
        ctx.fill();
      }
    }

    // 流星效果
    if (shootingStar && Math.random() < shootingStarFrequency) {
      shootingStarsRef.current.push(createShootingStar());
    }

    // 更新和绘制流星
    for (let i = shootingStarsRef.current.length - 1; i >= 0; i--) {
      const meteor = shootingStarsRef.current[i];
      meteor.x += Math.cos(meteor.angle) * meteor.speed;
      meteor.y += Math.sin(meteor.angle) * meteor.speed;
      meteor.life--;
      meteor.opacity = meteor.life / 120;

      if (meteor.life <= 0) {
        shootingStarsRef.current.splice(i, 1);
        continue;
      }

      // 绘制流星
      const gradient = ctx.createLinearGradient(
        meteor.x,
        meteor.y,
        meteor.x - Math.cos(meteor.angle) * meteor.length,
        meteor.y - Math.sin(meteor.angle) * meteor.length
      );
      gradient.addColorStop(0, `rgba(255, 255, 255, ${meteor.opacity})`);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.beginPath();
      ctx.moveTo(meteor.x, meteor.y);
      ctx.lineTo(
        meteor.x - Math.cos(meteor.angle) * meteor.length,
        meteor.y - Math.sin(meteor.angle) * meteor.length
      );
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    animationRef.current = requestAnimationFrame(animate);
  }, [createShootingStar]);

  // 设置Canvas尺寸
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    initializeStars();
  }, [initializeStars]);

  // 初始化和清理
  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [resizeCanvas]);

  // 启动动画
  useEffect(() => {
    animate();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animate]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{
        background: 'linear-gradient(135deg, #0a0a23 0%, #1a0a2e 50%, #0f0f3d 100%)',
      }}
    >
      {/* 星空Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ pointerEvents: 'none' }}
      />

      {/* 内容层 */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};

/**
 * 星空背景Hook
 * 在非Canvas组件中使用
 */
export const useStarrySky = (config?: Partial<StarrySkyConfig>) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const finalConfig = { ...DEFAULT_STARRY_SKY_CONFIG, ...config };
    const { starCount, minStarSize, maxStarSize, minOpacity, maxOpacity } = finalConfig;

    // 设置Canvas尺寸
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();

    // 创建星星
    const stars: Star[] = [];
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: minStarSize + Math.random() * (maxStarSize - minStarSize),
        opacity: minOpacity + Math.random() * (maxOpacity - minOpacity),
        baseOpacity: minOpacity + Math.random() * (maxOpacity - minOpacity),
        twinkleSpeed: 0.5 + Math.random() * 2,
        twinklePhase: Math.random() * Math.PI * 2,
      });
    }

    let animationId: number;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const star of stars) {
        star.twinklePhase += 0.01 * star.twinkleSpeed;
        star.opacity = star.baseOpacity * (0.5 + 0.5 * Math.sin(star.twinklePhase));

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
        ctx.fill();
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [config]);

  return canvasRef;
};

export default StarrySky;