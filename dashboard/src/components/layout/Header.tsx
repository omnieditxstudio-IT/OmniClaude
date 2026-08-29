'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Bell, Search, Moon, Sun, Command } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { MagneticButton, PulseDot } from '@/components/ui/premium-components';

export function Header() {
  const { user, signOut } = useAuth();
  const [isDark, setIsDark] = React.useState(true);
  const [searchFocused, setSearchFocused] = React.useState(false);

  return (
    <header className="sticky top-0 z-30 h-16 px-6 flex items-center justify-between bg-black/20 backdrop-blur-2xl border-b border-white/5">
      {/* Left side - Search */}
      <div className="flex items-center gap-4 flex-1">
        <motion.div
          className={cn(
            'relative flex items-center rounded-xl transition-all duration-300',
            searchFocused ? 'w-96' : 'w-64'
          )}
        >
          <Search className="absolute left-3 h-4 w-4 text-white/30" />
          <Input
            placeholder="Search anything..."
            className={cn(
              'pl-10 pr-4 h-10 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/30',
              'focus:border-white/20 focus:ring-2 focus:ring-blue-500/20',
              'transition-all duration-300'
            )}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          <div className="absolute right-3 flex items-center gap-1 pointer-events-none">
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-white/40 bg-white/5 rounded border border-white/10">
              <Command className="h-3 w-3" />K
            </kbd>
          </div>
        </motion.div>
      </div>

      {/* Right side - Actions */}
      <div className="flex items-center gap-2">
        {/* Status indicator */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
          <PulseDot size={6} color="#22c55e" />
          <span className="text-xs font-medium text-white/70">All Systems Operational</span>
        </div>

        {/* Theme toggle */}
        <MagneticButton>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl text-white/60 hover:text-white hover:bg-white/5"
            onClick={() => setIsDark(!isDark)}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </MagneticButton>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <MagneticButton>
              <Button
                variant="ghost"
                size="icon"
                className="relative h-9 w-9 rounded-xl text-white/60 hover:text-white hover:bg-white/5"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
              </Button>
            </MagneticButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 bg-black/80 backdrop-blur-xl border-white/10 text-white">
            <div className="flex items-center justify-between px-4 py-3">
              <h4 className="font-semibold text-sm">Notifications</h4>
              <span className="text-xs text-white/40">3 new</span>
            </div>
            <DropdownMenuSeparator className="bg-white/10" />
            <div className="p-2 space-y-1">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <Bell className="h-4 w-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white/90">New deployment successful</p>
                    <p className="text-xs text-white/40">Production v2.4.1 is live</p>
                  </div>
                </div>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <MagneticButton>
              <Button variant="ghost" className="relative h-9 rounded-xl pl-2 pr-3 text-white/60 hover:text-white hover:bg-white/5">
                <Avatar className="h-7 w-7 ring-2 ring-white/10">
                  <AvatarImage src={user?.avatar || ''} alt={user?.name || ''} />
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs font-bold">
                    {user?.name?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="ml-2 text-sm font-medium hidden lg:inline">{user?.name}</span>
              </Button>
            </MagneticButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-black/80 backdrop-blur-xl border-white/10 text-white">
            <div className="flex items-center gap-3 p-3">
              <Avatar className="h-10 w-10 ring-2 ring-white/10">
                <AvatarImage src={user?.avatar || ''} alt={user?.name || ''} />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold">
                  {user?.name?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium text-white">{user?.name}</p>
                <p className="text-xs text-white/40">{user?.email}</p>
              </div>
            </div>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem asChild>
              <a href="/settings" className="flex w-full items-center justify-start cursor-pointer hover:bg-white/5">
                <Command className="mr-2 h-4 w-4" />
                Profile
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem onClick={() => signOut()} className="text-destructive focus:text-destructive cursor-pointer hover:bg-red-500/10">
              <Command className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
