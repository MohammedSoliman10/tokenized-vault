import { DepositForm } from './components/DepositForm'
import { Header } from './components/Header'
import { NetworkSwitcher } from './components/NetworkSwitcher'
import { StatsGrid } from './components/StatsGrid'
import { WrongNetworkBanner } from './components/WrongNetworkBanner'

function App() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <WrongNetworkBanner />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-white">Vault dashboard</h1>
          <NetworkSwitcher />
        </div>
        <StatsGrid />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <DepositForm />
        </div>
      </main>
    </div>
  )
}

export default App
