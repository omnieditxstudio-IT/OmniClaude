'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { api, User } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Reveal, StaggerContainer, AnimatedCard } from '@/components/ui/animated-components';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  User as UserIcon,
  Mail,
  Lock,
  Palette,
  Monitor,
  Bell,
  Shield,
  Globe,
  Save,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { format } from 'date-fns';

const settingsSchema = z.object({
  name: z.string().min(1).max(100),
  theme: z.enum(['light', 'dark', 'system']),
  requestTimeout: z.number().min(1000).max(300000),
  defaultProvider: z.string().optional(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

import { z } from 'zod';

export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [saving, setSaving] = React.useState(false);
  const [avatarLoading, setAvatarLoading] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<SettingsForm>({
    defaultValues: {
      name: user?.name || '',
      theme: user?.settings?.theme || 'system',
      requestTimeout: user?.settings?.requestTimeout || 60000,
      defaultProvider: user?.settings?.defaultProvider || '',
    },
  });

  const onSubmit = async (data: SettingsForm) => {
    setSaving(true);
    try {
      await api.patch('/auth/settings', data);
      toast.success('Settings saved');
      await refreshUser();
      reset(data);
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Avatar must be less than 2MB');
      return;
    }

    setAvatarLoading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      await api.patch('/auth/settings/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Avatar updated');
      await refreshUser();
    } catch {
      toast.error('Failed to upload avatar');
    } finally {
      setAvatarLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <Reveal direction="up">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your account and preferences</p>
        </div>
      </Reveal>

      {/* Profile */}
      <Reveal direction="up" delay={0.1}>
        <AnimatedCard>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Update your personal information</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="flex items-center gap-6">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={user?.avatar || ''} alt={user?.name || ''} />
                  <AvatarFallback className="text-2xl">{user?.name?.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-4">
                  <div>
                    <Label htmlFor="avatar">Avatar</Label>
                    <Input
                      id="avatar"
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      disabled={avatarLoading}
                      className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">JPG, PNG up to 2MB</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Display Name</Label>
                      <Input
                        id="name"
                        {...register('name')}
                      />
                      {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        value={user?.email || ''}
                        disabled
                        className="bg-muted"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </CardContent>
        </AnimatedCard>
      </Reveal>

      {/* Appearance */}
      <Reveal direction="up" delay={0.2}>
        <AnimatedCard>
          <CardHeader>
            <CardTitle>
              <Palette className="mr-2 h-5 w-5" />
              Appearance
            </CardTitle>
            <CardDescription>Customize how the dashboard looks</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-2">
                <Label>Theme</Label>
                <Select
                  {...register('theme')}
                  onValueChange={(value) => {
                    register('theme').onChange(value);
                    document.documentElement.classList.toggle('dark', value === 'dark' || (value === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select theme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4" />
                        <span>Light</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="dark">
                      <div className="flex items-center gap-2">
                        <Moon className="h-4 w-4" />
                        <span>Dark</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="system">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        <span>System</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">Changes apply immediately</p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </CardContent>
        </AnimatedCard>
      </Reveal>

      {/* Preferences */}
      <Reveal direction="up" delay={0.3}>
        <AnimatedCard>
          <CardHeader>
            <CardTitle>
              <Shield className="mr-2 h-5 w-5" />
              Preferences
            </CardTitle>
            <CardDescription>Configure default behavior</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="requestTimeout">Request Timeout (ms)</Label>
                <Input
                  id="requestTimeout"
                  type="number"
                  min="1000"
                  max="300000"
                  step="1000"
                  {...register('requestTimeout', { valueAsNumber: true })}
                />
                <p className="text-sm text-muted-foreground">Default timeout for proxy requests</p>
              </div>

              <div className="space-y-2">
                <Label>Default Provider</Label>
                <Select {...register('defaultProvider')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select default provider (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None (use first active)</SelectItem>
                    <SelectItem value="openrouter">OpenRouter</SelectItem>
                    <SelectItem value="vertex">Vertex AI</SelectItem>
                    <SelectItem value="ollama">Ollama</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </CardContent>
        </AnimatedCard>
      </Reveal>

      {/* Account Info */}
      <Reveal direction="up" delay={0.4}>
        <AnimatedCard>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Provider</Label>
                <p className="capitalize">{user?.provider}</p>
              </div>
              <div className="space-y-2">
                <Label>Member Since</Label>
                <p>{user?.createdAt ? format(new Date(user.createdAt), 'MMMM d, yyyy') : 'Unknown'}</p>
              </div>
              <div className="space-y-2">
                <Label>Provider ID</Label>
                <code className="text-sm">{user?.providerId}</code>
              </div>
            </div>
          </CardContent>
        </AnimatedCard>
      </Reveal>

      {/* Danger Zone */}
      <Reveal direction="up" delay={0.5}>
        <AnimatedCard className="border-destructive/20">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>Irreversible actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Delete Account</p>
                <p className="text-sm text-muted-foreground">Permanently delete your account and all data</p>
              </div>
              <Button variant="destructive" onClick={() => {
                if (confirm('Are you sure you want to delete your account? This cannot be undone.')) {
                  // Handle account deletion
                }
              }}>
                Delete Account
              </Button>
            </div>
          </CardContent>
        </AnimatedCard
      </Reveal>
    </div>
  );
}