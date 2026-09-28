import type { SectionId } from '../shared/types/navigation';
import { getAppMenuItemById } from './menuConfig';
import BidOpportunityPage from '../features/bid-opportunity/pages/BidOpportunityPage';
import MyTemplatesPage from '../features/export-format/pages/MyTemplatesPage';
import DuplicateCheckPage from '../features/duplicate-check/pages/DuplicateCheckPage';
import CredentialLibraryPage from '../features/credential-library/pages/CredentialLibraryPage';
import KnowledgeBasePage from '../features/knowledge-base/pages/KnowledgeBasePage';
import RejectionCheckPage from '../features/rejection-check/pages/RejectionCheckPage';
import PluginsPage from '../features/plugins/pages/PluginsPage';
import SettingsPage from '../features/settings/pages/SettingsPage';
import TechnicalPlanHome from '../features/technical-plan/pages/TechnicalPlanHome';
import FeasibilityReportHome from '../features/feasibility-report/pages/FeasibilityReportHome';
import SecondaryMenuPage from '../shared/ui/SecondaryMenuPage';

interface AppRouterProps {
  activeSection: SectionId;
  developerMode: boolean;
  onDeveloperModeChange: (developerMode: boolean) => void;
  onSectionChange: (section: SectionId) => void;
  registerLeaveGuard?: (guard: ((nextSection?: string) => Promise<boolean>) | null) => void;
}

function AppRouter({ activeSection, developerMode, onDeveloperModeChange, onSectionChange, registerLeaveGuard }: AppRouterProps) {
  const activeMenuItem = getAppMenuItemById(activeSection, developerMode);

  if (activeMenuItem?.children?.length) {
    return <SecondaryMenuPage menuItem={activeMenuItem} onNavigate={onSectionChange} />;
  }

  switch (activeSection) {
    case 'technical-plan':
      return <TechnicalPlanHome registerLeaveGuard={registerLeaveGuard} />;
    case 'feasibility-report':
      return <FeasibilityReportHome registerLeaveGuard={registerLeaveGuard} />;
    case 'document-knowledge-base':
      return <KnowledgeBasePage />;
    case 'credential-library':
      return <CredentialLibraryPage developerMode={developerMode} />;
    case 'plugin-manager':
      return <PluginsPage />;
    case 'duplicate-check':
      return <DuplicateCheckPage />;
    case 'rejection-check':
      return <RejectionCheckPage />;
    case 'template-settings':
      return <MyTemplatesPage />;
    case 'bid-opportunity':
      return <BidOpportunityPage />;
    case 'settings':
      return <SettingsPage onDeveloperModeChange={onDeveloperModeChange} />;
    default:
      return null;
  }
}

export default AppRouter;
