import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { FEDDA_MODULES, type FeddaModule } from '../modules/registry';
import {
  buildEnabledSourceIds,
  getAvailableModules,
  getDefaultTab,
  getPageMeta,
  getValidTabs,
  type BackendModule,
} from '../modules/moduleSelectors';

type ModuleInstallState = {
  version: number;
  active_profile?: string;
  policy?: Record<string, unknown>;
  enabled_module_ids?: string[];
};

type ModuleContextValue = {
  loading: boolean;
  error: string | null;
  backendModules: BackendModule[];
  enabledSourceIds: Set<string>;
  availableModules: FeddaModule[];
  validTabs: Set<string>;
  pageMeta: Record<string, { label: string; Icon: FeddaModule['Icon'] }>;
  defaultTab: string;
  installState: ModuleInstallState | null;
  refreshModules: () => Promise<void>;
  isTabAvailable: (tab: string) => boolean;
};

const ModuleContext = createContext<ModuleContextValue | null>(null);

async function fetchInstallState(): Promise<{
  modules: BackendModule[];
  installState: ModuleInstallState;
}> {
  const response = await fetch('/api/modules/install-state');
  const data = await response.json();
  if (!data?.success) {
    throw new Error(data?.error || 'Failed to load module install state');
  }
  return {
    modules: Array.isArray(data.modules) ? data.modules : [],
    installState: {
      version: data.version ?? 0,
      active_profile: data.active_profile,
      policy: data.policy,
      enabled_module_ids: data.enabled_module_ids,
    },
  };
}

export function ModuleProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backendModules, setBackendModules] = useState<BackendModule[]>([]);
  const [installState, setInstallState] = useState<ModuleInstallState | null>(null);

  const refreshModules = async () => {
    try {
      const next = await fetchInstallState();
      setBackendModules(next.modules);
      setInstallState(next.installState);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load modules');
    } finally {
      setLoading(false);
    }
  };

  // Initial load, with retry. On a fresh install the browser can reach the
  // backend's static files a moment before /api/modules/install-state is ready,
  // or get one failed / empty read. Without a retry that single miss leaves
  // availableModules empty for the whole session - the home loses its cards and
  // every section falls back to "Module Not Installed". So keep trying until the
  // manifest actually comes back populated.
  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        const next = await fetchInstallState();
        if (cancelled) return;
        if (!next.modules.length && attempt < 15) {
          // Reachable, but the manifest is not ready yet - treat as retryable.
          attempt += 1;
          timer = setTimeout(load, Math.min(500 * attempt, 4000));
          return;
        }
        setBackendModules(next.modules);
        setInstallState(next.installState);
        setError(null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        attempt += 1;
        setError(err instanceof Error ? err.message : 'Failed to load modules');
        if (attempt < 20) {
          timer = setTimeout(load, Math.min(500 * attempt, 4000));
        } else {
          setLoading(false);
        }
      }
    };

    void load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

  const enabledSourceIds = useMemo(() => buildEnabledSourceIds(backendModules), [backendModules]);
  const availableModules = useMemo(
    () => getAvailableModules(FEDDA_MODULES, enabledSourceIds),
    [enabledSourceIds],
  );
  const validTabs = useMemo(() => getValidTabs(availableModules), [availableModules]);
  const pageMeta = useMemo(() => getPageMeta(availableModules), [availableModules]);
  const defaultTab = useMemo(() => getDefaultTab(availableModules, 'image'), [availableModules]);

  const value = useMemo<ModuleContextValue>(
    () => ({
      loading,
      error,
      backendModules,
      enabledSourceIds,
      availableModules,
      validTabs,
      pageMeta,
      defaultTab,
      installState,
      refreshModules,
      isTabAvailable: (tab: string) => validTabs.has(tab),
    }),
    [
      loading,
      error,
      backendModules,
      enabledSourceIds,
      availableModules,
      validTabs,
      pageMeta,
      defaultTab,
      installState,
    ],
  );

  return <ModuleContext.Provider value={value}>{children}</ModuleContext.Provider>;
}

export function useModules() {
  const context = useContext(ModuleContext);
  if (!context) {
    throw new Error('useModules must be used within ModuleProvider');
  }
  return context;
}