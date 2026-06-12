import { useEffect, useState } from 'react'

export const usePwaUpdateStatus = () => {
  const [updated, setUpdated] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return undefined
    }

    const handleControllerChange = () => setUpdated(true)
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])

  return updated
}
