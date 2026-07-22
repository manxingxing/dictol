import { RouterProvider } from 'react-router-dom'

import { router } from '@/routes/router'

function App(): React.JSX.Element {
  return <RouterProvider router={router} />
}

export default App
