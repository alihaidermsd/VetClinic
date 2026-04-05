import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, User } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { signIn, error, isLoading } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await signIn({ username, password });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary/80 via-background to-muted flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-6 flex justify-center">
            <BrandLogo variant="login" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Animal Care Hospital</h1>
          <p className="mt-2 text-muted-foreground">Hospital management system</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Enter your credentials to access the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="username"
                    placeholder="Enter username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            <div className="mt-6 rounded-lg border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
              <p className="mb-2 font-medium text-foreground">Demo Credentials:</p>
              <p>Username: <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">admin</code></p>
              <p>Password: <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">admin123</code></p>
            </div>
          </CardContent>
        </Card>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Offline-First Veterinary Clinic Management System
        </p>
      </div>
    </div>
  );
}
