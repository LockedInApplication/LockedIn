import styles from "../styles/authForms.module.scss";
export default function Signup() {
  return (
    <div className={styles.loginContainer}>
      <p className={styles.title}>
Start relationships built on honesty, clarity, and shared understanding.
      </p>
      <form>
        <div className={styles.formGroup}>
          <label htmlFor="email">Email</label>
          <input type="text" id="email" placeholder="Email" />
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="password">Password</label>
          <input type="password" id="password" placeholder="Password" />
        </div>
        <button type="submit">Sign Up</button>
      </form>
    </div>
  );
}
