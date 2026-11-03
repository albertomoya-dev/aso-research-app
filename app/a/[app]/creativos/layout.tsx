import { ProductLayout } from "@/components/product-layout";

export default async function CreativesLayout({ children, params }: LayoutProps<"/a/[app]/creativos">) {
  return <ProductLayout slug={(await params).app}>{children}</ProductLayout>;
}
