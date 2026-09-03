'use client';

import * as React from 'react';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Reveal, NumberTicker, AnimatedCard } from '@/components/ui/animated-components';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  Shield,
  Activity,
  Users,
  GitBranch,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

interface PersonaAnalytics {
  totalPersonas: number;
  totalTests: number;
  totalSwitches: number;
  totalViolations: number;
  byCategory: Record<string, number>;
  recentActivity: Array<{
    action: string;
    personaId: string;
    timestamp: Date;
  }>;
  enforcement: {
    totalEnforcements: number;
    byProvider: Record<string, number>;
    byModel: Record<string, number>;
    violations: Array<{
      type: string;
      severity: string;
      count: number;
    }>;
    timeSeries: Array<{
      date: string;
      enforcements: number;
      violations: number;
    }>;
  };
  performance: {
    avgEnforcementLatencyMs: number;
    avgResponseLatencyMs: number;
    cacheHitRate: number;
    errorRate: number;
    throughput: number;
  };
}

export function PersonaAnalyticsPage() {
  const [analytics, setAnalytics] = React.useState<PersonaAnalytics | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [timeRange, setTimeRange] = React.useState<'24h' | '7d' | '30d'>('7d');

  React.useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const [summaryRes, enforcementRes, performanceRes] = await Promise.all([
        api.get('/api/personas/analytics/summary'),
        api.get('/api/personas/analytics/enforcement'),
        api.get('/api/personas/analytics/performance'),
      ]);

      setAnalytics({
        ...summaryRes.data,
        enforcement: enforcementRes.data,
        performance: performanceRes.data,
      });
    } catch {
      // Ignore errors
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground">No analytics data available yet</p>
      </div>
    );
  }

  const statCards = [
    {
      label: 'Active Personas',
      value: analytics.totalPersonas,
      icon: Users,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Total Enforcements',
      value: analytics.enforcement.totalEnforcements || analytics.totalTests,
      icon: Shield,
      color: 'text-green-500',
      bg: 'bg-green-500/10',
    },
    {
      label: 'Persona Switches',
      value: analytics.totalSwitches,
      icon: GitBranch,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
    },
    {
      label: 'Violations Detected',
      value: analytics.totalViolations,
      icon: AlertTriangle,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
    },
  ];

  const categoryData = Object.entries(analytics.byCategory).map(([name, value]) => ({
    name,
    value,
  }));

  const providerData = Object.entries(analytics.enforcement.byProvider).map(([name, value]) => ({
    name,
    value,
  }));

  const timeSeriesData = analytics.enforcement.timeSeries.map(item => ({
    date: item.date,
    enforcements: item.enforcements,
    violations: item.violations,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <Reveal direction="up">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Persona Analytics</h1>
            <p className="text-muted-foreground">Monitor persona enforcement, violations, and performance</p>
          </div>
          <div className="flex items-center gap-3">
            {['24h', '7d', '30d'].map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range as any)}
                className={cn(
                  'px-3 py-1 rounded-md text-sm font-medium transition-colors',
                  timeRange === range
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80'
                )}
              >
                {range === '24h' ? '24 hours' : range === '7d' ? '7 days' : '30 days'}
              </button>
            ))}
          </div>
        </div>
      </Reveal>

      {/* Stats Grid */}
      <Reveal direction="up" delay={0.1}>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => (
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

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Enforcement Over Time */}
        <Reveal direction="up" delay={0.2}>
          <AnimatedCard>
            <CardHeader className="pb-2">
              <CardTitle>Enforcement Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                    <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    />
                    <Line type="monotone" dataKey="enforcements" stroke="#3b82f6" strokeWidth={2} dot={false} name="Enforcements" />
                    <Line type="monotone" dataKey="violations" stroke="#ef4444" strokeWidth={2} dot={false} name="Violations" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </AnimatedCard>
        </Reveal>

        {/* Category Distribution */}
        <Reveal direction="up" delay={0.2}>
          <AnimatedCard>
            <CardHeader className="pb-2">
              <CardTitle>Persona Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {categoryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </AnimatedCard>
        </Reveal>

        {/* Provider Distribution */}
        <Reveal direction="up" delay={0.3}>
          <AnimatedCard>
            <CardHeader className="pb-2">
              <CardTitle>Enforcement by Provider</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={providerData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                    <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </AnimatedCard>
        </Reveal>

        {/* Performance Metrics */}
        <Reveal direction="up" delay={0.3}>
          <AnimatedCard>
            <CardHeader className="pb-2">
              <CardTitle>Performance Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Avg Enforcement Latency</span>
                  <span className="text-sm font-medium">{analytics.performance.avgEnforcementLatencyMs}ms</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Avg Response Latency</span>
                  <span className="text-sm font-medium">{analytics.performance.avgResponseLatencyMs}ms</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Cache Hit Rate</span>
                  <span className="text-sm font-medium">{(analytics.performance.cacheHitRate * 100).toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Error Rate</span>
                  <span className="text-sm font-medium">{(analytics.performance.errorRate * 100).toFixed(2)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Throughput</span>
                  <span className="text-sm font-medium">{analytics.performance.throughput} req/s</span>
                </div>
              </div>
            </CardContent>
          </AnimatedCard>
        </Reveal>
      </div>

      {/* Recent Activity */}
      <Reveal direction="up" delay={0.4}>
        <AnimatedCard>
          <CardHeader className="pb-2">
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
              ) : (
                analytics.recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      {activity.action === 'created' && <CheckCircle className="h-4 w-4 text-green-500" />}
                      {activity.action === 'updated' && <Activity className="h-4 w-4 text-blue-500" />}
                      {activity.action === 'deleted' && <XCircle className="h-4 w-4 text-red-500" />}
                      {activity.action === 'tested' && <Shield className="h-4 w-4 text-purple-500" />}
                      <span className="text-sm font-medium capitalize">{activity.action}</span>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {new Date(activity.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </AnimatedCard>
      </Reveal>
    </div>
  );
}
