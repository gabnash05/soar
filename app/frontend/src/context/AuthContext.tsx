import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createBackendGateway, type BackendGateway } from '../lib/backendGateway';
import { safeErrorMessage, UserFacingError } from '../lib/safeErrors';
import type {
  EmailChangeInput,
  NameChangeInput,
  RegisterAccountInput,
  RegistrationPaymentInput,
  RegistrationPaymentIntent,
  RenewalRequest,
  SignInInput,
  UserSession,
} from '../lib/contracts';

type AuthErrorScope =
  | 'session'
  | 'sign-in'
  | 'password-recovery'
  | 'registration'
  | 'email-verification'
  | 'account-settings'
  | 'access-settings';

type ScopedErrors = Partial<Record<AuthErrorScope, string>>;

interface AuthContextValue {
  gateway: BackendGateway;
  session: UserSession | null;
  loading: boolean;
  errors: ScopedErrors;
  clearError(scope: AuthErrorScope): void;
  reloadSession(scope: AuthErrorScope): Promise<UserSession | null>;
  signIn(input: SignInInput): Promise<UserSession>;
  signOut(): Promise<void>;
  sendPasswordRecovery(email: string): Promise<void>;
  startRegistrationPayment(input: RegistrationPaymentInput): Promise<RegistrationPaymentIntent>;
  registerAccount(input: RegisterAccountInput): Promise<UserSession>;
  resendEmailVerification(): Promise<void>;
  requestManualRenewal(): Promise<RenewalRequest>;
  updateDisplayName(input: NameChangeInput): Promise<UserSession>;
  requestEmailChange(input: EmailChangeInput): Promise<void>;
}

type ScopedAuthContextValue = Omit<AuthContextValue, 'errors' | 'clearError' | 'reloadSession'> & {
  error: string | null;
  clearError(): void;
  reloadSession(): Promise<UserSession | null>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const getMessage = (error: unknown) => safeErrorMessage(error, 'We could not complete that action. Please try again.');

export const AuthProvider = ({ children, gateway: providedGateway }: { children: ReactNode; gateway?: BackendGateway }) => {
  const gateway = useMemo(() => providedGateway ?? createBackendGateway(), [providedGateway]);
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<ScopedErrors>({});
  const errorVersions = useRef<Partial<Record<AuthErrorScope, number>>>({});

  const clearError = useCallback((scope: AuthErrorScope) => {
    errorVersions.current[scope] = (errorVersions.current[scope] ?? 0) + 1;
    setErrors((current) => {
      if (current[scope] === undefined) return current;
      const next = { ...current };
      delete next[scope];
      return next;
    });
  }, []);

  const run = useCallback(async <T,>(scope: AuthErrorScope, task: () => Promise<T>): Promise<T> => {
    clearError(scope);
    const version = errorVersions.current[scope] ?? 0;
    try {
      return await task();
    } catch (caught) {
      if ((errorVersions.current[scope] ?? 0) === version) {
        setErrors((current) => ({ ...current, [scope]: getMessage(caught) }));
      }
      throw caught;
    }
  }, [clearError]);

  const reloadSession = useCallback(async (scope: AuthErrorScope = 'session') => {
    return run(scope, async () => {
      const next = await gateway.reloadSession();
      setSession(next);
      return next;
    });
  }, [gateway, run]);

  useEffect(() => {
    let active = true;
    const version = (errorVersions.current.session ?? 0) + 1;
    errorVersions.current.session = version;
    gateway
      .reloadSession()
      .then((next) => {
        if (active) setSession(next);
      })
      .catch((caught) => {
        if (active && (errorVersions.current.session ?? 0) === version) {
          setErrors((current) => ({ ...current, session: getMessage(caught) }));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      if ((errorVersions.current.session ?? 0) === version) {
        errorVersions.current.session = version + 1;
      }
    };
  }, [gateway]);

  const value: AuthContextValue = {
    gateway,
    session,
    loading,
    errors,
    clearError,
    reloadSession,
    signIn: (input) =>
      run('sign-in', async () => {
        const next = await gateway.signIn(input);
        setSession(next);
        return next;
      }),
    signOut: () =>
      run('session', async () => {
        await gateway.signOut();
        setSession(null);
      }),
    sendPasswordRecovery: (email) => run('password-recovery', () => gateway.sendPasswordRecovery(email)),
    startRegistrationPayment: (input) => run('registration', () => gateway.startRegistrationPayment(input)),
    registerAccount: (input) =>
      run('registration', async () => {
        const next = await gateway.registerAccount(input);
        setSession(next);
        return next;
      }),
    resendEmailVerification: () => run('email-verification', () => gateway.resendEmailVerification()),
    requestManualRenewal: () => run('access-settings', () => gateway.requestManualRenewal({ returnUrl: window.location.href })),
    updateDisplayName: (input) =>
      run('account-settings', async () => {
        if (!session) throw new UserFacingError('Sign in before changing your name.');
        const result = await gateway.updateDisplayName(input);
        const next = { ...session, displayName: result.displayName };
        setSession(next);
        return next;
      }),
    requestEmailChange: (input) => run('account-settings', () => gateway.requestEmailChange(input)),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (scope: AuthErrorScope = 'session'): ScopedAuthContextValue => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  const { errors, clearError, reloadSession, ...auth } = value;
  const clearScopedError = useCallback(() => clearError(scope), [clearError, scope]);
  const reloadScopedSession = useCallback(() => reloadSession(scope), [reloadSession, scope]);

  return {
    ...auth,
    error: errors[scope] ?? errors.session ?? null,
    clearError: clearScopedError,
    reloadSession: reloadScopedSession,
  };
};

export const useBackendGateway = () => useAuth().gateway;
