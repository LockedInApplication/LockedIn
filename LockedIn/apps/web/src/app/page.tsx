import Image from "next/image";
import styles from "./page.module.scss";
import Navbar from "../components/navbar";
import Hero from "../components/sections/hero";
export default function Home() {
  return (
    <div className={styles.page}>
      <Navbar/>
      <Hero/>
    </div>
  );
}
