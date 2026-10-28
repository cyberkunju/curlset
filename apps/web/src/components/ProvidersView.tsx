import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  KeyRound,
  Plus,
  Trash2,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Server,
  Layers,
  Sparkles,
  ChevronRight,
  Shield,
  HelpCircle,
} from 'lucide-react';
import { ProviderCredential } from '../types';
import {
  fetchProviderCredentials,
  createProviderCredential,
  testProviderCredential,
  deleteProviderCredential,
} from '../api';
import { ProviderIcon } from './ui/ProviderIcon';
import { SpringButton } from './ui/SpringButton';
import { detectProvider, DetectedProviderInfo } from '../utils/providerDetector';

const springPhysics = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 28,
};

export const ProvidersView: React.FC = () => {
  const [credentials, setCredentials] = useState<ProviderCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Smart Add Input State
  const [inputVal, setInputVal] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Real-time Provider Detection from input
  const detected: DetectedProviderInfo = useMemo(() => {
    return detectProvider(inputVal || customLabel || customBaseUrl);
  }, [inputVal, customLabel, customBaseUrl]);

  const loadCredentials = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchProviderCredentials();
      setCredentials(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch provider credentials');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCredentials();
  }, []);

  const handleCreateCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() && !detected.requiresBaseUrl) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const isLocal = detected.provider === 'ollama';
      await createProviderCredential({
        provider: detected.provider,
        label: customLabel.trim() || detected.defaultLabel,
        api_key: isLocal ? undefined : inputVal.trim(),
        base_url: customBaseUrl.trim() || detected.defaultBaseUrl || (isLocal ? inputVal.trim() : undefined),
        models: detected.defaultModels,
        is_default: credentials.length === 0,
      });

      setInputVal('');
      setCustomLabel('');
      setCustomBaseUrl('');
      setShowAdvanced(false);
      await loadCredentials();
    } catch (err: any) {
      setError(err.message || 'Failed to save provider credential');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestCredential = async (id: string) => {
    setTestingId(id);
    try {
      const updated = await testProviderCredential(id);
      setCredentials((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (err: any) {
      console.error('Test connection error:', err);
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteCredential = async (id: string, label: string) => {
    if (!window.confirm(`Are you sure you want to remove ${label}?`)) return;
    try {
      await deleteProviderCredential(id);
      setCredentials((prev) => prev.map((c) => (c.id === id ? { ...c, _deleting: true } as any : c)));
      setTimeout(() => {
        setCredentials((prev) => prev.filter((c) => c.id !== id));
      }, 200);
    } catch (err: any) {
      setError(err.message || 'Failed to delete credential');
    }
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', width: '100%', paddingBottom: '3rem' }}>
      {/* Top Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            letterSpacing: 'var(--letter-spacing-heading)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            color: 'var(--text-primary)',
            margin: '0 0 0.25rem 0',
          }}
        >
          <KeyRound size={24} style={{ color: 'var(--accent-interactive)', flexShrink: 0 }} />
          <span>Model Providers & API Keys</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
          Configure OpenAI, Anthropic Claude, Local Ollama, Groq, and custom model endpoints for automated AI labeling.
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '0.85rem 1rem',
            marginBottom: '1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: 'var(--rose)',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Unified Smart Recognition Input Area */}
      <div
        className="card"
        style={{
          padding: '1.4rem',
          marginBottom: '2rem',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-hairline)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem',
            marginBottom: '1.25rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 0.25rem 0', color: 'var(--text-primary)' }}>
              Connect Provider or Key
            </h2>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Paste your API key or local endpoint URL. The platform auto-recognizes the provider logo, security contract, and supported models.
            </p>
          </div>

          {/* Real-time recognized provider preview badge */}
          <AnimatePresence mode="wait">
            {detected && (
              <motion.div
                key={detected.provider}
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 4 }}
                transition={springPhysics}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.45rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-hairline)',
                  boxShadow: 'var(--shadow-xs)',
                  flexShrink: 0,
                  alignSelf: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ProviderIcon provider={detected.provider} size={18} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                    Detected:
                  </span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {detected.displayName}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <form onSubmit={handleCreateCredential}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'stretch', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 340px' }}>
              <div
                style={{
                  position: 'absolute',
                  left: '0.85rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  pointerEvents: 'none',
                }}
              >
                <ProviderIcon provider={detected.provider} size={20} />
              </div>

              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder={
                  detected.requiresKey
                    ? `Paste ${detected.displayName} key (${detected.placeholderKey})`
                    : `Enter local server URL (${detected.defaultBaseUrl || 'http://localhost:11434'})`
                }
                autoComplete="off"
                spellCheck={false}
                style={{
                  width: '100%',
                  height: '42px',
                  padding: '0 0.85rem 0 2.65rem',
                  fontSize: '0.88rem',
                  backgroundColor: 'var(--bg-base)',
                  border: '1px solid var(--border-hairline)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontFamily: inputVal.startsWith('sk-') || inputVal.startsWith('gsk_') ? 'var(--font-mono)' : 'inherit',
                  outline: 'none',
                  transition: 'border-color 0.15s ease',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--indigo)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border-hairline)')}
              />
            </div>

            <SpringButton
              type="submit"
              variant="primary"
              disabled={isSubmitting || (!inputVal.trim() && !detected.requiresBaseUrl)}
              style={{ height: '42px', minWidth: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem' }}
            >
              {isSubmitting ? (
                <RefreshCw size={15} className="spin-slow" />
              ) : (
                <Plus size={16} strokeWidth={2.2} />
              )}
              <span>Connect Provider</span>
            </SpringButton>
          </div>

          {/* Model Tags & Info */}
          <div
            style={{
              marginTop: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.65rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                Models:
              </span>
              {detected.defaultModels.map((m) => (
                <span
                  key={m}
                  style={{
                    fontSize: '0.72rem',
                    fontFamily: 'var(--font-mono)',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(99, 102, 241, 0.08)',
                    color: 'var(--indigo)',
                    border: '1px solid rgba(99, 102, 241, 0.18)',
                  }}
                >
                  {m}
                </span>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.2rem 0.4rem',
              }}
            >
              <span>{showAdvanced ? 'Hide Options' : 'Custom Nickname / Base URL'}</span>
              <ChevronRight
                size={14}
                style={{
                  transform: showAdvanced ? 'rotate(90deg)' : 'none',
                  transition: 'transform 0.15s ease',
                }}
              />
            </button>
          </div>

          {/* Advanced Nickname and Base URL inputs */}
          <AnimatePresence>
            {showAdvanced && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={springPhysics}
                style={{ overflow: 'hidden', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-hairline)' }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.85rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                      Custom Label / Nickname
                    </label>
                    <input
                      type="text"
                      value={customLabel}
                      onChange={(e) => setCustomLabel(e.target.value)}
                      placeholder={detected.defaultLabel}
                      style={{
                        width: '100%',
                        height: '36px',
                        padding: '0 0.75rem',
                        fontSize: '0.84rem',
                        backgroundColor: 'var(--bg-base)',
                        border: '1px solid var(--border-hairline)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                      Custom Base URL (Optional)
                    </label>
                    <input
                      type="text"
                      value={customBaseUrl}
                      onChange={(e) => setCustomBaseUrl(e.target.value)}
                      placeholder={detected.defaultBaseUrl || 'https://api.openai.com/v1'}
                      style={{
                        width: '100%',
                        height: '36px',
                        padding: '0 0.75rem',
                        fontSize: '0.84rem',
                        backgroundColor: 'var(--bg-base)',
                        border: '1px solid var(--border-hairline)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </div>

      {/* Multi-Key Configured Cards Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.2rem 0', color: 'var(--text-primary)' }}>
              Configured Providers ({credentials.length})
            </h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              All keys are stored securely on your local environment and redacted from browser payloads.
            </p>
          </div>

          <SpringButton variant="secondary" onClick={loadCredentials} style={{ height: '34px', fontSize: '0.78rem' }}>
            <RefreshCw size={14} className={loading ? 'spin-slow' : ''} style={{ marginRight: '5px' }} />
            <span>Refresh</span>
          </SpringButton>
        </div>

        {loading && credentials.length === 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="card boneyard-card-skeleton"
                style={{
                  padding: '1.25rem',
                  minHeight: '160px',
                  backgroundColor: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-hairline)',
                }}
              >
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div className="boneyard-bone" style={{ width: '36px', height: '36px', borderRadius: '8px' }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    <div className="boneyard-bone" style={{ width: '60%', height: '14px', borderRadius: '9999px' }} />
                    <div className="boneyard-bone" style={{ width: '40%', height: '10px', borderRadius: '9999px' }} />
                  </div>
                </div>
                <div className="boneyard-bone" style={{ width: '80%', height: '14px', borderRadius: '9999px', marginBottom: '1rem' }} />
                <div className="boneyard-bone" style={{ width: '100%', height: '24px', borderRadius: '4px' }} />
              </div>
            ))}
          </div>
        ) : credentials.length === 0 ? (
          <div
            className="empty-state"
            style={{
              padding: '3rem 1.5rem',
              textAlign: 'center',
              backgroundColor: 'var(--bg-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px dashed var(--border-hairline)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
              <KeyRound size={40} strokeWidth={1.5} style={{ color: 'var(--text-muted)' }} />
            </div>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 0.35rem 0', color: 'var(--text-primary)' }}>
              No custom model keys configured
            </h4>
            <p style={{ margin: '0 auto 1.25rem auto', maxWidth: '440px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Connect your Anthropic Claude, OpenAI, or Local Ollama credentials above to enable high-accuracy automated labeling.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: '1rem',
            }}
          >
            <AnimatePresence>
              {credentials.map((cred) => {
                const isTesting = testingId === cred.id;
                const isOperational = cred.status === 'operational';
                const isFailed = cred.status === 'failed';

                return (
                  <motion.div
                    key={cred.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={springPhysics}
                    className="card"
                    style={{
                      padding: '1.25rem',
                      backgroundColor: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-hairline)',
                      boxShadow: 'var(--shadow-sm)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      minHeight: '190px',
                    }}
                  >
                    <div>
                      {/* Top Row: Provider Logo + Label + Status Badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <div
                            style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '8px',
                              backgroundColor: 'var(--bg-card-inner)',
                              border: '1px solid var(--border-hairline)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: 'var(--shadow-xs)',
                            }}
                          >
                            <ProviderIcon provider={cred.provider} size={22} />
                          </div>

                          <div>
                            <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span>{cred.label}</span>
                              {cred.is_default && (
                                <span
                                  style={{
                                    fontSize: '0.62rem',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    padding: '0.1rem 0.35rem',
                                    borderRadius: '3px',
                                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                                    color: 'var(--indigo)',
                                  }}
                                >
                                  Default
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                              {cred.provider} • Added {new Date(cred.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            padding: '0.2rem 0.55rem',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: isOperational
                              ? 'rgba(16, 185, 129, 0.1)'
                              : isFailed
                              ? 'rgba(239, 68, 68, 0.1)'
                              : 'rgba(99, 102, 241, 0.08)',
                            color: isOperational
                              ? 'var(--emerald)'
                              : isFailed
                              ? 'var(--rose)'
                              : 'var(--indigo)',
                            border: `1px solid ${
                              isOperational
                                ? 'rgba(16, 185, 129, 0.25)'
                                : isFailed
                                ? 'rgba(239, 68, 68, 0.25)'
                                : 'rgba(99, 102, 241, 0.2)'
                            }`,
                          }}
                        >
                          {isOperational ? (
                            <CheckCircle2 size={12} strokeWidth={2.2} />
                          ) : isFailed ? (
                            <AlertTriangle size={12} strokeWidth={2.2} />
                          ) : (
                            <Activity size={12} strokeWidth={2} />
                          )}
                          <span style={{ textTransform: 'capitalize' }}>
                            {isOperational && cred.latency_ms ? `${cred.latency_ms}ms` : cred.status}
                          </span>
                        </div>
                      </div>

                      {/* Key Mask Box */}
                      <div
                        style={{
                          padding: '0.45rem 0.65rem',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--bg-base)',
                          border: '1px solid var(--border-hairline)',
                          fontSize: '0.75rem',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-secondary)',
                          marginBottom: '0.85rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                        }}
                      >
                        <Shield size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{cred.key_mask}</span>
                      </div>

                      {/* Error message if failed */}
                      {isFailed && cred.error_message && (
                        <div
                          style={{
                            fontSize: '0.72rem',
                            color: 'var(--rose)',
                            marginBottom: '0.85rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={cred.error_message}
                        >
                          {cred.error_message}
                        </div>
                      )}

                      {/* Supported Models Chips */}
                      {cred.models && cred.models.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                          {cred.models.slice(0, 3).map((m) => (
                            <span
                              key={m}
                              style={{
                                fontSize: '0.68rem',
                                fontFamily: 'var(--font-mono)',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '4px',
                                backgroundColor: 'var(--bg-card-inner)',
                                border: '1px solid var(--border-hairline)',
                                color: 'var(--text-muted)',
                              }}
                            >
                              {m}
                            </span>
                          ))}
                          {cred.models.length > 3 && (
                            <span
                              style={{
                                fontSize: '0.68rem',
                                color: 'var(--text-muted)',
                                padding: '0.1rem 0.3rem',
                              }}
                            >
                              +{cred.models.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Footer Actions: Test Connection & Delete */}
                    <div
                      style={{
                        paddingTop: '0.75rem',
                        borderTop: '1px solid var(--border-hairline)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <SpringButton
                        variant="secondary"
                        onClick={() => handleTestCredential(cred.id)}
                        disabled={isTesting}
                        style={{ height: '30px', fontSize: '0.75rem', padding: '0 0.65rem' }}
                      >
                        <RefreshCw size={13} className={isTesting ? 'spin-slow' : ''} style={{ marginRight: '4px' }} />
                        <span>{isTesting ? 'Pinging...' : 'Test Connection'}</span>
                      </SpringButton>

                      <button
                        onClick={() => handleDeleteCredential(cred.id, cred.label)}
                        title="Remove API Key"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          padding: '0.35rem',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'color 0.15s ease',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--rose)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};
