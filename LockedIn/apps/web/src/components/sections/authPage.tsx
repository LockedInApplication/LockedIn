import BrandLogo from "../brandLogo";
import Login from "../forms/Login";
import Signup from "../forms/Signup";
import styles from "../styles/authPage.module.scss";
type authPageType = {
  page: "login" | "signup";
};
export default function AuthPage({ page }: authPageType) {
  const testimonials = [
    {
      quote:
        "LockedIn gave me clarity I didn’t even realize I needed. No guessing, no confusion—just honesty.",
      author: "Ama K.",
    },
    {
      quote:
        "For the first time, I feel like I actually know where I stand in a relationship.",
      author: "Daniel R.",
    },
    {
      quote: "LockedIn said ‘he’s also seeing someone’… turns out it was me and my peace of mind 😭",
      author: "Efua M.",
    },
  ];

  return (
    <div className={styles.authContainer}>
      <div className={styles.authFormContainer}>
        <div className={styles.formContent}>
          <div className={styles.logoContainer}>
            <div className={styles.logo}>
              <BrandLogo />
            </div>
            <div className={styles.logoName}>LockedIn</div>
          </div>

          <div className={styles.form}>
            <h2>{page === "login" ? "Welcome Back!" : "Create an Account"}</h2>
            <div>{page === "login" ? <Login /> : <Signup />}</div>
          </div>
        </div>
      </div>
      <div className={styles.authTestimonial}>
        <div className={styles.testimonialContent}>
          <p className={styles.testimonialEyebrow}>Trusted by real people</p>
          <h3 className={styles.testimonialTitle}>What members say about LockedIn</h3>

          <div className={styles.quoteList}>
            {testimonials.map((item) => (
              <blockquote key={item.author} className={styles.quoteCard}>
                <p className={styles.quoteText}>"{item.quote}"</p>
                <footer className={styles.quoteAuthor}>{item.author}</footer>
              </blockquote>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
