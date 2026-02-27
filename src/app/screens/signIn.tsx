import { useState } from 'react'
import { Button } from '@/app/components/ui/button'
import MovesiaLogoBlack from '@/app/assets/Movesia-FullLogo-Black.svg?react'
import MovesiaLogoWhite from '@/app/assets/Movesia-FullLogo-White.svg?react'
import illustrationSrc from '@/app/assets/SignIn-Screen-Image.png'

// =============================================================================
// Sign In Screen
// =============================================================================

export function SignInScreen() {
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async () => {
    setIsSigningIn(true)
    setError(null)
    try {
      await electron.ipcRenderer.invoke('auth:sign-in')
      // Navigation happens in App.tsx when auth state changes
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.')
    } finally {
      setIsSigningIn(false)
    }
  }

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

          {/* Error message */}
          {error && (
            <div className='mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive'>
              {error}
            </div>
          )}

          {/* Auth buttons */}
          <div className='space-y-2.5'>
            <Button
              className='w-full cursor-pointer'
              size='lg'
              onClick={handleSignIn}
              disabled={isSigningIn}
            >
              {isSigningIn ? 'Opening browser...' : 'Sign in'}
            </Button>
            <Button
              variant='outline'
              className='w-full cursor-pointer'
              size='lg'
              onClick={handleSignIn}
              disabled={isSigningIn}
            >
              Create account
            </Button>
          </div>

          {/* Footer */}
          <p className='mt-10 text-xs text-muted-foreground leading-relaxed'>
            By continuing, you agree to Movesia&apos;s{' '}
            <button
              className='text-foreground/70 hover:text-foreground underline underline-offset-2 cursor-pointer transition-colors'
              onClick={() => electron.ipcRenderer.invoke('open-url', 'https://movesia.com/terms')}
            >
              Terms of Service
            </button>{' '}
            and{' '}
            <button
              className='text-foreground/70 hover:text-foreground underline underline-offset-2 cursor-pointer transition-colors'
              onClick={() => electron.ipcRenderer.invoke('open-url', 'https://movesia.com/privacy')}
            >
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
