import { useState } from 'react';
import { Stethoscope } from 'lucide-react';
import { cn } from '@/lib/utils';
import { brandLogoSrc } from '@/lib/brandLogoUrl';

type BrandLogoVariant = 'sidebar' | 'dashboard' | 'login' | 'print';

const frame: Record<
  BrandLogoVariant,
  { wrapper: string; img: string; fallback: string; icon: string }
> = {
  /** Compact — legacy small sidebar mark */
  sidebar: {
    wrapper:
      'rounded-2xl border border-primary/12 bg-gradient-to-br from-secondary/35 via-background to-muted/60 p-4 shadow-sm ring-1 ring-black/[0.03]',
    img: 'mx-auto max-h-[52px] w-auto max-w-[min(100%,208px)] object-contain object-center drop-shadow-[0_1px_2px_rgba(94,48,85,0.08)]',
    fallback: 'flex h-[52px] w-[52px] items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-inner',
    icon: 'h-7 w-7',
  },
  /** Full sidebar tile — tall logo uses the whole card without clipping */
  dashboard: {
    wrapper:
      '',
    img: 'h-auto w-full max-w-full object-contain object-center max-h-[min(150px,18vh)] drop-shadow-[0_2px_8px_rgba(94,48,85,0.1)]',
    fallback:
      'flex min-h-[160px] w-full max-w-[200px] items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-inner mx-auto',
    icon: 'h-14 w-14',
  },
  login: {
    wrapper:
      'rounded-[1.75rem] border border-primary/15 bg-gradient-to-b from-secondary/45 via-background to-muted/70 p-8 shadow-[0_8px_30px_-12px_rgba(94,48,85,0.25)] ring-1 ring-black/[0.04]',
    img: 'mx-auto max-h-[100px] w-auto max-w-[240px] object-contain object-center drop-shadow-[0_2px_8px_rgba(94,48,85,0.12)]',
    fallback:
      'flex h-[88px] w-[88px] items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md',
    icon: 'h-11 w-11',
  },
  print: {
    wrapper: '',
    img: 'mx-auto max-h-20 w-auto object-contain object-center',
    fallback: 'mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-primary text-primary-foreground',
    icon: 'h-9 w-9',
  },
};

type BrandLogoProps = {
  variant?: BrandLogoVariant;
  className?: string;
  alt?: string;
};

export function BrandLogo({ variant = 'sidebar', className, alt = 'Animal Care Hospital' }: BrandLogoProps) {
  const [failed, setFailed] = useState(false);
  const f = frame[variant];

  const mark = failed ? (
    <div className={f.fallback} aria-hidden>
      <Stethoscope className={f.icon} strokeWidth={1.75} />
    </div>
  ) : (
    <img
      src={brandLogoSrc}
      alt={alt}
      width={280}
      height={360}
      className={f.img}
      onError={() => setFailed(true)}
      loading={variant === 'print' ? 'lazy' : 'eager'}
      decoding="async"
    />
  );

  if (variant === 'print') {
    return (
      <div className={cn('text-center', className)}>
        {mark}
      </div>
    );
  }

  return (
    <div className={cn(f.wrapper, 'flex items-center justify-center', className)}>{mark}</div>
  );
}
