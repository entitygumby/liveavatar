import { SettingsForm } from "@/components/SettingsForm";

export const metadata = {
  title: "Settings — LiveAvatar Panel",
};

export default function SettingsPage() {
  return (
    <main className="min-h-screen">
      <SettingsForm />
    </main>
  );
}
