import styles from "../styles/authForms.module.scss";
export default function Login() {
  return (
    <div className={styles.loginContainer}>
      <p className={styles.title}>Log in to your account to continue.</p>
      <form>
        <div className={styles.formGroup}>
          <label htmlFor="email">Email</label>
          <input type="text" id="email" placeholder="Email" />
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="password">Password</label>
          <input type="password" id="password" placeholder="Password" />
        </div>
        <span className={styles.forgotPassword}>Forgot password?</span>
        <button type="submit">Log In</button>
      </form>
    </div>
  );
}
