import { Helmet } from 'react-helmet-async'
import AdminTokenGeneratorPanel from '../components/AdminTokenGeneratorPanel'

export default function AdminGeneradorTokens() {
  return (
    <>
      <Helmet>
        <title>Generador de Tokens - Admin FOCADES</title>
      </Helmet>
      
      <div className="space-y-6">
        <AdminTokenGeneratorPanel />
      </div>
    </>
  )
}
