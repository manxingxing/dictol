import { Toaster as SonnerToaster } from 'sonner'

type ToasterProps = React.ComponentProps<typeof SonnerToaster>

function Toaster({ ...props }: ToasterProps): React.JSX.Element {
  return (
    <SonnerToaster
      className="toaster group"
      position="top-center"
      theme="system"
      duration={2500}
      visibleToasts={1}
      toastOptions={{
        classNames: {
          toast: 'group toast shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground'
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
