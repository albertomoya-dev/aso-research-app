export function AppIcon({ src, size = 52, alt = "" }: { src: string; size?: number; alt?: string }) {
  return (
    // Store CDNs already serve sized icons, so plain <img> avoids image-optimization quota.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 bg-surface-muted object-cover"
      style={{ borderRadius: size * 0.23 }}
    />
  );
}
