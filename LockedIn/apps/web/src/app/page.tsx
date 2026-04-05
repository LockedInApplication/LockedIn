import styles from "./page.module.scss";
import Navbar from "../components/navbar";
import Hero from "../components/sections/hero";
import PreviewDescription from "@/components/sections/previewDescription";
import ProblemCardContainer from "./_homeSections/problemCardContainer";
import StepsContainer from "./_homeSections/stepsContainer";
import ProductReviewCardContainer from "./_homeSections/ProductReviewCardContainer";
import PrivacyContainer from "./_homeSections/PrivacyContainer";
import FooterHero from "@/components/sections/footerHero";
import Footer from "@/components/footer";

export default function Home() {
  return (
    <div className={styles.page}>
      <Navbar />
      <Hero />
      <PreviewDescription
        title="The Problem"
        heading="Modern relationships lack transparency"
        shortDescription="In a hyper-connected world, trust is harder to build and easier to break. LockedIn exists because clarity shouldn't be a luxury."
        bg="var(--warm-white)"
        children={<ProblemCardContainer />}
      />
      <PreviewDescription
        title="How It Works"
        heading="Three steps to complete clarity"
        shortDescription="Simple, mutual, and respectful — LockedIn puts both people in control from day one."
        bg="var(--cream)"
        children={<StepsContainer />}
      />
      <PreviewDescription
        title="Product Preview"
        heading="Designed for calm, not conflict"
        shortDescription="Every screen is crafted to feel gentle, clear, and trustworthy — because how something feels matters as much as what it does."
        bg="var(--stone-50)"
        children={<ProductReviewCardContainer />}
      />

      <PreviewDescription
        title="TRUST & PRIVACY"
        heading="We don't accuse.
        We illuminate."
        shortDescription="LockedIn is built on a foundation of consent and respect. We believe transparency and privacy aren't opposites — they're partners."
        bg="var(--warm-white)"
        children={<PrivacyContainer />}
      />
      <FooterHero />
      <Footer />
    </div>
    
  );
}
