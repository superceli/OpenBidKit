import { useState } from 'react';
import OfflineLicenseActivationDialog from '../shared/ui/OfflineLicenseActivationDialog';
import type { LicenseRuntimeStatus } from '../shared/types';

interface LicenseGateProps {
  licenseStatus: LicenseRuntimeStatus;
  onActivated: (status: LicenseRuntimeStatus) => void;
}

function describeProblem(status: LicenseRuntimeStatus): string {
  switch (status.status) {
    case 'missing':
      return '未检测到授权，请输入离线授权码激活';
    case 'expired':
      return '授权已过期，请续费后重新激活';
    case 'invalid':
    case 'invalidated':
      return '授权已失效，请重新激活';
    case 'machine_mismatch':
      return '此授权与当前设备不匹配';
    case 'refresh_failed':
      return '授权校验失败，请检查网络或重新激活';
    default:
      return '软件需要激活后才能使用';
  }
}

const styles = {
  root: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0c1929 0%, #1e3a5f 35%, #2563eb 75%, #1e40af 100%)',
    overflow: 'hidden',
    fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
  } as const,
  rootDecorLeft: {
    position: 'absolute',
    top: '-20%',
    left: '-10%',
    width: '600px',
    height: '600px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(96, 165, 250, 0.25) 0%, transparent 70%)',
    pointerEvents: 'none',
  } as const,
  rootDecorRight: {
    position: 'absolute',
    bottom: '-25%',
    right: '-15%',
    width: '700px',
    height: '700px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, transparent 70%)',
    pointerEvents: 'none',
  } as const,
  card: {
    position: 'relative',
    width: '440px',
    padding: '48px 44px 40px',
    background: 'rgba(255, 255, 255, 0.97)',
    borderRadius: '20px',
    boxShadow: '0 24px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(96,165,250,0.15)',
    textAlign: 'center',
    backdropFilter: 'blur(12px)',
  } as const,
  cardGlow: {
    position: 'absolute',
    inset: '-2px',
    borderRadius: '22px',
    background: 'linear-gradient(135deg, rgba(59,130,246,0.5), rgba(139,92,246,0.3), rgba(59,130,246,0.5))',
    zIndex: -1,
    opacity: 0.7,
  } as const,
  logoWrap: {
    width: '64px',
    height: '64px',
    margin: '0 auto 20px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 24px rgba(59, 130, 246, 0.5)',
  } as const,
  logoIcon: {
    fontSize: '32px',
    color: '#fff',
    lineHeight: 1,
  } as const,
  brandName: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#3b82f6',
    letterSpacing: '2px',
    marginBottom: '12px',
    textTransform: 'uppercase' as const,
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#1e293b',
    margin: 0,
    marginBottom: '10px',
    letterSpacing: '0.5px',
  },
  desc: {
    fontSize: '14px',
    color: '#64748b',
    margin: 0,
    marginBottom: '28px',
    lineHeight: 1.6,
  },
  button: {
    width: '100%',
    padding: '14px 24px',
    fontSize: '15px',
    fontWeight: 600,
    color: '#fff',
    background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 50%, #3b82f6 100%)',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(59, 130, 246, 0.4)',
    transition: 'transform 0.15s, box-shadow 0.15s',
  } as const,
  buttonHover: {
    transform: 'translateY(-1px)',
    boxShadow: '0 6px 22px rgba(59, 130, 246, 0.55)',
  } as const,
  footer: {
    marginTop: '28px',
    fontSize: '12px',
    color: '#94a3b8',
  },
  expireHint: {
    marginTop: '8px',
    fontSize: '12px',
    color: '#e67e22',
    fontWeight: 500,
  },
  loading: {
    fontSize: '14px',
    color: '#3b82f6',
    padding: '14px',
  },
};

function LicenseGate({ licenseStatus, onActivated }: LicenseGateProps) {
  const [dialogOpen, setDialogOpen] = useState(true);
  const [hoverBtn, setHoverBtn] = useState(false);

  const expireHint = licenseStatus.expiresAt && licenseStatus.status === 'expired'
    ? `原有效期至 ${licenseStatus.expiresAt.slice(0, 10)}`
    : '';

  return (
    <div style={styles.root}>
      <div style={styles.rootDecorLeft} />
      <div style={styles.rootDecorRight} />

      <div style={styles.card}>
        <div style={styles.cardGlow} />

        <div style={styles.logoWrap}>
          <span style={styles.logoIcon}>🌿</span>
        </div>

        <div style={styles.brandName}>哲元绿证报告工具箱</div>

        <h1 style={styles.title}>需要激活</h1>
        <p style={styles.desc}>
          {describeProblem(licenseStatus)}
          {expireHint && (
            <span style={styles.expireHint}><br />{expireHint}</span>
          )}
        </p>

        <button
          type="button"
          style={{
            ...styles.button,
            ...(hoverBtn ? styles.buttonHover : {}),
          }}
          onMouseEnter={() => setHoverBtn(true)}
          onMouseLeave={() => setHoverBtn(false)}
          onClick={() => setDialogOpen(true)}
        >
          输入离线授权码
        </button>

        <div style={styles.footer}>
          授权码请联系软件作者获取
        </div>

        <OfflineLicenseActivationDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              void window.lvcert?.license?.getStatus().then((s) => {
                if (s?.status === 'active') {
                  onActivated(s);
                } else {
                  setDialogOpen(false);
                }
              });
            } else {
              setDialogOpen(true);
            }
          }}
          onActivated={(status) => {
            if (status.status === 'active') {
              onActivated(status);
            }
          }}
        />
      </div>
    </div>
  );
}

export default LicenseGate;
