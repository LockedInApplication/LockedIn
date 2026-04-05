"use client";

import styles from "../styles/authForms.module.scss";
import { authClient } from "@/utils/authCLient";

const validateEmail = (email: string) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

const validatePassword = (password: string) => {
  return password.trim().length >= 6;
};

const validateName = (name: string) => {
  return name.trim().length >= 2;
};
async function handleSignUp(e: React.SubmitEvent) {
  e.preventDefault();
  const formData = new FormData(e.currentTarget as HTMLFormElement);

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;

  if (!validatePassword(password)) {
    alert("Password is Invalid");
    return
  }

  if (!validateName(name)) {
    alert("Email is Invalid");
    return
  }

  if (!validateEmail(email)) {
    alert("Email is Invalid");
    return
  }

  try {
    await authClient.signUp.email({
      email: email,
      password: password,
      name: name,
    });
    alert("Sign up successful! Please check your email for verification.");
  } catch (error) {
    console.error("Error during sign up:", error);
    alert("An error occurred during sign up. Please try again.");
  }
}
export default function Signup() {
  return (
    <div className={styles.loginContainer}>
      <p className={styles.title}>
        Start relationships built on honesty, clarity, and shared understanding.
      </p>
      <form onSubmit={handleSignUp}>
        <div className={styles.formGroup}>
          <label htmlFor="name">Name</label>
          <input
            type="text"
            id="name"
            name="name"
            placeholder="Name"
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            name="email"
            placeholder="Email"
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            placeholder="Password"
            required
          />
        </div>
        <button type="submit">Sign Up</button>
      </form>
    </div>
  );
}
