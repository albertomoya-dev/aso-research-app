import { AppTabs } from "@/components/app-tabs";

export default async function AppLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="flex flex-col gap-6">
      <AppTabs appId={id} />
      {children}
    </div>
  );
}
