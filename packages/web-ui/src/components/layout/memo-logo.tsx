import { cn } from '@/lib/utils'

type MemoLogoProps = {
    className?: string
    imgClassName?: string
    alt?: string
}

export function MemoLogo({ className, imgClassName, alt = 'Memo' }: MemoLogoProps) {
    return (
        <span className={cn('relative block shrink-0', className)}>
            <img
                src="/logo.svg"
                alt={alt}
                className={cn('size-full object-contain dark:hidden', imgClassName)}
            />
            <img
                src="/logo-dark.svg"
                alt={alt}
                className={cn('hidden size-full object-contain dark:block', imgClassName)}
            />
        </span>
    )
}
