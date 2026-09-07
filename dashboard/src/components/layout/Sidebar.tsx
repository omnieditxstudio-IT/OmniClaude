'use client';

import * as React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Key,
  Server,
  GitBranch,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Zap,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { FloatingOrb, PulseDot, MagneticButton } from '@/components/ui/premium-components';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, badge: null },
  { name: 'API Keys', href: '/keys', icon: Key, badge: 'New' },
  { name: 'Endpoints', href: '/endpoints', icon: Server, badge: null },
  { name: 'Model Mappings', href: '/mappings', icon: GitBranch, badge: null },
  { name: 'Personas', href: '/personas', icon: LayoutDashboard, badge: 'AI' },
  { name: 'Analytics', href: '/analytics', icon: BarChart3, badge: null },
  { name: 'Settings', href: '/settings', icon: Settings, badge: null },
];

export function Sidebar() {
  const pathname = useLocation().pathname;
  const [collapsed, setCollapsed] = React.useState(false);
  const { user, signOut } = useAuth();

  return (
    <TooltipProvider>
      <motion.aside
        initial={{ width: collapsed ? 72 : 280 }}
        animate={{ width: collapsed ? 72 : 280 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        className={cn(
          'fixed left-0 top-0 z-40 h-screen',
          'bg-black/40 backdrop-blur-2xl',
          'border-r border-white/10',
          'flex flex-col transition-all duration-300',
          collapsed ? 'w-18' : 'w-72'
        )}
      >
        {/* Animated orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <FloatingOrb color="#3b82f6" size={200} speed={25} delay={0} className="top-10 -left-20" />
          <FloatingOrb color="#8b5cf6" size={150} speed={20} delay={2} className="bottom-20 -right-10" />
        </div>

        {/* Logo */}
        <div className="relative flex h-16 items-center justify-between px-4 border-b border-white/10">
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3"
            >
              <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <Zap className="h-5 w-5 text-white" />
                <motion.div
                  className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-400 to-purple-500"
                  animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
                  transition={{ duration: 3, repeat: Infinity }}
                />
              </div>
              <div>
                <motion.span 
                  className="flex items-center gap-2 font-bold text-lg bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  LLM Gateway
                </motion.span>
                <div className="flex items-center gap-1">
                  <PulseDot size={6} color="#22c55e" />
                  <span className="text-[10px] text-green-400 font-medium uppercase tracking-wider">Online</span>
                </div>
              </div>
            </motion.div>
          )}
          <MagneticButton>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed(!collapsed)}
              className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </MagneticButton>
        </div>

        {/* Navigation */}
        <nav className="relative flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.div
                key="nav-items"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <p className="px-3 text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
                  Navigation
                </p>
                {navigation.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  const Icon = item.icon;
                  return (
                    <Tooltip key={item.name} delayDuration={200}>
                      <TooltipTrigger asChild>
                        <Link
                          to={item.href}
                          className={cn(
                            'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 group',
                            isActive
                              ? 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]'
                              : 'text-white/60 hover:text-white hover:bg-white/5'
                          )}
                        >
                          {isActive && (
                            <motion.div
                              layoutId="sidebar-active-indicator"
                              className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-white/10"
                              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            />
                          )}
                          <div className={cn(
                            'relative h-8 w-8 rounded-lg flex items-center justify-center transition-all duration-200',
                            isActive ? 'bg-white/10 text-white' : 'text-white/40 group-hover:text-white/80 group-hover:bg-white/5'
                          )}>
                            <Icon className="h-4 w-4" aria-hidden="true" />
                            {isActive && (
                              <motion.div
                                layoutId="sidebar-icon-glow"
                                className="absolute inset-0 rounded-lg bg-blue-500/20 blur-md"
                                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                              />
                            )}
                          </div>
                          <span className="relative">{item.name}</span>
                          {item.badge && (
                            <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right" align="center" className="bg-black/80 backdrop-blur-xl border-white/10">
                        <p>{item.name}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </motion.div>
            )}
            {collapsed && (
              <motion.div
                key="nav-items-collapsed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-1"
              >
                {navigation.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  const Icon = item.icon;
                  return (
                    <Tooltip key={item.name} delayDuration={200}>
                      <TooltipTrigger asChild>
                        <Link
                          to={item.href}
                          className={cn(
                            'relative flex items-center justify-center rounded-xl py-2.5 text-sm font-medium transition-all duration-200',
                            isActive
                              ? 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                              : 'text-white/60 hover:text-white hover:bg-white/5'
                          )}
                        >
                          {isActive && (
                            <motion.div
                              layoutId="sidebar-active-indicator-collapsed"
                              className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-white/10"
                              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            />
                          )}
                          <Icon className="h-5 w-5 relative" aria-hidden="true" />
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right" align="center" className="bg-black/80 backdrop-blur-xl border-white/10">
                        <p>{item.name}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </nav>

        {/* user Menu */}
        <div className="relative p-3 border-t border-white/10">
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
              >
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="w-full justify-start gap-3 h-12 px-3 rounded-xl hover:bg-white/5 text-white/70 hover:text-white">
                      <Avatar className="h-9 w-9 ring-2 ring-white/10">
                        <AvatarImage src={user?.avatar || ''} alt={user?.name || ''} />
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold">
                          {user?.name?.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="text-left flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                        <p className="text-xs text-white/40 truncate">{user?.email}</p>
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-black/80 backdrop-blur-xl border-white/10 text-white">
                    <DropdownMenuItem asChild>
                      <Link to="/settings" className="flex w-full items-center justify-start cursor-pointer hover:bg-white/5">
                        <User className="mr-2 h-4 w-4" />
                        Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-white/10" />
                    <DropdownMenuItem onClick={() => signOut()} className="text-destructive focus:text-destructive cursor-pointer hover:bg-red-500/10">
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </motion.div>
            )}
            {collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-white/5">
                          <Avatar className="h-9 w-9 ring-2 ring-white/10">
                            <AvatarImage src={user?.avatar || ''} alt={user?.name || ''} />
                            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold">
                              {user?.name?.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="bg-black/80 backdrop-blur-xl border-white/10">
                        <p>{user?.name}</p>
                      </TooltipContent>
                    </Tooltip>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-black/80 backdrop-blur-xl border-white/10 text-white">
                    <DropdownMenuItem asChild>
                      <Link to="/settings" className="flex w-full items-center justify-start cursor-pointer hover:bg-white/5">
                        <User className="mr-2 h-4 w-4" />
                        Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-white/10" />
                    <DropdownMenuItem onClick={() => signOut()} className="text-destructive focus:text-destructive cursor-pointer hover:bg-red-500/10">
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}
