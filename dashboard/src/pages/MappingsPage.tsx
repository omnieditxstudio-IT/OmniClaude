'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { api, ModelMapping, ModelMappingEntry, Endpoint, EndpointModel } from '@/lib/api';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Reveal, StaggerContainer, AnimatedCard, NumberTicker } from '@/components/ui/animated-components';
import { useForm, useFieldArray, FieldValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { formatRelativeTime, cn, getStatusDotColor } from '@/lib/utils';
import {
  Plus,
  GitBranch,
  ArrowRightLeft,
  Settings,
  Trash2,
  Check,
  X,
  Loader2,
  Eye,
  Copy,
  CheckCircle,
  AlertCircle,
  GripVertical,
  PlusCircle,
  MinusCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

const mappingEntrySchema = z.object({
  claudeModelId: z.string().min(1, 'Claude model ID is required'),
  endpointId: z.string().min(1, 'Endpoint is required'),
  providerModelId: z.string().min(1, 'Provider model ID is required'),
  overrides: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().min(1).max(100000).optional(),
    systemPrompt: z.string().optional(),
    tools: z.array(z.any()).optional(),
  }).optional(),
  fallbacks: z.array(z.object({
    endpointId: z.string(),
    providerModelId: z.string(),
    priority: z.number().min(0),
  })).optional(),
});

const createMappingSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  mappings: z.array(mappingEntrySchema).min(1, 'At least one mapping is required'),
});

type CreateMappingForm = z.infer<typeof createMappingSchema>;
type MappingEntryForm = z.infer<typeof mappingEntrySchema>;

const CLAUDE_MODELS = [
  'claude-3-opus-20240229',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
];

export function MappingsPage() {
  const { refreshUser } = useAuth();
  const [mappings, setMappings] = React.useState<ModelMapping[]>([]);
  const [endpoints, setEndpoints] = React.useState<Endpoint[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<CreateMappingForm>({
    resolver: zodResolver(createMappingSchema),
    defaultValues: {
      name: '',
      description: '',
      mappings: [{ claudeModelId: '', endpointId: '', providerModelId: '' }],
    },
  });

  const { fields: mappingFields, append, remove, move } = useFieldArray({
    control,
    name: 'mappings',
  });

  React.useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [mappingsRes, endpointsRes] = await Promise.all([
        api.get('/mappings'),
        api.get('/endpoints'),
      ]);
      setMappings(mappingsRes.data.mappings || []);
      setEndpoints(endpointsRes.data.endpoints?.filter((e: any) => e.isActive) || []);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const getModelsForEndpoint = (endpointId: string): EndpointModel[] => {
    const endpoint = endpoints.find(e => e.id === endpointId);
    return endpoint?.models || [];
  };

  const onSubmit = async (data: CreateMappingForm) => {
    setCreating(true);
    try {
      await api.post('/mappings', data);
      toast.success('Mapping created successfully');
      reset({ name: '', description: '', mappings: [{ claudeModelId: '', endpointId: '', providerModelId: '' }] });
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create mapping');
    } finally {
      setCreating(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await api.post(`/mappings/${id}/set-default`);
      toast.success('Set as default mapping');
      fetchData();
    } catch {
      toast.error('Failed to set default');
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const response = await api.post(`/mappings/${id}/test`);
      if (response.data.success) {
        toast.success('Mapping test passed!');
      } else {
        toast.error(response.data.error || 'Test failed');
      }
    } catch {
      toast.error('Test failed');
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this mapping?')) return;
    try {
      await api.delete(`/mappings/${id}`);
      toast.success('Mapping deleted');
      fetchData();
    } catch {
      toast.error('Failed to delete mapping');
    }
  };

  const handleDuplicate = async (mapping: ModelMapping) => {
    const newName = `${mapping.name} (Copy)`;
    try {
      await api.post('/mappings', { ...mapping, name: newName, isDefault: false });
      toast.success('Mapping duplicated');
      fetchData();
    } catch {
      toast.error('Failed to duplicate mapping');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Reveal direction="up">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Model Mappings</h1>
            <p className="text-muted-foreground">Map Claude model IDs to any provider model with fallback chains</p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="lg">
                <Plus className="mr-2 h-4 w-4" />
                Create Mapping
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Model Mapping</DialogTitle>
                <DialogDescription>
                  Map Claude model IDs to provider models. Add fallback chains for automatic failover.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Mapping Name</Label>
                    <Input
                      id="name"
                      placeholder="Coding Setup"
                      {...register('name')}
                    />
                    {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description (optional)</Label>
                    <Input
                      id="description"
                      placeholder="My coding model configuration"
                      {...register('description')}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Model Mappings</h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => append({ claudeModelId: '', endpointId: '', providerModelId: '' })}
                    >
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Add Mapping
                    </Button>
                  </div>

                  <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                    {mappingFields.map((field, index) => (
                      <MappingEntryForm
                        key={field.id}
                        index={index}
                        field={field}
                        endpoints={endpoints}
                        getModelsForEndpoint={getModelsForEndpoint}
                        remove={() => remove(index)}
                        move={move}
                        register={register}
                        errors={errors.mappings?.[index]}
                      />
                    ))}
                  </div>

                  {mappingFields.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No mappings added yet. Click "Add Mapping" to start.</p>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => reset({ name: '', description: '', mappings: [{ claudeModelId: '', endpointId: '', providerModelId: '' }] })}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating}>
                    {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Create Mapping
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </Reveal>

      {/* Mappings List */}
      <Reveal direction="up" delay={0.1}>
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all">All Mappings</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="default">Default</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <MappingsList
              mappings={mappings}
              loading={loading}
              onSetDefault={handleSetDefault}
              onTest={handleTest}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              testingId={testingId}
              endpoints={endpoints}
            />
          </TabsContent>

          <TabsContent value="active">
            <MappingsList
              mappings={mappings.filter(m => m.isActive)}
              loading={loading}
              onSetDefault={handleSetDefault}
              onTest={handleTest}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              testingId={testingId}
              endpoints={endpoints}
            />
          </TabsContent>

          <TabsContent value="default">
            <MappingsList
              mappings={mappings.filter(m => m.isDefault)}
              loading={loading}
              onSetDefault={handleSetDefault}
              onTest={handleTest}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              testingId={testingId}
              endpoints={endpoints}
            />
          </TabsContent>
        </Tabs>
      </Reveal>
    </div>
  );
}

interface MappingEntryFormProps {
  index: number;
  field: any;
  endpoints: Endpoint[];
  getModelsForEndpoint: (id: string) => EndpointModel[];
  remove: () => void;
  move: (from: number, to: number) => void;
  register: any;
  errors: any;
}

function MappingEntryForm({ index, field, endpoints, getModelsForEndpoint, remove, move, register, errors }: MappingEntryFormProps) {
  const models = field.endpointId ? getModelsForEndpoint(field.endpointId) : [];

  return (
    <div className="border rounded-lg p-4 bg-background space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Mapping #{index + 1}</h4>
        <div className="flex items-center gap-2">
          {index > 0 && (
            <Button type="button" variant="ghost" size="icon" onClick={() => move(index, index - 1)}>
              <ChevronUp className="h-4 w-4" />
            </Button>
          )}
          {index < 2 && (
            <Button type="button" variant="ghost" size="icon" onClick={() => move(index, index + 1)}>
              <ChevronDown className="h-4 w-4" />
            </Button>
          )}
          <Button type="button" variant="ghost" size="icon" onClick={remove} className="text-destructive hover:text-destructive">
            <MinusCircle className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Claude Model ID</Label>
          <Select
            {...register(`mappings.${index}.claudeModelId`)}
            defaultValue={field.claudeModelId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select Claude model" />
            </SelectTrigger>
            <SelectContent>
              {CLAUDE_MODELS.map(model => (
                <SelectItem key={model} value={model}>{model}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors?.claudeModelId && <p className="text-sm text-destructive">{errors.claudeModelId.message}</p>}
        </div>

        <div className="space-y-2">
          <Label>Endpoint</Label>
          <Select
            {...register(`mappings.${index}.endpointId`)}
            defaultValue={field.endpointId}
            onValueChange={(value) => {
              register(`mappings.${index}.endpointId`).onChange(value);
              register(`mappings.${index}.providerModelId`).onChange('');
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select endpoint" />
            </SelectTrigger>
            <SelectContent>
              {endpoints.map(endpoint => (
                <SelectItem key={endpoint.id} value={endpoint.id}>
                  {endpoint.name} ({endpoint.provider})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors?.endpointId && <p className="text-sm text-destructive">{errors.endpointId.message}</p>}
        </div>

        <div className="space-y-2">
          <Label>Provider Model ID</Label>
          <Select
            {...register(`mappings.${index}.providerModelId`)}
            defaultValue={field.providerModelId}
            disabled={!field.endpointId || models.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={field.endpointId ? 'Select model' : 'Select endpoint first'} />
            </SelectTrigger>
            <SelectContent>
              {models.map(model => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name} ({model.id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors?.providerModelId && <p className="text-sm text-destructive">{errors.providerModelId.message}</p>}
        </div>
      </div>

      {/* Fallbacks */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-2">
          <Label>Fallbacks (optional)</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => {
            const fallbacks = register(`mappings.${index}.fallbacks`).value || [];
            register(`mappings.${index}.fallbacks`).onChange([...fallbacks, { endpointId: '', providerModelId: '', priority: fallbacks.length }]);
          }}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Fallback
          </Button>
        </div>
        <FallbacksArray index={index} register={register} />
      </div>
    </div>
  );
}

function FallbacksArray({ index, register }: { index: number; register: any }) {
  const fallbacks = register(`mappings.${index}.fallbacks`).value || [];
  
  return (
    <div className="space-y-2">
      {fallbacks.map((fallback: any, fbIndex: number) => (
        <div key={fbIndex} className="flex items-center gap-2">
          <Select
            {...register(`mappings.${index}.fallbacks.${fbIndex}.endpointId`)}
            defaultValue={fallback.endpointId}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Endpoint" />
            </SelectTrigger>
            <SelectContent>
              {endpoints.map((e: any) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            {...register(`mappings.${index}.fallbacks.${fbIndex}.providerModelId`)}
            defaultValue={fallback.providerModelId}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              {getModelsForEndpoint(fallback.endpointId).map((m: any) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min="0"
            placeholder="Priority"
            className="w-24"
            {...register(`mappings.${index}.fallbacks.${fbIndex}.priority`, { valueAsNumber: true })}
          />
          <Button type="button" variant="ghost" size="icon" onClick={() => {
            const newFallbacks = fallbacks.filter((_: any, i: number) => i !== fbIndex);
            register(`mappings.${index}.fallbacks`).onChange(newFallbacks);
          }}>
            <X className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function MappingsList({
  mappings,
  loading,
  onSetDefault,
  onTest,
  onDelete,
  onDuplicate,
  testingId,
  endpoints,
}: {
  mappings: ModelMapping[];
  loading: boolean;
  onSetDefault: (id: string) => void;
  onTest: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (mapping: ModelMapping) => void;
  testingId: string | null;
  endpoints: Endpoint[];
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

  if (mappings.length === 0) {
    return (
      <div className="p-12 text-center">
        <GitBranch className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium mb-2">No mappings yet</h3>
        <p className="text-muted-foreground mb-4">Create your first model mapping</p>
        <Button asChild>
          <a href="#dialog">Create Mapping</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {mappings.map((mapping) => (
        <AnimatedCard key={mapping.id}>
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <GitBranch className="h-6 w-6 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold truncate">{mapping.name}</h3>
                    {mapping.isDefault && (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Default
                      </Badge>
                    )}
                    <Badge variant={mapping.isActive ? 'success' : 'secondary'} className="gap-1">
                      <span className={cn('h-2 w-2 rounded-full', getStatusDotColor(mapping.isActive ? 'active' : 'inactive'))} />
                      {mapping.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  {mapping.description && (
                    <p className="text-sm text-muted-foreground truncate">{mapping.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {mapping.mappings.length} model mappings • {formatRelativeTime(mapping.updatedAt)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!mapping.isDefault && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" onClick={() => onSetDefault(mapping.id)}>
                        <Check className="mr-2 h-4 w-4" />
                        Set Default
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Make this the default mapping</p>
                    </TooltipContent>
                  </Tooltip>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onTest(mapping.id)}
                      disabled={testingId === mapping.id}
                    >
                      {testingId === mapping.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <ArrowRightLeft className="mr-2 h-4 w-4" />
                          Test
                        </>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Test mapping with a sample request</p>
                  </TooltipContent>
                </Tooltip>

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
                    <DropdownMenuItem onClick={() => onTest(mapping.id)} disabled={testingId === mapping.id}>
                      <ArrowRightLeft className="mr-2 h-4 w-4" />
                      Test Mapping
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDuplicate(mapping)}>
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(mapping.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Mapping Details */}
            <div className="mt-4 pt-4 border-t">
              <div className="grid gap-2 md:grid-cols-4">
                {mapping.mappings.map((entry, idx) => (
                  <div key={idx} className="p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <code className="font-mono text-primary bg-muted px-2 py-1 rounded">{entry.claudeModelId}</code>
                      <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                      <code className="font-mono text-green-600 dark:text-green-400 bg-muted px-2 py-1 rounded">{entry.providerModelId}</code>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Via {endpoints.find(e => e.id === entry.endpointId)?.name || 'Unknown'}
                    </p>
                    {entry.fallbacks && entry.fallbacks.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {entry.fallbacks.length} fallback(s)
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </AnimatedCard>
      ))}
    </div>
  );
}