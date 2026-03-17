import styles from "./styles/button.module.scss";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;


export default function Button(props: ButtonProps) {
    return (
        <button className={styles.btn} {...props}></button>
    )
}
