'use client';

import { useState } from 'react';
import { Mail, CheckCircle, AlertCircle, TrendingUp } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { supabase } from '@/lib/supabase-client';

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
      
      // Check if email is authorized
      const { data: authorizedUsers, error: checkError } = await supabase
        .from('authorized_users')
        .select('email, role')
        .eq('email', emailLower)
        .limit(1);

      if (checkError) {
        console.error('Error checking authorization:', checkError);
        setError('Unable to verify authorization. Please try again.');
        setIsSubmitting(false);
        return;
      }

      if (!authorizedUsers || authorizedUsers.length === 0) {
        setError('This email is not authorized to access the dashboard. Please contact an administrator.');
        setIsSubmitting(false);
        return;
      }

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
          <CardHeader className="space-y-3 text-center pb-6">
            <div className="flex justify-center mb-2">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900">
              Welcome to MyWeekly Stock
            </CardTitle>
            <CardDescription className="text-slate-600 text-base">
              Enter your email to receive a secure magic link
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!magicLinkSent ? (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-700 font-medium">
                    Email Address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <Input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      disabled={isSubmitting}
                      className="bg-white pl-10 h-11 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
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
                  className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium shadow-md hover:shadow-lg transition-all duration-200"
                >
                  {isSubmitting ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
              <div className="space-y-5">
                <Alert className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 shadow-sm">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <AlertDescription>
                    <p className="text-green-900 font-semibold mb-1.5">Check your email</p>
                    <p className="text-green-700 text-sm leading-relaxed">
                      We've sent a magic link to <span className="font-medium">{email}</span>. 
                      Click the link in the email to sign in securely.
                    </p>
                  </AlertDescription>
                </Alert>

                <div className="pt-2 space-y-3">
                  <p className="text-sm text-slate-600 text-center">
                    Didn't receive the email? Check your spam folder or try again.
                  </p>
                  
                  <Button
                    onClick={() => {
                      setMagicLinkSent(false);
                      setEmail('');
                      setError('');
                    }}
                    variant="outline"
                    className="w-full h-10 border-slate-200 hover:bg-slate-50"
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