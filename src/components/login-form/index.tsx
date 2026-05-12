import React from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import styles from './styles.module.css';
import type { MailboxConfig, SmtpAuthMode } from '../../types/mail';

type LoginFormProps = {
  config: MailboxConfig;
  onConfigChange: (field: keyof MailboxConfig, value: string | boolean) => void;
  onConnect: () => void;
};

function LoginForm({ config, onConfigChange, onConnect }: LoginFormProps) {
  const smtpAuthMode: SmtpAuthMode = config.smtpAuthMode === 'oauth2' ? 'oauth2' : 'password';

  return (
    <section className={styles.form}>
      <h3 className={styles.sectionTitle}>Incoming (IMAP)</h3>
      <label className={styles.field}>
        <span>Host:</span>
        <input
          type="text"
          value={config.host}
          onChange={(e) => onConfigChange('host', e.target.value)}
        />
      </label>

      <label className={styles.field}>
        <span>Username:</span>
        <input
          type="text"
          value={config.username}
          onChange={(e) => onConfigChange('username', e.target.value)}
        />
      </label>

      <label className={styles.field}>
        <span>Password:</span>
        <input
          type="password"
          value={config.password}
          onChange={(e) => onConfigChange('password', e.target.value)}
        />
      </label>

      <h3 className={styles.sectionTitle}>Outgoing (SMTP)</h3>
      <label className={styles.field}>
        <span>SMTP host:</span>
        <input
          type="text"
          value={config.smtpHost || ''}
          onChange={(e) => onConfigChange('smtpHost', e.target.value)}
        />
      </label>

      <label className={styles.field}>
        <span>SMTP auth:</span>
        <select
          value={smtpAuthMode}
          onChange={(e) => onConfigChange('smtpAuthMode', e.target.value as SmtpAuthMode)}
        >
          <option value="password">Password</option>
          <option value="oauth2">OAuth2</option>
        </select>
      </label>

      {smtpAuthMode === 'password' ? (
        <>
          <label className={`${styles.field} ${styles.fieldCheckbox}`}>
            <span>Use same username and password as IMAP:</span>
            <Checkbox.Root
              className={styles.checkboxRoot}
              checked={Boolean(config.smtpUseImapCredentials)}
              onCheckedChange={(checked) =>
                onConfigChange('smtpUseImapCredentials', checked === true)
              }
            >
              <Checkbox.Indicator className={styles.checkboxIndicator}>✓</Checkbox.Indicator>
            </Checkbox.Root>
          </label>

          {!config.smtpUseImapCredentials ? (
            <>
              <label className={styles.field}>
                <span>SMTP username:</span>
                <input
                  type="text"
                  value={config.smtpUsername || ''}
                  onChange={(e) => onConfigChange('smtpUsername', e.target.value)}
                  placeholder={config.username}
                />
              </label>

              <label className={styles.field}>
                <span>SMTP password:</span>
                <input
                  type="password"
                  value={config.smtpPassword || ''}
                  onChange={(e) => onConfigChange('smtpPassword', e.target.value)}
                  placeholder={config.password ? '••••••••' : ''}
                />
              </label>
            </>
          ) : null}
        </>
      ) : (
        <>
          <label className={styles.field}>
            <span>OAuth2 user:</span>
            <input
              type="text"
              value={config.smtpOAuthUser || ''}
              onChange={(e) => onConfigChange('smtpOAuthUser', e.target.value)}
              placeholder={config.username}
            />
          </label>

          <label className={styles.field}>
            <span>Client ID:</span>
            <input
              type="text"
              value={config.smtpClientId || ''}
              onChange={(e) => onConfigChange('smtpClientId', e.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span>Client secret:</span>
            <input
              type="password"
              value={config.smtpClientSecret || ''}
              onChange={(e) => onConfigChange('smtpClientSecret', e.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span>Refresh token:</span>
            <input
              type="password"
              value={config.smtpRefreshToken || ''}
              onChange={(e) => onConfigChange('smtpRefreshToken', e.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span>Access token:</span>
            <input
              type="password"
              value={config.smtpAccessToken || ''}
              onChange={(e) => onConfigChange('smtpAccessToken', e.target.value)}
            />
          </label>
        </>
      )}

      <button type="button" className={styles.connectButton} onClick={onConnect}>
        Save & Connect
      </button>
    </section>
  );
}

export default LoginForm;
