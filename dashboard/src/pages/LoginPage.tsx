'use client';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { BackgroundBeamsWithMouse, Spotlight, GridPattern } from '@/components/ui/animated-backgrounds';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Reveal } from '@/components/ui/animated-components';
import { Github, Chrome, Sparkles, Shield, Zap, Globe } from 'lucide-react';

export function LoginPage() {
  const { signIn } = useAuth();

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Animated Background */}
      <BackgroundBeamsWithMouse colors={['hsl(var(--primary))', 'hsl(var(--primary)/0.5)', 'hsl(var(--accent))']} />
      <Spotlight color="hsl(var(--primary))" opacity={0.15} />
      <GridPattern color="hsl(var(--primary))" size={80} />

      <div className="relative z-10 w-full max-w-md px-4 py-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, duration: 0.5, type: 'spring' }}
              className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 mb-4"
            >
              <Sparkles className="h-8 w-8 text-primary-foreground" />
            </motion.div>
            <Reveal direction="up" delay={0.3}>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">
                Model Translation Gateway
              </h1>
            </Reveal>
            <Reveal direction="up" delay={0.4}>
              <p className="mt-2 text-muted-foreground">
                Use any LLM with Claude Code. Map models, add fallbacks, go unlimited.
              </p>
            </Reveal>
          </div>

          {/* Login Card */}
          <Reveal direction="up" delay={0.5}>
            <Card className="border-border/50 bg-background/80 backdrop-blur-sm">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-xl">Sign in to continue</CardTitle>
                <CardDescription>
                  Choose your preferred authentication method
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <Button
                    onClick={() => signIn('google')}
                    className="w-full gap-3 justify-start"
                    size="lg"
                    disabled={false}
                  >
                    <Chrome className="h-5 w-5" />
                    <span>Continue with Google</span>
                  </Button>
                  <Button
                    onClick={() => signIn('github')}
                    variant="outline"
                    className="w-full gap-3 justify-start"
                    size="lg"
                  >
                    <Github className="h-5 w-5" />
                    <span>Continue with GitHub</span>
                  </Button>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or continue with email
                    </span>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  className="w-full gap-3 justify-start"
                  size="lg"
                  onClick={() => {
                    // Email sign in would go here
                  }}
                >
                  <span className="flex h-5 w-5 items-center justify-center">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                  </span>
                  <span>Continue with Email</span>
                </Button>
              </CardContent>
            </Card>
          </Reveal>

          {/* Features */}
          <Reveal direction="up" delay={0.6}>
            <div className="mt-8 grid grid-cols-3 gap-4 text-center">
              <div className="p-4 rounded-xl bg-background/50 backdrop-blur-sm">
                <Shield className="h-6 w-6 mx-auto text-primary mb-2" />
                <p className="text-xs font-medium">Secure</p>
                <p className="text-xs text-muted-foreground">OAuth 2.0</p>
              </div>
              <div className="p-4 rounded-xl bg-background/50 backdrop-blur-sm">
                <Zap className="h-6 w-6 mx-auto text-primary mb-2" />
                <p className="text-xs font-medium">Fast</p>
                <p className="text-xs text-muted-foreground">Instant setup</p>
              </div>
              <div className="p-4 rounded-xl bg-background/50 backdrop-blur-sm">
                <Globe className="h-6 w-6 mx-auto text-primary mb-2" />
                <p className="text-xs font-medium">Universal</p>
                <p className="text-xs text-muted-foreground">Any provider</p>
              </div>
            </div>
          </Reveal>

          {/* Footer */}
          <Reveal direction="up" delay={0.7}>
            <p className="mt-8 text-center text-sm text-muted-foreground">
              By continuing, you agree to our{' '}
              <a href="#" className="underline hover:text-primary">Terms of Service</a>
              {' '}and{' '}
              <a href="#" className="underline hover:text-primary">Privacy Policy</a>
            </p>
          </Reveal>
        </motion.div>
      </div>
    </div>
  );
}