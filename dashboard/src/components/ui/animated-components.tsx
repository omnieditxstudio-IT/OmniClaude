'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MovingBorderProps {
  children: React.ReactNode;
  className?: string;
  duration?: number;
  colors?: string[];
}

export function MovingBorder({ 
  children, 
  className, 
  duration = 3,
  colors = ['hsl(var(--primary))', 'hsl(var(--primary)/0)'],
}: MovingBorderProps) {
  return (
    <div className={cn('relative rounded-lg', className)}>
      <div className="absolute inset-0 rounded-[inherit] p-[1px] -z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key="border"
            className="absolute inset-0 rounded-[inherit] bg-gradient-to-r"
            style={{
              background: `linear-gradient(90deg, ${colors.join(', ')})`,
              backgroundSize: '200% 100%',
            }}
            initial={{ backgroundPosition: '200% 0' }}
            animate={{ backgroundPosition: '0% 0' }}
            transition={{
              duration,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        </AnimatePresence>
      </div>
      {children}
    </div>
  );
}

interface AnimatedCardProps {
  children: React.ReactNode;
  className?: string;
  hoverScale?: number;
  hoverShadow?: string;
}

export function AnimatedCard({ 
  children, 
  className, 
  hoverScale = 1.02,
  hoverShadow = '0 25px 50px -12px rgb(0 0 0 / 0.25)',
}: AnimatedCardProps) {
  return (
    <motion.div
      className={cn('rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-300', className)}
      whileHover={{ 
        scale: hoverScale,
        boxShadow: hoverShadow,
        y: -4,
      }}
      whileTap={{ scale: 0.98 }}
    >
      {children}
    </motion.div>
  );
}

interface NumberTickerProps {
  value: number;
  className?: string;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}

export function NumberTicker({ 
  value, 
  className, 
  decimals = 0, 
  prefix = '', 
  suffix = '', 
  duration = 1 
}: NumberTickerProps) {
  const [displayValue, setDisplayValue] = React.useState(value);
  const prevValueRef = React.useRef(value);

  React.useEffect(() => {
    if (prevValueRef.current !== value) {
      const start = prevValueRef.current;
      const end = value;
      const startTime = Date.now();
      const animationDuration = duration * 1000;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / animationDuration, 1);
        
        // Easing function
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = start + (end - start) * eased;
        
        setDisplayValue(current);
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setDisplayValue(end);
          prevValueRef.current = end;
        }
      };

      requestAnimationFrame(animate);
    }
  }, [value, duration]);

  const formatted = displayValue.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className={cn('font-mono tabular-nums', className)}>
      {prefix}{formatted}{suffix}
    </span>
  );
}

interface MarqueeProps {
  children: React.ReactNode;
  className?: string;
  speed?: number;
  direction?: 'left' | 'right';
  pauseOnHover?: boolean;
}

export function Marquee({ 
  children, 
  className, 
  speed = 50, 
  direction = 'left',
  pauseOnHover = true,
}: MarqueeProps) {
  const [contentWidth, setContentWidth] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (containerRef.current) {
      setContentWidth(containerRef.current.scrollWidth);
    }
  }, []);

  const duration = contentWidth / speed;

  return (
    <div className={cn('overflow-hidden', className)}>
      <div
        ref={containerRef}
        style={{ display: 'flex', width: 'fit-content' }}
      >
        <motion.div
          style={{ display: 'flex', whiteSpace: 'nowrap' }}
          animate={{
            x: direction === 'left' ? -contentWidth : contentWidth,
          }}
          transition={{
            duration,
            repeat: Infinity,
            ease: 'linear',
          }}
        >
          {children}
        </motion.div>
        <motion.div
          style={{ display: 'flex', whiteSpace: 'nowrap' }}
          animate={{
            x: direction === 'left' ? 0 : -contentWidth * 2,
          }}
          transition={{
            duration,
            repeat: Infinity,
            ease: 'linear',
          }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  delay?: number;
  duration?: number;
}

export function Reveal({ 
  children, 
  className, 
  direction = 'up', 
  delay = 0, 
  duration = 0.5 
}: RevealProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  const directionMap = {
    up: { y: 30 },
    down: { y: -30 },
    left: { x: 30 },
    right: { x: -30 },
  };

  return (
    <motion.div
      ref={ref}
      className={cn('overflow-hidden', className)}
      initial={{ opacity: 0, ...directionMap[direction] }}
      animate={isVisible ? { opacity: 1, x: 0, y: 0 } : {}}
      transition={{ duration, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

interface StaggerContainerProps {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
}

export function StaggerContainer({ 
  children, 
  className, 
  staggerDelay = 0.1, 
  direction = 'up' 
}: StaggerContainerProps) {
  const childArray = React.Children.toArray(children);
  
  return (
    <div className={cn('flex flex-col', className)}>
      {childArray.map((child, index) => (
        <motion.div
          key={child.key || index}
          initial={{ opacity: 0, y: direction === 'up' ? 20 : -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ 
            duration: 0.5, 
            delay: index * staggerDelay,
            ease: 'easeOut' 
          }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}

interface PulseRingProps {
  className?: string;
  color?: string;
  size?: number;
  count?: number;
}

export function PulseRing({ 
  className, 
  color = 'hsl(var(--primary))', 
  size = 40, 
  count = 3 
}: PulseRingProps) {
  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full"
          style={{
            border: `2px solid ${color}`,
            borderRadius: '9999px',
            width: size,
            height: size,
          }}
          animate={{
            scale: [0.5, 1.5],
            opacity: [0.8, 0],
          }}
          transition={{
            duration: 2,
            delay: i * 0.5,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  );
}