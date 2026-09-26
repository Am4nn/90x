import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand";
import { requireViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up" };

export default async function SetupPage() {
  const viewer = await requireViewer({ allowSetup: true });
  if (viewer.setupDone) redirect("/today");
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("name, timezone").eq("user_id", viewer.id).single();
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-8 px-5 py-10">
      <div className="flex flex-col gap-3">
        <Logo />
        <h1 className="font-display text-title font-semibold">Set up your campaign</h1>
        <p className="text-text-2">This shapes your daily plan. You can change any of it later.</p>
      </div>
      <SetupForm defaults={{ name: profile?.name || viewer.name, timezone: "" }} />
    </main>
  );
}
