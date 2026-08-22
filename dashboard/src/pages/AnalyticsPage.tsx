'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { api, RequestLog } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Reveal, StaggerContainer, NumberTicker, AnimatedCard } from '@/components/ui/animated-components';
import { formatRelativeTime, formatTokens, formatLatency, cn, getStatusDotColor } from '@/lib/utils';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Clock,
  Database,
  AlertCircle,
  CheckCircle,
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function AnalyticsPage() {
  const { refreshUser } = useAuth();
  const [logs, setLogs] = React.useState<RequestLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [timeRange, setTimeRange] = React.useState<'24h' | '7d' | '30d'>('24h');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [stats, setStats] = React.useState({
    totalRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    avgLatency: 0,
    errorRate: 0,
    successRate: 0,
  });
  const [chartData, setChartData] = React.useState<any[]>([]);
  const [modelDistribution, setModelDistribution] = React.useState<any[]>([]);
  const [providerDistribution, setProviderDistribution] = React.useState<any[]>([]);

  React.useEffect(() => {
    fetchAnalytics();
  }, [timeRange, page]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const params: any = { limit: 50, page };
      const now = new Date();
      const startDate = new Date();
      
      switch (timeRange) {
        case '24h':
          startDate.setHours(startDate.getHours() - 24);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
      }
      
      params.startDate = startDate.toISOString();
      params.endDate = now.toISOString();

      const [logsRes, statsRes] = await Promise.all([
        api.get('/admin/logs', { params }),
        api.get('/admin/analytics', { params: { startDate: params.startDate, endDate: params.endDate } }),
      ]);

      setLogs(logsRes.data.logs || []);
      setTotalPages(logsRes.data.pagination?.pages || 1);
      
      if (statsRes.data) {
        setStats({
          totalRequests: statsRes.data.totalRequests || 0,
          totalInputTokens: statsRes.data.totalInputTokens || 0,
          totalOutputTokens: statsRes.data.totalOutputTokens || 0,
          avgLatency: statsRes.data.avgLatencyMs || 0,
          errorRate: statsRes.data.errorRate || 0,
          successRate: 100 - (statsRes.data.errorRate || 0),
        });
      }

      // Generate chart data from logs
      generateChartData(logsRes.data.logs || []);
      generateModelDistribution(logsRes.data.logs || []);
      generateProviderDistribution(logsRes.data.logs || []);
    } catch {
      // Ignore errors for non-admin users
    } finally {
      setLoading(false);
    }
  };

  const generateChartData = (logs: RequestLog[]) => {
    const buckets: Record<string, { requests: number; latency: number; errors: number; tokens: number }> = {};
    const interval = timeRange === '24h' ? 3600000 : timeRange === '7d' ? 86400000 : 86400000;
    const now = Date.now();
    const start = now - (timeRange === '24h' ? 24 * 3600000 : timeRange === '7d' ? 7 * 86400000 : 30 * 86400000);

    for (let t = start; t <= now; t += interval) {
      const key = timeRange === '24h' 
        ? format(t, 'HH:00') 
        : format(t, 'MMM dd');
      buckets[key] = { requests: 0, latency: 0, errors: 0, tokens: 0 };
    }

    logs.forEach(log => {
      const time = new Date(log.createdAt).getTime();
      const key = timeRange === '24h'
        ? format(time, 'HH:00')
        : format(time, 'MMM dd');
      if (buckets[key]) {
        buckets[key].requests++;
        buckets[key].latency += log.latencyMs;
        buckets[key].tokens += log.inputTokens + log.outputTokens;
        if (log.statusCode >= 400) buckets[key].errors++;
      }
    });

    setChartData(Object.entries(buckets).map(([time, data]) => ({
      time,
      requests: data.requests,
      avgLatency: data.requests > 0 ? Math.round(data.latency / data.requests) : 0,
      errors: data.errors,
      tokens: data.tokens,
    })));
  };

  const generateModelDistribution = (logs: RequestLog[]) => {
    const dist: Record<string, number> = {};
    logs.forEach(log => {
      dist[log.claudeModelId] = (dist[log.claudeModelId] || 0) + 1;
    });
    setModelDistribution(Object.entries(dist).map(([model, count]) => ({ model, count })));
  };

  const generateProviderDistribution = (logs: RequestLog[]) => {
    const dist: Record<string, number> = {};
    logs.forEach(log => {
      dist[log.providerModelId] = (dist[log.providerModelId] || 0) + 1;
    });
    setProviderDistribution(Object.entries(dist).map(([provider, count]) => ({ provider, count })));
  };

  const statCards = [
    { label: 'Total Requests', value: stats.totalRequests, icon: Database, color: 'text-blue-500', bg: 'bg-blue-500/10', trend: '+12%', trendUp: true },
    { label: 'Input Tokens', value: stats.totalInputTokens, icon: TrendingUp, color: 'text-green-500', bg: 'bg-green-500/10', trend: '+8%', trendUp: true, format: formatTokens },
    { label: 'Output Tokens', value: stats.totalOutputTokens, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10', trend: '+15%', trendUp: true, format: formatTokens },
    { label: 'Avg Latency', value: stats.avgLatency, icon: Clock, color: 'text-orange-500', bg: 'bg-orange-500/10', trend: '-5%', trendUp: false, format: formatLatency },
    { label: 'Success Rate', value: stats.successRate, icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10', trend: '+2%', trendUp: true, format: (v: number) => `${v.toFixed(1)}%` },
    { label: 'Error Rate', value: stats.errorRate, icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10', trend: '-2%', trendUp: false, format: (v: number) => `${v.toFixed(1)}%` },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <Reveal direction="up">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Analytics</h1>
            <p className="text-muted-foreground">Monitor usage, performance, and costs</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>
      </Reveal>

      {/* Stats Grid */}
      <Reveal direction="up" delay={0.1}>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {statCards.map((stat, index) => (
            <AnimatedCard key={stat.label} className="stagger-1">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                    <NumberTicker
                      value={stat.value}
                      className="mt-1 text-3xl font-bold"
                      format={stat.format}
                      duration={1}
                    />
                    <div className="flex items-center gap-1 mt-1">
                      {stat.trendUp ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
                      <span className={cn('text-sm font-medium', stat.trendUp ? 'text-green-500' : 'text-red-500')}>
                        {stat.trend}
                      </span>
                    </div>
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
        {/* Requests Over Time */}
        <Reveal direction="up" delay={0.2}>
          <AnimatedCard>
            <CardHeader className="pb-2">
              <CardTitle>Requests Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="time" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                    <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                      formatter={(value: number) => [value, 'requests']}
                    />
                    <Area
                      type="monotone"
                      dataKey="requests"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorRequests)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </AnimatedCard>
        </Reveal>

        {/* Latency Over Time */}
        <Reveal direction="up" delay={0.2}>
          <AnimatedCard>
            <CardHeader className="pb-2">
              <CardTitle>Avg Latency Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="time" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                    <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                      formatter={(value: number) => [formatLatency(value), 'latency']}
                    />
                    <Line
                      type="monotone"
                      dataKey="avgLatency"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent          </AnimatedCard>
        </Reveal>

        {/* Model Distribution */}
        <Reveal direction="up" delay={0.3}>
          <AnimatedCard className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle>Model Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={modelDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="count"
                      nameKey="model"
                      label={({ model, percent }) => `${model} ${(percent * 100).toFixed(0)}%`}
                    >
                      {modelDistribution.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                      formatter={(value: number) => [value, 'requests']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </AnimatedCard>
        </Reveal>

        {/* Provider Distribution */}
        <Reveal direction="up" delay={0.3}>
          <AnimatedCard className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle>Provider Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={providerDistribution} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="provider" width={120} stroke="#9ca3af" tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                      formatter={(value: number) => [value, 'requests']}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent
          </AnimatedCard>
        </Reveal>
      </div>

      {/* Recent Requests */}
      <Reveal direction="up" delay={0.4}>
        <AnimatedCard>
          <CardHeader className="pb-2">
            <CardTitle>Recent Requests</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="p-12 text-center">
                <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No requests in this time range</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Claude Model</TableHead>
                      <TableHead>Provider Model</TableHead>
                      <TableHead>Tokens (In/Out)</TableHead>
                      <TableHead>Latency</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <StaggerContainer staggerDelay={0.03} direction="up">
                      {logs.map((log) => (
                        <AnimatedCard key={log.id} className="p-0">
                          <TableRow>
                            <TableCell className="font-mono text-sm">{formatRelativeTime(log.createdAt)}</TableCell>
                            <TableCell>
                              <code className="text-sm">{log.claudeModelId}</code>
                            </TableCell>
                            <TableCell>
                              <code className="text-sm text-green-600 dark:text-green-400">{log.providerModelId}</code>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {formatTokens(log.inputTokens)} / {formatTokens(log.outputTokens)}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {formatLatency(log.latencyMs)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={log.statusCode < 400 ? 'success' : 'destructive'}
                                className="gap-1"
                              >
                                <span className={cn('h-2 w-2 rounded-full', getStatusDotColor(log.statusCode < 400 ? 'active' : 'error'))} />
                                {log.statusCode < 400 ? 'Success' : `Error ${log.statusCode}`}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        </AnimatedCard>
                      ))}
                    </StaggerContainer>
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 p-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </AnimatedCard>
      </Reveal>
    </div>
  );
}