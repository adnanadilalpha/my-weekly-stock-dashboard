'use client';

import { useState } from 'react';
import { Mail, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';

interface AuthScreenProps {
  onAuthSuccess: (email: string) => void;
}

// Simulated allowlist
const ALLOWED_EMAILS = [
  'user@example.com',
  'admin@example.com',
  'test@example.com',
];

export function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Email is required');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Invalid email format');
      return;
    }

    setIsSubmitting(true);

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // Check allowlist
    if (!ALLOWED_EMAILS.includes(email.toLowerCase())) {
      setError('Email not authorized. Please contact administrator.');
      setIsSubmitting(false);
      return;
    }

    setMagicLinkSent(true);
    setIsSubmitting(false);
  };

  const handleMagicLinkClick = () => {
    // Simulate magic link authentication
    onAuthSuccess(email);
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Card className="border-neutral-200 shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-neutral-900">MyWeekly Stock</CardTitle>
            <CardDescription className="text-neutral-600">
              Sign in to access your dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!magicLinkSent ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-neutral-700">
                    Email Address
                  </Label>
                  <Input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={isSubmitting}
                    className="bg-white"
                  />
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full"
                >
                  {isSubmitting ? (
                    'Sending...'
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Send Magic Link
                    </>
                  )}
                </Button>

                <Alert className="bg-neutral-50 border-neutral-200">
                  <AlertDescription>
                    <p className="text-neutral-700 mb-2">Demo accounts:</p>
                    <ul className="text-neutral-600 space-y-1 text-sm">
                      <li>• user@example.com</li>
                      <li>• admin@example.com</li>
                      <li>• test@example.com</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </form>
            ) : (
              <div className="space-y-4">
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle className="h-4 w-4 text-green-700" />
                  <AlertDescription>
                    <p className="text-green-900 mb-1">Magic link sent</p>
                    <p className="text-green-700">
                      Check your email and click the link to sign in.
                    </p>
                  </AlertDescription>
                </Alert>

                <Alert className="bg-neutral-50 border-neutral-200">
                  <AlertDescription>
                    <p className="text-neutral-700 mb-2">Demo mode:</p>
                    <p className="text-neutral-600 mb-3 text-sm">
                      In production, you would receive an email with a secure link. For this demo, click below to simulate authentication.
                    </p>
                    <Button
                      onClick={handleMagicLinkClick}
                      className="w-full"
                    >
                      Simulate Magic Link Click
                    </Button>
                  </AlertDescription>
                </Alert>

                <Button
                  onClick={() => {
                    setMagicLinkSent(false);
                    setEmail('');
                  }}
                  variant="outline"
                  className="w-full"
                >
                  Try Different Email
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}