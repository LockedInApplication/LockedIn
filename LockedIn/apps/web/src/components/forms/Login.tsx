"use client";

import styles from "../styles/authForms.module.scss";
export default function Login() {
  return (
    <div className={styles.loginContainer}>
      <p className={styles.title}>Log in to your account to continue.</p>
      <form>
        <div className={styles.formGroup}>
          <label htmlFor="email">Email</label>
          <input type="email" id="email" name="email" placeholder="Email" required />
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="password">Password</label>
          <input type="password" id="password" name="password" placeholder="Password" required />
        </div>
        <span className={styles.forgotPassword}>Forgot password?</span>
        <button type="submit">Log In</button>
      </form>
    </div>
  );
}
