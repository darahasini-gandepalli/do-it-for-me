import React, { useState } from 'react';
import { AlertCircle, Loader2, Eye, EyeOff, CheckCircle2, ArrowRight, UserCheck } from 'lucide-react';
import { authService } from '../services/api';
import type { AuthUser } from '../types/index';

interface AuthScreenProps {
  onAuthSuccess: (user: AuthUser) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<{ type: 'switch_to_signup' | 'switch_to_login'; username: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorHint(null);

    const cleanUser = username.trim();
    if (!cleanUser) {
      setError('Please enter your username or email address.');
      return;
    }
    if (cleanUser.length < 2) {
      setError('Username or email must be at least 2 characters.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const response = await authService.register(cleanUser, password);
        onAuthSuccess(response.user);
      } else {
        const response = await authService.login(cleanUser, password);
        onAuthSuccess(response.user);
      }
    } catch (err: any) {
      const message = err.message || 'Authentication failed. Please verify your credentials.';
      setError(message);

      if (err.notFound || message.toLowerCase().includes('no account found')) {
        setErrorHint({ type: 'switch_to_signup', username: cleanUser });
      } else if (err.alreadyExists || message.toLowerCase().includes('already registered')) {
        setErrorHint({ type: 'switch_to_login', username: cleanUser });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = async () => {
    setError(null);
    setErrorHint(null);
    setIsDemoLoading(true);

    const demoUsername = 'demo_user';
    const demoPassword = 'demopassword123';

    try {
      // Try login first
      try {
        const res = await authService.login(demoUsername, demoPassword);
        onAuthSuccess(res.user);
        return;
      } catch {
        // If not registered yet, create the demo account
        const res = await authService.register(demoUsername, demoPassword);
        onAuthSuccess(res.user);
      }
    } catch (err: any) {
      setError(err.message || 'Could not launch demo account. Please sign in manually.');
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-900 text-white font-black text-xl mb-4 shadow-sm">
          D
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
          DO IT FOR ME
        </h1>
        <p className="mt-2 text-sm text-slate-500 font-medium">
          Tell me what you need done. I'll figure out the rest.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 sm:px-10 rounded-2xl border border-slate-200/80 shadow-sm">
          {/* Tab Switcher: Login / Sign In vs Create Account / Sign Up */}
          <div className="flex border-b border-slate-100 mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setErrorHint(null);
              }}
              className={`flex-1 pb-3 text-sm font-semibold text-center transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'text-slate-900 border-b-2 border-slate-900'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
                setErrorHint(null);
              }}
              className={`flex-1 pb-3 text-sm font-semibold text-center transition-colors cursor-pointer ${
                mode === 'signup'
                  ? 'text-slate-900 border-b-2 border-slate-900'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
                Username or Email
              </label>
              <input
                type="text"
                required
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading || isDemoLoading}
                placeholder="e.g. dara or user@example.com"
                className="w-full text-sm px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 font-medium transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Password
                </label>
                <span className="text-[11px] text-slate-400">Min 4 characters</span>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading || isDemoLoading}
                  placeholder={mode === 'signup' ? 'Choose a password' : 'Enter your password'}
                  className="w-full text-sm px-3.5 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 font-medium transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span className="flex-1 font-medium">{error}</span>
                </div>

                {/* Helpful recovery action for mode mismatch */}
                {errorHint?.type === 'switch_to_signup' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setError(null);
                      setErrorHint(null);
                    }}
                    className="w-full mt-1.5 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-white text-rose-900 font-semibold rounded-lg border border-rose-200 hover:bg-rose-100/50 transition-colors cursor-pointer"
                  >
                    <span>Create new account for "{errorHint.username}"</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}

                {errorHint?.type === 'switch_to_login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError(null);
                      setErrorHint(null);
                    }}
                    className="w-full mt-1.5 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-white text-rose-900 font-semibold rounded-lg border border-rose-200 hover:bg-rose-100/50 transition-colors cursor-pointer"
                  >
                    <span>Log in as "{errorHint.username}"</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || isDemoLoading}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{mode === 'signup' ? 'Creating Account...' : 'Signing in...'}</span>
                </>
              ) : (
                <span>{mode === 'signup' ? 'Create Account & Start' : 'Sign In'}</span>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-400 font-medium">Or</span>
            </div>
          </div>

          {/* Quick Demo Access Button */}
          <button
            type="button"
            onClick={handleQuickDemo}
            disabled={loading || isDemoLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
          >
            {isDemoLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
                <span>Launching Demo Account...</span>
              </>
            ) : (
              <>
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span>Quick Test with Demo Account</span>
              </>
            )}
          </button>

          <div className="mt-6 text-center text-xs text-slate-500">
            {mode === 'login' ? (
              <p>
                Don't have an account yet?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setError(null);
                    setErrorHint(null);
                  }}
                  className="font-semibold text-slate-900 hover:underline cursor-pointer"
                >
                  Create one now
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                    setErrorHint(null);
                  }}
                  className="font-semibold text-slate-900 hover:underline cursor-pointer"
                >
                  Sign in here
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
