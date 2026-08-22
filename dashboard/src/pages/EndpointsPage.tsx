'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { api, Endpoint, EndpointModel } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Reveal, StaggerContainer, AnimatedCard } from '@/components/ui/animated-components';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { formatRelativeTime, cn, getStatusDotColor } from '@/lib/utils';
import {
  Plus,
  Wifi,
  WifiOff,
  Server,
  Cpu,
  Database,
  Globe,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
  Edit,
  Eye,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';

const createEndpointSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  provider: z.enum(['openrouter', 'vertex', 'ollama', 'custom', 'anthropic']),
  baseUrl: z.string().url('Please enter a valid URL'),
  apiKeyId: z.string().min(1, 'Please select an API key'),
  config: z.object({
    timeout: z.number().min(1000).max(300000).default(60000),
    maxRetries: z.number().min(0).max(10).default(3),
    headers: z.record(z.string()).optional(),
    ollamaOptions: z.object({
      numCtx: z.number().optional(),
      temperature: z.number().optional(),
    }).optional(),
  }).default({}),
  priority: z.number().min(0).default(0),
});

type CreateEndpointForm = z.infer<typeof createEndpointSchema>;

const providerConfig = {
  openrouter: { name: 'OpenRouter', defaultUrl: 'https://openrouter.ai/api/v1', icon: Globe },
  vertex: { name: 'Vertex AI (Gemini)', defaultUrl: 'https://us-central1-aiplatform.googleapis.com/v1/projects/YOUR_PROJECT/locations/us-central1/publishers/google/models', icon: Cpu },
  ollama: { name: 'Ollama', defaultUrl: 'http://localhost:11434/v1', icon: Server },
  custom: { name: 'Custom OpenAI-compatible', defaultUrl: '', icon: Database },
  anthropic: { name: 'Anthropic', defaultUrl: 'https://api.anthropic.com/v1', icon: Shield },
};

export function EndpointsPage() {
  const { refreshUser } = useAuth();
  const [endpoints, setEndpoints] = React.useState<Endpoint[]>([]);
  const [apiKeys, setApiKeys] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [syncingId, setSyncingId] = React.useState<string | null>(null);
  const [healthCheckingId, setHealthCheckingId] = React.useState<string | null>(null);
  const [editingEndpoint, setEditingEndpoint] = React.useState<Endpoint | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateEndpointForm>({
    resolver: zodResolver(createEndpointSchema),
    defaultValues: {
      provider: 'openrouter',
      config: { timeout: 60000, maxRetries: 3 },
      priority: 0,
    },
  });

  const selectedProvider = watch('provider');

  React.useEffect(() => {
    fetchData();
  }, []);

  React.useEffect(() => {
    const provider = providerConfig[selectedProvider as keyof typeof providerConfig];
    if (provider?.defaultUrl) {
      setValue('baseUrl', provider.defaultUrl);
    }
  }, [selectedProvider, setValue]);

  const fetchData = async () => {
    try {
      const [endpointsRes, keysRes] = await Promise.all([
        api.get('/endpoints'),
        api.get('/keys'),
      ]);
      setEndpoints(endpointsRes.data.endpoints || []);
      setApiKeys(keysRes.data.keys?.filter((k: any) => k.isActive) || []);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: CreateEndpointForm) => {
    setCreating(true);
    try {
      await api.post('/endpoints', data);
      toast.success('Endpoint created successfully');
      reset();
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create endpoint');
    } finally {
      setCreating(false);
    }
  };

  const handleSyncModels = async (id: string) => {
    setSyncingId(id);
    try {
      const response = await api.post(`/endpoints/${id}/sync-models`);
      toast.success(`Synced ${response.data.models?.length || 0} models`);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to sync models');
    } finally {
      setSyncingId(null);
    }
  };

  const handleHealthCheck = async (id: string) => {
    setHealthCheckingId(id);
    try {
      const response = await api.get(`/endpoints/${id}/health`);
      if (response.data.healthy) {
        toast.success(`Healthy (${response.data.latency}ms)`);
      } else {
        toast.error(response.data.error || 'Health check failed');
      }
      fetchData();
    } catch {
      toast.error('Health check failed');
    } finally {
      setHealthCheckingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this endpoint?')) return;
    try {
      await api.delete(`/endpoints/${id}`);
      toast.success('Endpoint deleted');
      fetchData();
    } catch {
      toast.error('Failed to delete endpoint');
    }
  };

  const handleEdit = (endpoint: Endpoint) => {
    setEditingEndpoint(endpoint);
    // Pre-fill form for editing - would need separate edit form
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Reveal direction="up">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Endpoints</h1>
            <p className="text-muted-foreground">Configure LLM provider endpoints</p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="lg">
                <Plus className="mr-2 h-4 w-4" />
                Add Endpoint
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Endpoint</DialogTitle>
                <DialogDescription>
                  Configure a connection to an LLM provider
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="OpenRouter Primary"
                    {...register('name')}
                  />
                  {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="provider">Provider</Label>
                  <Select onValueChange={register('provider').onChange} defaultValue="openrouter">
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(providerConfig).map(([value, config]) => {
                        const Icon = config.icon;
                        return (
                          <SelectItem key={value} value={value}>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              <span>{config.name}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="baseUrl">Base URL</Label>
                  <Input
                    id="baseUrl"
                    placeholder="https://api.example.com/v1"
                    {...register('baseUrl')}
                  />
                  {errors.baseUrl && <p className="text-sm text-destructive">{errors.baseUrl.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="apiKeyId">API Key</Label>
                  <Select onValueChange={register('apiKeyId').onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select API key" />
                    </SelectTrigger>
                    <SelectContent>
                      {apiKeys.map((key: any) => (
                        <SelectItem key={key.id} value={key.id}>
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            <span>{key.name} ({key.provider})</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.apiKeyId && <p className="text-sm text-destructive">{errors.apiKeyId.message}</p>}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="timeout">Timeout (ms)</Label>
                    <Input
                      id="timeout"
                      type="number"
                      min="1000"
                      max="300000"
                      step="1000"
                      {...register('config.timeout', { valueAsNumber: true })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxRetries">Max Retries</Label>
                    <Input
                      id="maxRetries"
                      type="number"
                      min="0"
                      max="10"
                      {...register('config.maxRetries', { valueAsNumber: true })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Input
                    id="priority"
                    type="number"
                    min="0"
                    {...register('priority', { valueAsNumber: true })}
                  />
                  <p className="text-xs text-muted-foreground">Higher priority endpoints are tried first</p>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => reset()}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating}>
                    {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Add Endpoint
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </Reveal>

      {/* Provider Tabs */}
      <Reveal direction="up" delay={0.1}>
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="openrouter"><Globe className="mr-2 h-4 w-4" />OpenRouter</TabsTrigger>
            <TabsTrigger value="vertex"><Cpu className="mr-2 h-4 w-4" />Vertex AI</TabsTrigger>
            <TabsTrigger value="ollama"><Server className="mr-2 h-4 w-4" />Ollama</TabsTrigger>
            <TabsTrigger value="custom"><Database className="mr-2 h-4 w-4" />Custom</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <EndpointsList
              endpoints={endpoints}
              loading={loading}
              onSyncModels={handleSyncModels}
              onHealthCheck={handleHealthCheck}
              onDelete={handleDelete}
              syncingId={syncingId}
              healthCheckingId={healthCheckingId}
            />
          </TabsContent>

          {Object.keys(providerConfig).map((provider) => (
            <TabsContent key={provider} value={provider}>
              <EndpointsList
                endpoints={endpoints.filter(e => e.provider === provider)}
                loading={loading}
                onSyncModels={handleSyncModels}
                onHealthCheck={handleHealthCheck}
                onDelete={handleDelete}
                syncingId={syncingId}
                healthCheckingId={healthCheckingId}
              />
            </TabsContent>
          ))}
        </Tabs>
      </Reveal>
    </div>
  );
}

function EndpointsList({
  endpoints,
  loading,
  onSyncModels,
  onHealthCheck,
  onDelete,
  syncingId,
  healthCheckingId,
}: {
  endpoints: Endpoint[];
  loading: boolean;
  onSyncModels: (id: string) => void;
  onHealthCheck: (id: string) => void;
  onDelete: (id: string) => void;
  syncingId: string | null;
  healthCheckingId: string | null;
}) {
  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (endpoints.length === 0) {
    return (
      <div className="p-12 text-center">
        <Server className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium mb-2">No endpoints configured</h3>
        <p className="text-muted-foreground mb-4">Add your first endpoint to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {endpoints.map((endpoint) => (
        <AnimatedCard key={endpoint.id}>
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  {(() => {
                    const Icon = providerConfig[endpoint.provider as keyof typeof providerConfig]?.icon || Globe;
                    return <Icon className="h-6 w-6 text-primary" />;
                  })()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold truncate">{endpoint.name}</h3>
                    <Badge variant="outline" className="capitalize">{endpoint.provider}</Badge>
                    <Badge variant={endpoint.isActive ? 'success' : 'secondary'} className="gap-1">
                      <span className={cn('h-2 w-2 rounded-full', getStatusDotColor(endpoint.isActive ? 'active' : 'inactive'))} />
                      {endpoint.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{endpoint.baseUrl}</p>
                  <p className="text-xs text-muted-foreground">
                    {endpoint.models.length} models • Priority: {endpoint.priority} • {formatRelativeTime(endpoint.updatedAt)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSyncModels(endpoint.id)}
                      disabled={syncingId === endpoint.id}
                    >
                      {syncingId === endpoint.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      Sync Models
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Fetch available models</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onHealthCheck(endpoint.id)}
                      disabled={healthCheckingId === endpoint.id}
                    >
                      {healthCheckingId === endpoint.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          {healthCheckingId === endpoint.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : endpoint.isActive ? (
                            <Wifi className="mr-2 h-4 w-4" />
                          ) : (
                            <WifiOff className="mr-2 h-4 w-4" />
                          )
                        </>
                      )}
                      {healthCheckingId === endpoint.id ? 'Checking...' : endpoint.isActive ? 'Healthy' : 'Offline'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Check endpoint health</p>
                  </TooltipContent                </Tooltip>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <span className="sr-only">Actions</span>
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="1" />
                        <circle cx="19" cy="12" r="1" />
                        <circle cx="5" cy="12" r="1" />
                      </svg>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onSyncModels(endpoint.id)} disabled={syncingId === endpoint.id}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sync Models
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onHealthCheck(endpoint.id)} disabled={healthCheckingId === endpoint.id}>
                      <Wifi className="mr-2 h-4 w-4" />
                      Health Check
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(endpoint.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Models */}
            {endpoint.models.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <div className="flex flex-wrap gap-2">
                  {endpoint.models.slice(0, 10).map((model: EndpointModel) => (
                    <Badge key={model.id} variant="outline" className="gap-1">
                      {model.supportsVision && <Eye className="h-3 w-3" />}
                      {model.id}
                      {model.pricing && (
                        <span className="text-xs">
                          ${model.pricing.inputPer1k.toFixed(4)}/${model.pricing.outputPer1k.toFixed(4)} per 1k
                        </span>
                      )}
                    </Badge>
                  ))}
                  {endpoint.models.length > 10 && (
                    <Badge variant="secondary">+{endpoint.models.length - 10} more</Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </AnimatedCard>
      ))}
    </div>
  );
}