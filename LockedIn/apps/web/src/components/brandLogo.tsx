import NavbarLogo from "./icons/NavbarLogo";
import styles from "./styles/brandLogo.module.scss";

type BrandLogoProps = {
    className?: string;
};

export default function BrandLogo({ className }: BrandLogoProps) {
    const combinedClassName = className ? `${styles.logo} ${className}` : styles.logo;

    return (
        <div className={combinedClassName}>
            <NavbarLogo />
        </div>
    );
}
