'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { api, ApiKey } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Reveal, StaggerContainer, AnimatedCard } from '@/components/ui/animated-components';
import {
  Plus,
  Eye,
  EyeOff,
  Copy,
  Check,
  Loader2,
  Trash2,
  Edit,
  Wifi,
  WifiOff,
  Shield,
  AlertCircle,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { formatRelativeTime, cn, getStatusDotColor } from '@/lib/utils';

const createKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  provider: z.enum(['openrouter', 'vertex', 'ollama', 'custom', 'anthropic']),
  key: z.string().min(1, 'API key is required'),
});

type CreateKeyForm = z.infer<typeof createKeySchema>;

const providerInfo = {
  openrouter: { name: 'OpenRouter', description: 'Access 100+ models via single API', icon: Globe },
  vertex: { name: 'Vertex AI (Gemini)', description: 'Google\'s Gemini models', icon: Shield },
  ollama: { name: 'Ollama', description: 'Local models via Ollama', icon: Wifi },
  custom: { name: 'Custom OpenAI-compatible', description: 'Any OpenAI-compatible endpoint', icon: WifiOff },
  anthropic: { name: 'Anthropic', description: 'Official Anthropic API', icon: AlertCircle },
};

export function KeysPage() {
  const { refreshUser } = useAuth();
  const [keys, setKeys] = React.useState<ApiKey[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateKeyForm>({
    resolver: zodResolver(createKeySchema),
    defaultValues: { provider: 'openrouter' },
  });

  React.useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    try {
      const response = await api.get('/keys');
      setKeys(response.data.keys || []);
    } catch (error) {
      toast.error('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: CreateKeyForm) => {
    setCreating(true);
    try {
      await api.post('/keys', data);
      toast.success('API key created successfully');
      reset();
      fetchKeys();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const response = await api.post(`/keys/${id}/test`);
      if (response.data.valid) {
        toast.success('API key is valid!');
      } else {
        toast.error(response.data.error || 'API key test failed');
      }
    } catch {
      toast.error('Failed to test API key');
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this API key?')) return;
    try {
      await api.delete(`/keys/${id}`);
      toast.success('API key deleted');
      fetchKeys();
    } catch {
      toast.error('Failed to delete API key');
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const maskKey = (hash: string) => `••••••••${hash}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Reveal direction="up">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">API Keys</h1>
            <p className="text-muted-foreground">Manage encrypted API keys for your providers</p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="lg">
                <Plus className="mr-2 h-4 w-4" />
                Add API Key
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add New API Key</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="My OpenRouter Key"
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
                      {Object.entries(providerInfo).map(([value, info]) => {
                        const Icon = info.icon;
                        return (
                          <SelectItem key={value} value={value}>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              <span>{info.name}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="key">API Key</Label>
                  <div className="relative">
                    <Input
                      id="key"
                      type="password"
                      placeholder="sk-... or paste service account JSON"
                      {...register('key')}
                    />
                    {errors.key && <p className="text-sm text-destructive">{errors.key.message}</p>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Keys are encrypted at rest using AES-256-GCM
                  </p>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => reset()}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating}>
                    {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Add Key
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </Reveal>

      {/* Keys Table */}
      <Reveal direction="up" delay={0.1}>
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : keys.length === 0 ? (
              <div className="p-12 text-center">
                <Shield className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">No API keys yet</h3>
                <p className="text-muted-foreground mb-4">Add your first API key to get started</p>
                <Button asChild>
                  <a href="#dialog">Add API Key</a>
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <StaggerContainer staggerDelay={0.05} direction="up">
                      {keys.map((key) => (
                        <AnimatedCard key={key.id} className="p-0">
                          <TableRow>
                            <TableCell className="font-medium">{key.name}</TableCell>
                            <TableCell>
                              <span className="capitalize">{key.provider}</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                                  {maskKey(key.keyHash)}
                                </code>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleCopy(maskKey(key.keyHash))}
                                      aria-label="Copy masked key"
                                    >
                                      {copiedId === maskKey(key.keyHash) ? (
                                        <Check className="h-4 w-4 text-green-500" />
                                      ) : (
                                        <Copy className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Copy masked key</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={key.isActive ? 'success' : 'secondary'}
                                className="gap-1"
                              >
                                <span
                                  className={cn(
                                    'h-2 w-2 rounded-full',
                                    getStatusDotColor(key.isActive ? 'active' : 'inactive')
                                  )}
                                />
                                {key.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {key.lastUsedAt
                                ? formatRelativeTime(key.lastUsedAt)
                                : 'Never'}
                            </TableCell>
                            <TableCell className="text-right">
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
                                  <DropdownMenuItem onClick={() => handleTest(key.id)} disabled={testingId === key.id}>
                                    {testingId === key.id ? (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                      <>
                                        <Wifi className="mr-2 h-4 w-4" />
                                        Test Key
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => handleDelete(key.id)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        </AnimatedCard>
                      ))}
                    </StaggerContainer>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </Reveal>
    </div>
  );
}