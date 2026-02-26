import { Button } from '@/app/components/ui/button'
import MovesiaLogoBlack from '@/app/assets/Movesia-FullLogo-Black.svg?react'
import MovesiaLogoWhite from '@/app/assets/Movesia-FullLogo-White.svg?react'
import illustrationSrc from '@/app/assets/SignIn-Screen-Image.png'

// =============================================================================
// Sign In Screen
// =============================================================================

export function SignInScreen() {
  // TODO: Wire up OAuth 2.1 PKCE — buttons should open browser to website auth endpoints

  return (
    <div className='flex h-full'>
      {/* Left panel — sign-in (40%) */}
      <div className='flex w-2/5 shrink-0 flex-col items-center justify-center px-10'>
        <div className='w-full max-w-xs'>
          {/* Logo */}
          <div className='mb-10'>
            <MovesiaLogoBlack className='h-6 w-auto dark:hidden' />
            <MovesiaLogoWhite className='hidden h-6 w-auto dark:block' />
          </div>

          {/* Heading */}
          <div className='mb-8'>
            <h1 className='text-2xl font-semibold text-foreground'>Welcome back</h1>
            <p className='mt-1.5 text-sm text-muted-foreground'>
              Sign in to your account to continue
            </p>
          </div>

          {/* Auth buttons */}
          <div className='space-y-2.5'>
            <Button className='w-full cursor-pointer' size='lg'>
              Sign in
            </Button>
            <Button variant='outline' className='w-full cursor-pointer' size='lg'>
              Create account
            </Button>
          </div>

          {/* Footer */}
          <p className='mt-10 text-xs text-muted-foreground leading-relaxed'>
            By continuing, you agree to Movesia&apos;s{' '}
            <button className='text-foreground/70 hover:text-foreground underline underline-offset-2 cursor-pointer transition-colors'>
              Terms of Service
            </button>{' '}
            and{' '}
            <button className='text-foreground/70 hover:text-foreground underline underline-offset-2 cursor-pointer transition-colors'>
              Privacy Policy
            </button>
          </p>
        </div>
      </div>

      {/* Right panel — illustration (60%) */}
      <div className='relative flex-1 overflow-hidden rounded-l-[3rem]'>
        <img
          src={illustrationSrc}
          alt=''
          className='absolute inset-0 h-full w-full object-cover'
          draggable={false}
        />
      </div>
    </div>
  )
}
