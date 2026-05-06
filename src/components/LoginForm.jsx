import React from 'react';
import styles from './LoginForm.module.css';

function LoginForm({ config, onConfigChange, onConnect }) {
  return (
    <section className={styles.form}>
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

      <button className={styles.connectButton} onClick={onConnect}>
        Save & Connect
      </button>
    </section>
  );
}

export default LoginForm;
