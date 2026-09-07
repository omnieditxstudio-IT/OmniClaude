'use client';

import * as React from 'react';
import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { cn } from '@/lib/utils';
import { BackgroundBeamsWithMouse, DotPattern } from '@/components/ui/animated-backgrounds';

interface LayoutProps {
  children?: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [sidebarCollapsed] = React.useState(false);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden">
      {/* Premium animated background */}
      <BackgroundBeamsWithMouse colors={['#3b82f6', '#8b5cf6', '#ec4899']} />
      <DotPattern color="#ffffff" size={32} />

      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div
        className={cn(
          'transition-all duration-500 ease-out min-h-screen',
          sidebarCollapsed ? 'lg:ml-18' : 'lg:ml-72'
        )}
      >
        <Header />
        <main className="relative p-6 lg:p-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ 
              duration: 0.6, 
              ease: [0.25, 0.46, 0.45, 0.94],
              staggerChildren: 0.1 
            }}
          >
            {children || <Outlet />}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
