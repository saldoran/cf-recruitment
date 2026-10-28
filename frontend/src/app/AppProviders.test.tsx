import { QueryClient, useQueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { AppProviders } from './AppProviders'

it('renders its children inside the query client it was given', () => {
  const client = new QueryClient()
  const onClient = vi.fn()
  function ClientProbe() {
    onClient(useQueryClient())
    return <p>Probe rendered</p>
  }
  render(
    <AppProviders client={client}>
      <p>Application content</p>
      <ClientProbe />
    </AppProviders>,
  )
  expect(screen.getByText('Application content')).toBeVisible()
  expect(screen.getByText('Probe rendered')).toBeInTheDocument()
  expect(onClient).toHaveBeenCalledWith(client)
})
