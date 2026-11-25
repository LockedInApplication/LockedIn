import NavbarLogo from "./icons/NavbarLogo";
import styles from "./styles/brandLogo.module.scss";

export function BrandRings({ monochrome = false }: { monochrome?: boolean }) {
    return <svg className={styles.rings} data-monochrome={monochrome || undefined} aria-hidden="true" width="23" height="16"
        viewBox="0 0 23 16" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="8" cy="8" r="5.6" />
        <circle className={styles.secondRing} cx="14.8" cy="8" r="5.6" />
    </svg>;
}

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
