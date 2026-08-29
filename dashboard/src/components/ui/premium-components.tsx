'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
  tilt?: boolean;
  glare?: boolean;
}

export function GlassCard({ 
  children, 
  className, 
  glowColor = 'rgba(59, 130, 246, 0.5)',
  tilt = true,
  glare = true,
}: GlassCardProps) {
  const [mousePosition, setMousePosition] = React.useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = React.useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tilt) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setMousePosition({ x, y });
  };

  const rotateX = tilt && isHovered ? (mousePosition.y - 0.5) * -10 : 0;
  const rotateY = tilt && isHovered ? (mousePosition.x - 0.5) * 10 : 0;

  return (
    <motion.div
      className={cn(
        'relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl',
        'shadow-[0_8px_32px_rgba(0,0,0,0.12)]',
        'transition-all duration-300 ease-out',
        className
      )}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        transformStyle: 'preserve-3d',
        transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
      }}
      whileHover={{ y: -4 }}
    >
      {/* Glow effect */}
      {isHovered && (
        <motion.div
          className="absolute -inset-1 rounded-2xl opacity-60 blur-xl"
          style={{ background: glowColor }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        />
      )}
      
      {/* Glare effect */}
      {glare && isHovered && (
        <motion.div
          className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent opacity-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          style={{
            background: `radial-gradient(circle at ${mousePosition.x * 100}% ${mousePosition.y * 100}%, rgba(255,255,255,0.15) 0%, transparent 50%)`,
          }}
        />
      )}
      
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}

interface AnimatedGradientTextProps {
  children: React.ReactNode;
  className?: string;
  colors?: string[];
  speed?: number;
}

export function AnimatedGradientText({ 
  children, 
  className, 
  colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#3b82f6'],
  speed = 5,
}: AnimatedGradientTextProps) {
  return (
    <motion.span
      className={cn('bg-clip-text text-transparent bg-gradient-to-r', className)}
      style={{
        backgroundSize: '200% auto',
        backgroundImage: `linear-gradient(90deg, ${colors.join(', ')})`,
      }}
      animate={{
        backgroundPosition: ['0% center', '200% center'],
      }}
      transition={{
        duration: speed,
        repeat: Infinity,
        ease: 'linear',
      }}
    >
      {children}
    </motion.span>
  );
}

interface FloatingOrbProps {
  className?: string;
  color?: string;
  size?: number;
  speed?: number;
  delay?: number;
}

export function FloatingOrb({ 
  className, 
  color = '#3b82f6', 
  size = 300, 
  speed = 20,
  delay = 0,
}: FloatingOrbProps) {
  return (
    <motion.div
      className={cn('absolute rounded-full blur-3xl opacity-20 pointer-events-none', className)}
      style={{
        width: size,
        height: size,
        background: color,
      }}
      animate={{
        x: [0, 100, -100, 0],
        y: [0, -100, 100, 0],
        scale: [1, 1.2, 0.8, 1],
      }}
      transition={{
        duration: speed,
        delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}

interface MagneticButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  magneticStrength?: number;
}

export function MagneticButton({ 
  children, 
  magneticStrength = 0.3,
  className,
  ...props 
}: MagneticButtonProps) {
  const ref = React.useRef<HTMLButtonElement>(null);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) * magneticStrength;
    const y = (e.clientY - rect.top - rect.height / 2) * magneticStrength;
    setPosition({ x, y });
  };

  const handleMouseLeave = () => {
    setPosition({ x: 0, y: 0 });
  };

  return (
    <motion.button
      ref={ref}
      className={cn('relative inline-flex items-center justify-center', className)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      animate={{ x: position.x, y: position.y }}
      transition={{ type: 'spring', stiffness: 150, damping: 15 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}

interface PulseDotProps {
  className?: string;
  color?: string;
  size?: number;
}

export function PulseDot({ className, color = '#22c55e', size = 8 }: PulseDotProps) {
  return (
    <span className={cn('relative inline-flex', className)}>
      <span 
        className="absolute inline-flex h-full w-full rounded-full opacity-75"
        style={{ 
          backgroundColor: color,
          animation: 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        }}
      />
      <span 
        className="relative inline-flex rounded-full"
        style={{ 
          width: size, 
          height: size, 
          backgroundColor: color,
          boxShadow: `0 0 10px ${color}`,
        }}
      />
      <style jsx>{`
        @keyframes pulse-ring {
          0%, 100% { transform: scale(1); opacity: 0.75; }
          50% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
    </span>
  );
}

interface ShimmerTextProps {
  children: React.ReactNode;
  className?: string;
  speed?: number;
}

export function ShimmerText({ children, className, speed = 3 }: ShimmerTextProps) {
  return (
    <motion.span
      className={cn('relative inline-block', className)}
      style={{
        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
        backgroundSize: '200% 100%',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}
      animate={{
        backgroundPosition: ['200% center', '-200% center'],
      }}
      transition={{
        duration: speed,
        repeat: Infinity,
        ease: 'linear',
      }}
    >
      {children}
    </motion.span>
  );
}
