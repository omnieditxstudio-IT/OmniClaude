'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface BackgroundBeamsProps {
  className?: string;
  colors?: string[];
  duration?: number;
}

export function BackgroundBeams({ className, colors = ['#3b82f6', '#8b5cf6', '#ec4899'], duration = 20 }: BackgroundBeamsProps) {
  const [beams] = React.useState(
    Array.from({ length: 3 }, (_, i) => ({
      id: i,
      color: colors[i % colors.length],
      delay: i * (duration / 3),
    }))
  );

  return (
    <div className={cn('fixed inset-0 -z-10 overflow-hidden', className)} aria-hidden="true">
      {beams.map((beam) => (
        <motion.div
          key={beam.id}
          className="absolute rounded-full blur-3xl opacity-30"
          style={{
            width: '600px',
            height: '600px',
            background: beam.color,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration,
            delay: beam.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

interface BackgroundBeamsWithMouseProps {
  className?: string;
  colors?: string[];
}

export function BackgroundBeamsWithMouse({ className, colors = ['#3b82f6', '#8b5cf6', '#ec4899'] }: BackgroundBeamsWithMouseProps) {
  const [mousePosition, setMousePosition] = React.useState({ x: 0.5, y: 0.5 });

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className={cn('fixed inset-0 -z-10 overflow-hidden', className)} aria-hidden="true">
      {colors.map((color, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full blur-3xl opacity-30"
          style={{
            width: '500px',
            height: '500px',
            background: color,
            top: `${mousePosition.y * 100}%`,
            left: `${mousePosition.x * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 15 + i * 3,
            delay: i * 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

interface SpotlightProps {
  className?: string;
  color?: string;
  opacity?: number;
}

export function Spotlight({ className, color = '#3b82f6', opacity = 0.15 }: SpotlightProps) {
  const [mousePosition, setMousePosition] = React.useState({ x: 0.5, y: 0.5 });

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div
      className={cn('fixed inset-0 -z-10 pointer-events-none', className)}
      style={{
        background: `radial-gradient(600px circle at ${mousePosition.x * 100}% ${mousePosition.y * 100}%, ${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')} 0%, transparent 50%)`,
      }}
      aria-hidden="true"
    />
  );
}

interface GridPatternProps {
  className?: string;
  color?: string;
  size?: number;
}

export function GridPattern({ className, color = 'currentColor', size = 40 }: GridPatternProps) {
  return (
    <div
      className={cn('fixed inset-0 -z-10 opacity-[0.03] pointer-events-none', className)}
      style={{
        backgroundImage: `
          linear-gradient(${color} 1px, transparent 1px),
          linear-gradient(90deg, ${color} 1px, transparent 1px)
        `,
        backgroundSize: `${size}px ${size}px`,
      }}
      aria-hidden="true"
    />
  );
}

interface DotPatternProps {
  className?: string;
  color?: string;
  size?: number;
  spacing?: number;
}

export function DotPattern({ className, color = 'currentColor', size = 2, spacing = 32 }: DotPatternProps) {
  return (
    <div
      className={cn('fixed inset-0 -z-10 opacity-[0.05] pointer-events-none', className)}
      style={{
        backgroundImage: `radial-gradient(${color} ${size}px, transparent ${size}px)`,
        backgroundSize: `${spacing}px ${spacing}px`,
      }}
      aria-hidden="true"
    />
  );
}