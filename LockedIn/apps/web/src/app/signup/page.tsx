import AuthPage from "@/components/sections/authPage";
import { safeMemberReturnTo } from "@/features/auth/member-entry";

export default async function SignupPage({ searchParams }: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { returnTo } = await searchParams;
  return <AuthPage page="signup" returnTo={safeMemberReturnTo(typeof returnTo === "string" ? returnTo : null)} />;
}
