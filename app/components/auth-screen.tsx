'use client';

import { useState } from 'react';
import { Mail, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { MwsLogo } from './brand/mws-logo';

interface AuthScreenProps {
  onAuthSuccess: (email: string) => void;
}

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
      setError('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);

    try {
      const emailLower = email.toLowerCase().trim();

      // Send magic link via our API (which uses Resend)
      const response = await fetch('/api/auth/send-magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: emailLower }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Show more helpful error messages
        if (response.status === 403) {
          setError('This email is not authorized to access the dashboard. Please contact an administrator.');
          setIsSubmitting(false);
          return;
        }
        if (data.details && data.details.includes('verify a domain')) {
          setError('Email service configuration needed. Please contact your administrator to verify the email domain.');
        } else {
          setError(data.error || 'Failed to send magic link. Please try again.');
        }
      setIsSubmitting(false);
      return;
    }

    setMagicLinkSent(true);
    setIsSubmitting(false);
    } catch (err) {
      console.error('Error in handleSubmit:', err);
      setError('An unexpected error occurred. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-md">
        <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
          <CardHeader className="space-y-2 sm:space-y-3 text-center pb-4 sm:pb-6">
            <div className="mb-2 flex justify-center">
              <div className="rounded-2xl bg-white p-3 shadow-lg sm:p-4">
                <MwsLogo variant="wordmark" className="h-10 w-auto max-w-[220px] sm:h-12" />
              </div>
            </div>
            <CardTitle className="text-xl sm:text-2xl font-bold text-slate-900">
              Welcome to My Weekly Stock
            </CardTitle>
            <CardDescription className="text-slate-600 text-sm sm:text-base">
            Enter your Substack email to receive a secure magic link
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!magicLinkSent ? (
              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm sm:text-base text-slate-700 font-medium">
                    Email Address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                  <Input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={isSubmitting}
                      className="bg-white pl-9 sm:pl-10 h-10 sm:h-11 border-slate-200 focus:border-blue-500 focus:ring-blue-500 text-sm sm:text-base"
                  />
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive" className="border-red-200 bg-red-50">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800">
                      {error}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-10 sm:h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium shadow-md hover:shadow-lg transition-all duration-200 text-sm sm:text-base"
                >
                  {isSubmitting ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 sm:mr-3 h-4 w-4 sm:h-5 sm:w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Sending...
                    </span>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Send Magic Link
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <div className="space-y-4 sm:space-y-5">
                <Alert className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 shadow-sm">
                  <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                  <AlertDescription>
                    <p className="text-green-900 font-semibold mb-1 sm:mb-1.5 text-sm sm:text-base">Check your email</p>
                    <p className="text-green-700 text-xs sm:text-sm leading-relaxed">
                      We've sent a magic link to <span className="font-medium break-all">{email}</span>. 
                      Click the link in the email to sign in securely.
                    </p>
                  </AlertDescription>
                </Alert>

                <div className="pt-2 space-y-3">
                  <p className="text-xs sm:text-sm text-slate-600 text-center">
                    Didn't receive the email? Check your spam folder or try again.
                    </p>

                <Button
                  onClick={() => {
                    setMagicLinkSent(false);
                    setEmail('');
                      setError('');
                  }}
                  variant="outline"
                    className="w-full h-10 border-slate-200 hover:bg-slate-50 text-sm sm:text-base"
                >
                    Use a Different Email
                </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}