'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { BackgroundBeamsWithMouse, DotPattern } from '@/components/ui/animated-backgrounds';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  GlassCard,
  AnimatedGradientText,
  FloatingOrb,
  MagneticButton,
  PulseDot,
  NumberTicker,
  Reveal,
  StaggerContainer,
  AnimatedCard,
} from '@/components/ui/premium-components';
import { api, User } from '@/lib/api';
import {
  Key,
  Server,
  GitBranch,
  BarChart3,
  ExternalLink,
  ArrowRight,
  CheckCircle,
  Zap,
  Shield,
  Globe,
  Sparkles,
  Rocket,
  Crown,
} from 'lucide-react';

const features = [
  { icon: Key, title: 'API Keys', desc: 'Manage encrypted API keys for multiple providers', href: '/keys', color: 'from-blue-500 to-cyan-500' },
  { icon: Server, title: 'Endpoints', desc: 'Configure OpenRouter, Ollama, Vertex AI, and custom endpoints', href: '/endpoints', color: 'from-green-500 to-emerald-500' },
  { icon: GitBranch, title: 'Model Mappings', desc: 'Map any Claude model ID to any provider model with fallbacks', href: '/mappings', color: 'from-purple-500 to-pink-500' },
  { icon: BarChart3, title: 'Analytics', desc: 'Track usage, latency, costs, and errors in real-time', href: '/analytics', color: 'from-orange-500 to-red-500' },
];

export function DashboardPage() {
  const { user, refreshUser } = useAuth();
  const [stats, setStats] = React.useState({
    totalKeys: 0,
    activeEndpoints: 0,
    activeMappings: 0,
    totalRequests: 0,
  });

  React.useEffect(() => {
    const fetchStats = async () => {
      try {
        const [keys, endpoints, mappings, logs] = await Promise.all([
          api.get('/keys'),
          api.get('/endpoints'),
          api.get('/mappings'),
          api.get('/admin/logs', { params: { limit: 1 } }).catch(() => ({ data: { total: 0 } })),
        ]);
        setStats({
          totalKeys: keys.data.keys?.length || 0,
          activeEndpoints: endpoints.data.endpoints?.filter((e: any) => e.isActive).length || 0,
          activeMappings: mappings.data.mappings?.filter((m: any) => m.isActive).length || 0,
          totalRequests: logs.data.total || 0,
        });
      } catch {
        // Ignore errors
      }
    };
    fetchStats();
  }, [user]);

  const statCards = [
    { 
      label: 'API Keys', 
      value: stats.totalKeys, 
      icon: Key, 
      color: 'text-blue-400', 
      bg: 'bg-blue-500/10',
      glowColor: 'rgba(59, 130, 246, 0.5)',
      trend: '+12%'
    },
    { 
      label: 'Active Endpoints', 
      value: stats.activeEndpoints, 
      icon: Server, 
      color: 'text-green-400', 
      bg: 'bg-green-500/10',
      glowColor: 'rgba(34, 197, 94, 0.5)',
      trend: '+8%'
    },
    { 
      label: 'Model Mappings', 
      value: stats.activeMappings, 
      icon: GitBranch, 
      color: 'text-purple-400', 
      bg: 'bg-purple-500/10',
      glowColor: 'rgba(147, 51, 234, 0.5)',
      trend: '+5%'
    },
    { 
      label: 'Total Requests', 
      value: stats.totalRequests, 
      icon: BarChart3, 
      color: 'text-orange-400', 
      bg: 'bg-orange-500/10',
      glowColor: 'rgba(249, 115, 22, 0.5)',
      trend: '+24%'
    },
  ];

  return (
    <div className="relative overflow-hidden">
      {/* Animated Background */}
      <BackgroundBeamsWithMouse colors={['#3b82f6', '#8b5cf6', '#ec4899']} />
      <DotPattern color="#ffffff" size={32} />

      {/* Floating orbs */}
      <FloatingOrb color="#3b82f6" size={400} speed={25} delay={0} className="top-20 -left-48 opacity-30" />
      <FloatingOrb color="#8b5cf6" size={300} speed={20} delay={2} className="bottom-20 -right-32 opacity-20" />
      <FloatingOrb color="#ec4899" size={250} speed={30} delay={4} className="top-1/2 left-1/2 opacity-10" />

      <div className="relative space-y-8">
        {/* Hero Section */}
        <section className="space-y-8">
          <Reveal direction="up">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <PulseDot size={8} color="#22c55e" />
                  <span className="text-xs font-medium text-green-400 uppercase tracking-wider">System Online</span>
                </div>
                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="text-4xl lg:text-5xl font-bold tracking-tight"
                >
                  <AnimatedGradientText colors={['#60a5fa', '#a78bfa', '#f472b6', '#60a5fa']} speed={8}>
                    Welcome back, {user?.name?.split(' ')[0] || 'User'}
                  </AnimatedGradientText>
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.6 }}
                  className="text-lg text-white/50 max-w-2xl"
                >
                  Your universal LLM gateway is ready. Configure providers, map models, and use any LLM with Claude Code, Cursor, and more.
                </motion.p>
              </div>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, duration: 0.6 }}
                className="flex gap-3"
              >
                <MagneticButton>
                  <Button asChild size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white border-0 shadow-lg shadow-blue-500/25">
                    <a href="/keys">
                      <Zap className="mr-2 h-4 w-4" />
                      Add API Key
                    </a>
                  </Button>
                </MagneticButton>
                <MagneticButton>
                  <Button asChild variant="outline" size="lg" className="bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20">
                    <a href="/mappings">
                      <GitBranch className="mr-2 h-4 w-4" />
                      Create Mapping
                    </a>
                  </Button>
                </MagneticButton>
              </motion.div>
            </div>
          </Reveal>

          {/* Stats Grid */}
          <Reveal direction="up" delay={0.2}>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {statCards.map((stat, index) => (
                <GlassCard
                  key={stat.label}
                  glowColor={stat.glowColor}
                  className="stagger-1 group"
                >
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-white/50">{stat.label}</p>
                        <div className="mt-2 flex items-baseline gap-2">
                          <NumberTicker
                            value={stat.value}
                            className="text-3xl font-bold text-white"
                            duration={1.5}
                          />
                          <span className="text-xs font-medium text-green-400 flex items-center gap-0.5">
                            <CheckCircle className="h-3 w-3" />
                            {stat.trend}
                          </span>
                        </div>
                      </div>
                      <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center', stat.bg)}>
                        <stat.icon className={cn('h-6 w-6', stat.color)} />
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-4 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(stat.value * 10, 100)}%` }}
                        transition={{ duration: 1.5, delay: 0.5, ease: 'easeOut' }}
                      />
                    </div>
                  </CardContent>
                </GlassCard>
              ))}
            </div>
          </Reveal>
        </section>

        {/* Features Grid */}
        <section>
          <Reveal direction="up">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-white">Quick Actions</h2>
                <p className="text-white/50">Set up your gateway in minutes</p>
              </div>
            </div>
          </Reveal>

          <StaggerContainer staggerDelay={0.1} direction="up">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {features.map((feature, index) => (
                <GlassCard
                  key={feature.title}
                  glowColor={`linear-gradient(135deg, ${feature.color.includes('blue') ? '#3b82f6' : feature.color.includes('green') ? '#22c55e' : feature.color.includes('purple') ? '#a855f7' : '#f97316'}, transparent)`}
                  className="group"
                >
                  <CardContent className="p-6">
                    <div className={cn('h-12 w-12 rounded-xl bg-gradient-to-br flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg', feature.color)}>
                      <feature.icon className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="font-semibold mb-1 text-white">{feature.title}</h3>
                    <p className="text-sm text-white/50 mb-4">{feature.desc}</p>
                    <Button asChild variant="ghost" className="w-full justify-start gap-1 px-0 text-white/60 hover:text-white group-hover:text-white">
                      <a href={feature.href}>
                        Get started <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </a>
                    </Button>
                  </CardContent>
                </GlassCard>
              ))}
            </div>
          </StaggerContainer>
        </section>

        {/* How it works */}
        <section className="mt-8">
          <Reveal direction="up">
            <h2 className="text-2xl font-bold text-white mb-6">How it works</h2>
          </Reveal>
          <StaggerContainer staggerDelay={0.15} direction="up">
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { icon: Shield, title: '1. Add Providers', desc: 'Add your API keys for OpenRouter, Ollama, Vertex AI, or any custom OpenAI-compatible endpoint.', color: 'from-blue-500 to-cyan-500' },
                { icon: GitBranch, title: '2. Map Models', desc: 'Map any Claude model ID (opus, sonnet, haiku) to any provider model with fallback chains.', color: 'from-purple-500 to-pink-500' },
                { icon: Globe, title: '3. Use Anywhere', desc: 'Set ANTHROPIC_BASE_URL to your gateway and use Claude Code with any LLM unlimited.', color: 'from-green-500 to-emerald-500' },
              ].map((step, index) => (
                <GlassCard key={step.title} glowColor={step.color} className="text-center p-8">
                  <CardContent className="p-0">
                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br flex items-center justify-center mx-auto mb-4 shadow-lg" style={{ background: `linear-gradient(135deg, var(--tw-gradient-stops))` }}>
                      <step.icon className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="font-semibold mb-2 text-white">{step.title}</h3>
                    <p className="text-sm text-white/50">{step.desc}</p>
                  </CardContent>
                </GlassCard>
              ))}
            </div>
          </StaggerContainer>
        </section>

        {/* Quick Start CTA */}
        <section className="mt-8">
          <Reveal direction="up">
            <GlassCard 
              glowColor="linear-gradient(135deg, #3b82f6, #8b5cf6, #ec4899)"
              className="p-8 lg:p-10"
            >
              <CardContent className="p-0">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Rocket className="h-6 w-6 text-blue-400" />
                      <h3 className="text-2xl font-bold text-white">Ready to get started?</h3>
                    </div>
                    <p className="text-white/50 max-w-xl">
                      Add your first API key and create a model mapping to start using any LLM with Claude Code, Cursor, Codex, and all your favorite tools.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <MagneticButton>
                      <Button asChild size="lg" className="bg-white text-black hover:bg-white/90 font-semibold">
                        <a href="/keys">
                          <Key className="mr-2 h-4 w-4" />
                          Add API Key
                        </a>
                      </Button>
                    </MagneticButton>
                    <MagneticButton>
                      <Button asChild variant="outline" size="lg" className="bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20">
                        <a href="/mappings">
                          <GitBranch className="mr-2 h-4 w-4" />
                          Create Mapping
                        </a>
                      </Button>
                    </MagneticButton>
                  </div>
                </div>
              </CardContent>
            </GlassCard>
          </Reveal>
        </section>

        {/* Premium badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="flex items-center justify-center gap-2 py-8"
        >
          <Crown className="h-5 w-5 text-yellow-500" />
          <span className="text-sm font-medium text-white/40">Universal LLM Gateway - Free & Open Source</span>
        </motion.div>
      </div>
    </div>
  );
}
