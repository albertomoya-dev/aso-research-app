import { ProductLayout } from "@/components/product-layout";

export default async function AppSettingsLayout({ children, params }: LayoutProps<"/a/[app]/ajustes">) {
  return <ProductLayout slug={(await params).app}>{children}</ProductLayout>;
}
