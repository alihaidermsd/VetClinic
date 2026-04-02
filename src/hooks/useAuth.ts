import { useState, useEffect, useCallback } from 'react';
import type { User, LoginCredentials, UserRole } from '@/types';
import { login as authLogin, logout as authLogout, getCurrentUser, hasPermission } from '@/lib/auth';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    // Check for existing session on mount
    try {
      const user = getCurrentUser();
      setState({
        user,
        isAuthenticated: !!user,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Error checking auth state:', error);
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  }, []);

  const signIn = useCallback(async (credentials: LoginCredentials): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const result = authLogin(credentials);
      
      if (result) {
        localStorage.setItem('vetclinic_token', result.token);
        setState({
          user: result.user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
        return true;
      } else {
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: 'Invalid username or password',
        });
        return false;
      }
    } catch (error) {
      console.error('Login error:', error);
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: 'An error occurred during login. Please try again.',
      });
      return false;
    }
  }, []);

  const signOut = useCallback(() => {
    authLogout();
    setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  }, []);

  const checkPermission = useCallback((permission: string): boolean => {
    if (!state.user) return false;
    return hasPermission(state.user.role as UserRole, permission);
  }, [state.user]);

  return {
    ...state,
    signIn,
    signOut,
    checkPermission,
  };
}
