'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { BackgroundBeamsWithMouse, Spotlight, GridPattern } from '@/components/ui/animated-backgrounds';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AnimatedCard, NumberTicker, Reveal, StaggerContainer } from '@/components/ui/animated-components';
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
} from 'lucide-react';

const features = [
  { icon: Key, title: 'API Keys', desc: 'Manage encrypted API keys for multiple providers', href: '/keys' },
  { icon: Server, title: 'Endpoints', desc: 'Configure OpenRouter, Ollama, Vertex AI, and custom endpoints', href: '/endpoints' },
  { icon: GitBranch, title: 'Model Mappings', desc: 'Map any Claude model ID to any provider model with fallbacks', href: '/mappings' },
  { icon: BarChart3, title: 'Analytics', desc: 'Track usage, latency, costs, and errors in real-time', href: '/analytics' },
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
    { label: 'API Keys', value: stats.totalKeys, icon: Key, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Active Endpoints', value: stats.activeEndpoints, icon: Server, color: 'text-green-500', bg: 'bg-green-500/10' },
    { label: 'Model Mappings', value: stats.activeMappings, icon: GitBranch, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { label: 'Total Requests', value: stats.totalRequests, icon: BarChart3, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  ];

  return (
    <div className="relative overflow-hidden">
      {/* Animated Background */}
      <BackgroundBeamsWithMouse colors={['hsl(var(--primary))', 'hsl(var(--primary)/0.5)', 'hsl(var(--accent))']} />
      <Spotlight color="hsl(var(--primary))" opacity={0.1} />
      <GridPattern color="hsl(var(--primary))" size={60} />

      <div className="relative space-y-8">
        {/* Hero Section */}
        <section className="space-y-6">
          <Reveal direction="up">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground via-primary to-accent bg-clip-text text-transparent"
                >
                  Welcome back, {user?.name?.split(' ')[0] || 'User'} 👋
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mt-2 text-lg text-muted-foreground"
                >
                  Your model translation gateway is ready. Configure providers, map models, and use any LLM with Claude Code.
                </motion.p>
              </div>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="flex gap-3"
              >
                <Button asChild size="lg">
                  <a href="/keys">
                    <Zap className="mr-2 h-4 w-4" />
                    Add API Key
                  </a>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <a href="/mappings">
                    <GitBranch className="mr-2 h-4 w-4" />
                    Create Mapping
                  </a>
                </Button>
              </motion.div>
            </div>
          </Reveal>

          {/* Stats Grid */}
          <Reveal direction="up" delay={0.1}>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {statCards.map((stat, index) => (
                <AnimatedCard key={stat.label} className="stagger-1">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                        <NumberTicker
                          value={stat.value}
                          className="mt-1 text-3xl font-bold"
                          duration={1}
                        />
                      </div>
                      <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center', stat.bg)}>
                        <stat.icon className={cn('h-6 w-6', stat.color)} />
                      </div>
                    </div>
                  </CardContent>
                </AnimatedCard>
              ))}
            </div>
          </Reveal>
        </section>

        {/* Features Grid */}
        <section>
          <Reveal direction="up">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold">Quick Actions</h2>
                <p className="text-muted-foreground">Set up your gateway in minutes</p>
              </div>
            </div>
          </Reveal>

          <StaggerContainer staggerDelay={0.1} direction="up">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {features.map((feature, index) => (
                <AnimatedCard key={feature.title} className="group">
                  <CardContent className="p-6">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-1">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{feature.desc}</p>
                    <Button asChild variant="ghost" className="w-full justify-start gap-1 px-0">
                      <a href={feature.href}>
                        Get started <ArrowRight className="h-4 w-4" />
                      </a>
                    </Button>
                  </CardContent>
                </AnimatedCard>
              ))}
            </div>
          </StaggerContainer>
        </section>

        {/* How it works */}
        <section className="mt-8">
          <Reveal direction="up">
            <h2 className="text-2xl font-bold mb-6">How it works</h2>
          </Reveal>
          <StaggerContainer staggerDelay={0.15} direction="up">
            <div className="grid gap-4 md:grid-cols-3">
              <AnimatedCard className="text-center p-8">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Shield className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">1. Add Providers</h3>
                <p className="text-sm text-muted-foreground">
                  Add your API keys for OpenRouter, Ollama, Vertex AI, or any custom OpenAI-compatible endpoint.
                </p>
              </AnimatedCard>
              <AnimatedCard className="text-center p-8">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <GitBranch className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">2. Map Models</h3>
                <p className="text-sm text-muted-foreground">
                  Map any Claude model ID (opus, sonnet, haiku) to any provider model with fallback chains.
                </p>
              </AnimatedCard>
              <AnimatedCard className="text-center p-8">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Globe className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">3. Use Anywhere</h3>
                <p className="text-sm text-muted-foreground">
                  Set ANTHROPIC_BASE_URL to your gateway and use Claude Code with any LLM unlimited.
                </p>
              </AnimatedCard>
            </div>
          </StaggerContainer>
        </section>

        {/* Quick Start */}
        <section className="mt-8">
          <Reveal direction="up">
            <AnimatedCard className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20 p-8">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                <div>
                  <h3 className="text-2xl font-bold mb-2">Ready to get started?</h3>
                  <p className="text-muted-foreground">
                    Add your first API key and create a model mapping to start using any LLM with Claude Code.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button asChild size="lg">
                    <a href="/keys">
                      <Key className="mr-2 h-4 w-4" />
                      Add API Key
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <a href="/mappings">
                      <GitBranch className="mr-2 h-4 w-4" />
                      Create Mapping
                    </a>
                  </Button>
                </div>
              </div>
            </AnimatedCard>
          </Reveal>
        </section>
      </div>
    </div>
  );
}