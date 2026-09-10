import { useEffect, useRef, useState } from 'react';
import AppRouter from './app/AppRouter';
import GpuHardwareAccelerationPrompt from './app/GpuHardwareAccelerationPrompt';
import LicenseGate from './app/LicenseGate';
import RequiredOnlineServicesPrompt from './app/RequiredOnlineServicesPrompt';
import UpdateNotifier from './app/UpdateNotifier';
import AppShell from './components/AppShell';
import { trackAppOpen, trackConfigUsage, trackPageView } from './shared/analytics/analytics';
import type { LicenseRuntimeStatus } from './shared/types/ipc';
import type { SectionId } from './shared/types/navigation';

function isDeveloperSection(section: SectionId) {
  return section.startsWith('developer-');
}

function isManagedWorkbenchSection(section: SectionId) {
  return section === 'green-report';
}

function App() {
  const [activeSection, setActiveSection] = useState<SectionId>('green-report');
  const [developerMode, setDeveloperMode] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<LicenseRuntimeStatus | null>(null);
  const leaveGuardRef = useRef<((nextSection?: string) => Promise<boolean>) | null>(null);

  useEffect(() => {
    trackAppOpen();

    void window.lvcert?.config.load()
      .then((config) => {
        setDeveloperMode(Boolean(config?.developer_mode));
        trackConfigUsage({}, config);
      })
      .catch((error) => console.warn('读取开发者模式失败', error));

    void window.lvcert?.license?.getStatus()
      .then((status) => setLicenseStatus(status || null))
      .catch(() => setLicenseStatus(null));
  }, []);

  useEffect(() => {
    trackPageView(activeSection);
    if (isManagedWorkbenchSection(activeSection)) return;
    void window.lvcert?.ui?.setCurrentView({ section: activeSection });
  }, [activeSection]);

  useEffect(() => {
    if (!developerMode && isDeveloperSection(activeSection)) {
      setActiveSection('green-report');
    }
  }, [activeSection, developerMode]);

  const requestSectionChange = async (section: SectionId) => {
    if (section === activeSection) {
      return;
    }
    const allowed = await (leaveGuardRef.current?.(section) ?? Promise.resolve(true));
    if (allowed) {
      setActiveSection(section);
    }
  };

  // 只在真正缺失/失效时拦，debug_disabled 是开发模式放行
  const licenseBlocking = licenseStatus
    && licenseStatus.status !== 'active'
    && licenseStatus.status !== 'debug_disabled';

  return (
    <>
      {licenseBlocking ? (
        <LicenseGate
          licenseStatus={licenseStatus}
          onActivated={(status) => setLicenseStatus(status)}
        />
      ) : (
        <>
          <GpuHardwareAccelerationPrompt />
          <RequiredOnlineServicesPrompt />
          <UpdateNotifier noticeEnabled />
          <AppShell
            activeSection={activeSection}
            developerMode={developerMode}
            onSectionChange={(section) => { void requestSectionChange(section); }}
          >
            <AppRouter
              activeSection={activeSection}
              developerMode={developerMode}
              onDeveloperModeChange={setDeveloperMode}
              onSectionChange={(section) => { void requestSectionChange(section); }}
              registerLeaveGuard={(guard) => {
                leaveGuardRef.current = guard;
              }}
            />
          </AppShell>
        </>
      )}
    </>
  );
}

export default App;
