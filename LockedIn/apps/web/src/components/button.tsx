import styles from "./styles/button.module.scss";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export default function Button({ children, className, ...props }: ButtonProps) {
  return (
    <button
      className={`${styles.btn} ${className ?? ""}`}
      {...props}
    >
      {children}
    </button>
  );
}