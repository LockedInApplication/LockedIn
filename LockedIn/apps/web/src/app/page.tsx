import styles from "./page.module.scss";
import Navbar from "../components/navbar";
import Hero from "../components/sections/hero";
import PreviewDescription from "@/components/sections/previewDescription";
import ProblemCardContainer from "./_components/problemCardContainer"

export default function Home() {
  return (
    <div className={styles.page}>
      <Navbar />
      <Hero />
      <PreviewDescription title="The Problem" heading="Modern relationships
lack transparency"  shortDescription="In a hyper-connected world, trust is harder to build and easier to break. LockedIn exists because clarity shouldn't be a luxury." bg="var(--warm-white)" children={ProblemCardContainer()} />
      <PreviewDescription title="How It Works" heading="Three steps to complete clarity"
        shortDescription="Simple, mutual, and respectful — LockedIn puts both people in control from day one." bg="var(--cream)" />
      <PreviewDescription title="Product Preview" heading="Designed for calm,
not conflict"
        shortDescription="Every screen is crafted to feel gentle, clear, and trustworthy — because how something feels matters as much as what it does." bg="var(--warm-white)" />
    </div>
  );
}
