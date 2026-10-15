import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
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

interface AuthContextValue {
  gateway: BackendGateway;
  session: UserSession | null;
  loading: boolean;
  error: string | null;
  clearError(): void;
  reloadSession(): Promise<UserSession | null>;
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

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const getMessage = (error: unknown) => safeErrorMessage(error, 'We could not complete that action. Please try again.');

export const AuthProvider = ({ children, gateway: providedGateway }: { children: ReactNode; gateway?: BackendGateway }) => {
  const gateway = useMemo(() => providedGateway ?? createBackendGateway(), [providedGateway]);
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(task: () => Promise<T>): Promise<T> => {
    setError(null);
    try {
      return await task();
    } catch (caught) {
      const message = getMessage(caught);
      setError(message);
      throw caught;
    }
  }, []);

  const reloadSession = useCallback(async () => {
    return run(async () => {
      const next = await gateway.reloadSession();
      setSession(next);
      return next;
    });
  }, [gateway, run]);

  useEffect(() => {
    let active = true;
    gateway
      .reloadSession()
      .then((next) => {
        if (active) setSession(next);
      })
      .catch((caught) => {
        if (active) setError(getMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [gateway]);

  const value: AuthContextValue = {
    gateway,
    session,
    loading,
    error,
    clearError: () => setError(null),
    reloadSession,
    signIn: (input) =>
      run(async () => {
        const next = await gateway.signIn(input);
        setSession(next);
        return next;
      }),
    signOut: () =>
      run(async () => {
        await gateway.signOut();
        setSession(null);
      }),
    sendPasswordRecovery: (email) => run(() => gateway.sendPasswordRecovery(email)),
    startRegistrationPayment: (input) => run(() => gateway.startRegistrationPayment(input)),
    registerAccount: (input) =>
      run(async () => {
        const next = await gateway.registerAccount(input);
        setSession(next);
        return next;
      }),
    resendEmailVerification: () => run(() => gateway.resendEmailVerification()),
    requestManualRenewal: () => run(() => gateway.requestManualRenewal({ returnUrl: window.location.href })),
    updateDisplayName: (input) =>
      run(async () => {
        if (!session) throw new UserFacingError('Sign in before changing your name.');
        const result = await gateway.updateDisplayName(input);
        const next = { ...session, displayName: result.displayName };
        setSession(next);
        return next;
      }),
    requestEmailChange: (input) => run(() => gateway.requestEmailChange(input)),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
};

export const useBackendGateway = () => useAuth().gateway;
