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
        title="The gap"
        heading="Important conversations rarely become shared decisions"
        shortDescription="Two people can care deeply about each other and still carry different expectations about timing, priorities, and what comes next."
        bg="var(--warm-white)"
      >
        <ProblemCardContainer />
      </PreviewDescription>
      <PreviewDescription
        id="how-it-works"
        title="How It Works"
        heading="From private reflection to one shared next step"
        shortDescription="Each person has a voice at every stage. Nothing becomes shared until both people choose it."
        bg="var(--cream)"
      >
        <StepsContainer />
      </PreviewDescription>
      <PreviewDescription
        id="preview"
        title="Product Preview"
        heading="A roadmap built by both of you"
        shortDescription="LockedIn does not grade your relationship. It helps you notice shared ground, discuss differences, and follow through at your own pace."
        bg="var(--stone-50)"
      >
        <ProductReviewCardContainer />
      </PreviewDescription>

      <PreviewDescription
        id="trust"
        title="TRUST & PRIVACY"
        heading="Choice is part of every step."
        shortDescription="Private answers stay private unless you choose to reveal them. Different answers are conversation topics—not warnings or compatibility scores."
        bg="var(--warm-white)"
      >
        <PrivacyContainer />
      </PreviewDescription>
      <FooterHero />
      <Footer />
    </div>
  );
}
